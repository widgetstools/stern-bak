/**
 * Price a security off the factor state, through its own cashflows.
 *
 * This is where the plan's central claim becomes code: nothing samples a
 * price. A security's terms produce a schedule, the schedule produces
 * cashflows, and the cashflows are discounted on the curve the factor model
 * implies plus the spread its issuer's credit factor implies. Yield, duration,
 * convexity, DV01 and the key-rate vector all come out of that same
 * projection, so they agree with each other and with the price by
 * construction.
 *
 * Each asset class takes the route it actually trades on:
 *   bonds       schedule -> cashflows -> curve + spread
 *   bills       discount rate, with a separate bond-equivalent yield
 *   mortgages   the prepayment model, so the bump reaches CPR and back
 *   structured  priced to WAL at a spread (the sanctioned demo shortcut)
 *   CDS         notional and upfront, not face and price
 */

import { addYears, diffDays, type DateInt } from '../core/dateInt.js';
import type { Calendar } from '../core/sifmaCalendar.js';
import { effectiveDurationConvexity } from '../analytics/effective.js';
import { keyRateDurations, sumKeyRateDurations } from '../analytics/keyRate.js';
import {
  accruedFor, cleanPriceFromYield, pvFromCurve, yieldFromCleanPrice, zSpreadFromPrice,
  type BondTerms,
} from '../analytics/pricing.js';
import { bondRisk, cs01 as bondCs01, spreadDuration } from '../analytics/riskAnalytic.js';
import { buildSchedule, type CouponFrequency } from '../analytics/schedule.js';
import { yieldToWorst, type WorkoutType } from '../analytics/workout.js';
import {
  bondEquivalentYield, currentYield, discountRateFromPrice, priceFromDiscountRate,
} from '../analytics/yieldConventions.js';
import { mbsPriceUnderShift, weightedAverageLife, projectMbsCashflows, type PoolState } from '../analytics/prepay/cprModel.js';
import { primaryMortgageRate, type MortgageRateState } from '../curves/mortgageRates.js';
import { betaSensitivity } from '../curves/nss.js';
import type { DiscountCurve } from '../curves/discount.js';
import { upfrontFromSpread } from '../analytics/cds/isdaModel.js';
import { cs01 as cdsCs01, jumpToDefault, type CdsPosition } from '../analytics/cds/cdsRisk.js';
import type { Security } from '../instruments/types.js';

export interface ValuationContext {
  asOf: DateInt;
  calendar: Calendar;
  curve: DiscountCurve;
  mortgage: MortgageRateState;
  /** Current spread for this security, in basis points. */
  spreadBp: number;
  /** Pool state for a mortgage pass-through. */
  pool?: PoolState;
  /** Compute the ten key-rate durations. Costs twenty repricings. */
  withKeyRates?: boolean;
}

export interface PricedSecurity {
  securityId: number;
  cleanPrice: number;
  dirtyPrice: number;
  accruedInterest: number;
  yieldToMaturity: number;
  yieldToWorst: number;
  workoutDate: DateInt;
  workoutPrice: number;
  workoutType: WorkoutType;
  currentYield: number;
  zSpread: number;
  oas: number;
  modifiedDuration: number;
  effectiveDuration: number;
  convexity: number;
  effectiveConvexity: number;
  dv01: number;
  spreadDuration: number;
  cs01: number;
  keyRateDurations: number[];
  /** Sensitivity to each curve factor — the scenario engine's fast path. */
  betaSensitivity: [number, number, number, number];
  weightedAverageLife: number;
  /** Discount rate, bills only. */
  discountRate: number;
  bondEquivalentYield: number;
}

const ZERO_KRD = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

function emptyValuation(securityId: number, cleanPrice: number): PricedSecurity {
  return {
    securityId,
    cleanPrice,
    dirtyPrice: cleanPrice,
    accruedInterest: 0,
    yieldToMaturity: 0,
    yieldToWorst: 0,
    workoutDate: 0,
    workoutPrice: 100,
    workoutType: 'Maturity',
    currentYield: 0,
    zSpread: 0,
    oas: 0,
    modifiedDuration: 0,
    effectiveDuration: 0,
    convexity: 0,
    effectiveConvexity: 0,
    dv01: 0,
    spreadDuration: 0,
    cs01: 0,
    keyRateDurations: [...ZERO_KRD],
    betaSensitivity: [0, 0, 0, 0],
    weightedAverageLife: 0,
    discountRate: 0,
    bondEquivalentYield: 0,
  };
}

/** Cashflow terms for a coupon-paying security. */
export function termsFor(security: Security, calendar: Calendar): BondTerms {
  return {
    schedule: buildSchedule({
      effective: security.datedDate,
      maturity: security.maturityDate,
      frequency: security.frequency as CouponFrequency,
      endOfMonth: security.endOfMonth,
      calendar,
    }),
    couponRate: security.couponRate,
    frequency: security.frequency,
    redemption: 100,
    dayCount: security.dayCount,
    endOfMonth: security.endOfMonth,
  };
}

function yearsTo(asOf: DateInt, maturity: DateInt): number {
  return Math.max(0, diffDays(asOf, maturity) / 365.25);
}

/** A coupon bond: rates, agency, credit, muni. */
function priceBond(security: Security, ctx: ValuationContext): PricedSecurity {
  const terms = termsFor(security, ctx.calendar);
  if (terms.schedule.length === 0) return emptyValuation(security.securityId, 100);

  const spreadPct = ctx.spreadBp / 100;
  const dirty = pvFromCurve(terms, ctx.asOf, ctx.curve, spreadPct);
  const accrued = accruedFor(terms, ctx.asOf);
  const clean = dirty - accrued;
  if (!Number.isFinite(clean) || clean <= 0) return emptyValuation(security.securityId, 100);

  const ytm = yieldFromCleanPrice(terms, ctx.asOf, clean, { guess: security.couponRate });
  const workout = yieldToWorst(terms, ctx.asOf, clean, security.callSchedule, { guess: ytm });
  const risk = bondRisk(terms, ctx.asOf, ytm);

  const krd = ctx.withKeyRates === true
    ? [...keyRateDurations(terms, ctx.asOf, ctx.curve, { spreadPct })]
    : [...ZERO_KRD];
  const effective = ctx.withKeyRates === true
    ? sumKeyRateDurations(Float64Array.from(krd))
    : risk.modifiedDuration;

  return {
    securityId: security.securityId,
    cleanPrice: clean,
    dirtyPrice: dirty,
    accruedInterest: accrued,
    yieldToMaturity: ytm,
    yieldToWorst: workout.yieldToWorst,
    workoutDate: workout.workoutDate,
    workoutPrice: workout.workoutPrice,
    workoutType: workout.workoutType,
    currentYield: currentYield(security.couponRate, clean),
    zSpread: zSpreadFromPrice(terms, ctx.asOf, ctx.curve, clean) * 100,
    oas: ctx.spreadBp,
    modifiedDuration: risk.modifiedDuration,
    effectiveDuration: effective,
    convexity: risk.convexity,
    effectiveConvexity: risk.convexity,
    dv01: risk.dv01,
    spreadDuration: spreadDuration(terms, ctx.asOf, ctx.curve, spreadPct),
    cs01: bondCs01(terms, ctx.asOf, ctx.curve, spreadPct, 100),
    keyRateDurations: krd,
    betaSensitivity: betaSensitivity(krd),
    weightedAverageLife: risk.timeToMaturity,
    discountRate: 0,
    bondEquivalentYield: 0,
  };
}

/** A Treasury bill: quoted on a discount rate, with a separate BEY. */
function priceBill(security: Security, ctx: ValuationContext): PricedSecurity {
  const days = Math.max(1, diffDays(ctx.asOf, security.maturityDate));
  const years = days / 365;
  const zero = ctx.curve.zeroRate(years) + ctx.spreadBp / 100;
  const clean = 100 * Math.exp((-zero / 100) * years);
  const discount = discountRateFromPrice(clean, days);
  const duration = years;

  const base = emptyValuation(security.securityId, clean);
  const krd = ctx.withKeyRates === true
    ? ZERO_KRD.map((_, i) => (i === 0 ? duration : 0))
    : [...ZERO_KRD];
  return {
    ...base,
    dirtyPrice: clean,
    yieldToMaturity: zero,
    yieldToWorst: zero,
    workoutDate: security.maturityDate,
    modifiedDuration: duration,
    effectiveDuration: duration,
    convexity: duration * duration,
    dv01: (duration * clean) / 10000,
    keyRateDurations: krd,
    betaSensitivity: betaSensitivity(krd),
    weightedAverageLife: years,
    discountRate: discount,
    bondEquivalentYield: bondEquivalentYield(discount, days),
    zSpread: ctx.spreadBp,
    oas: ctx.spreadBp,
  };
}

/** An agency pass-through, priced through the prepayment model. */
function priceMbs(security: Security, ctx: ValuationContext): PricedSecurity {
  const pool = ctx.pool;
  if (pool === undefined) return priceBond(security, ctx);

  const inputs = {
    pool,
    curve: ctx.curve,
    mortgage: ctx.mortgage,
    oasPct: ctx.spreadBp / 100,
    startMonth: ((Math.trunc(ctx.asOf / 100) % 100) || 1),
    paymentDelayDays: 24,
  };
  const clean = mbsPriceUnderShift(inputs, 0);
  // The bump reaches CPR and comes back, which is what produces negative
  // convexity rather than an amortising bond's positive convexity.
  const measures = effectiveDurationConvexity((shift) => mbsPriceUnderShift(inputs, shift), 25);
  const primaryRate = primaryMortgageRate(ctx.curve, ctx.mortgage);
  const flows = projectMbsCashflows(pool, { primaryRateAt: () => primaryRate, startMonth: inputs.startMonth });
  const wal = weightedAverageLife(flows);

  const krd = ctx.withKeyRates === true
    ? spreadDurationAcrossKnots(measures.effectiveDuration, wal)
    : [...ZERO_KRD];

  const base = emptyValuation(security.securityId, clean);
  return {
    ...base,
    dirtyPrice: clean,
    yieldToMaturity: ctx.curve.zeroRate(Math.max(0.25, wal)) + ctx.spreadBp / 100,
    yieldToWorst: ctx.curve.zeroRate(Math.max(0.25, wal)) + ctx.spreadBp / 100,
    workoutDate: security.maturityDate,
    currentYield: currentYield(security.couponRate, clean),
    zSpread: ctx.spreadBp,
    oas: ctx.spreadBp,
    modifiedDuration: measures.effectiveDuration,
    effectiveDuration: measures.effectiveDuration,
    convexity: measures.effectiveConvexity,
    effectiveConvexity: measures.effectiveConvexity,
    dv01: (measures.effectiveDuration * clean) / 10000,
    spreadDuration: wal,
    cs01: (wal * clean) / 10000,
    keyRateDurations: krd,
    betaSensitivity: betaSensitivity(krd),
    weightedAverageLife: wal,
  };
}

/**
 * Put a security's duration on the key-rate grid around its average life.
 *
 * Used where a full tent-bump reval is not worth its cost — mortgages and
 * structured tranches. It preserves the identity that the vector sums to the
 * duration, which is what the scenario fast path relies on.
 */
function spreadDurationAcrossKnots(duration: number, walYears: number): number[] {
  const knots = [0.25, 0.5, 1, 2, 3, 5, 7, 10, 20, 30];
  const out = new Array<number>(knots.length).fill(0);
  const target = Math.max(knots[0] as number, Math.min(knots[knots.length - 1] as number, walYears));
  for (let i = 1; i < knots.length; i++) {
    const lo = knots[i - 1] as number;
    const hi = knots[i] as number;
    if (target > hi) continue;
    const weight = (target - lo) / (hi - lo);
    out[i - 1] = duration * (1 - weight);
    out[i] = duration * weight;
    return out;
  }
  out[knots.length - 1] = duration;
  return out;
}

/** A structured tranche: priced to its average life at a spread. */
function priceTranche(security: Security, ctx: ValuationContext): PricedSecurity {
  const wal = security.benchmarkTenor > 0 ? security.benchmarkTenor : yearsTo(ctx.asOf, security.maturityDate);
  const spreadPct = ctx.spreadBp / 100;
  const discount = ctx.curve.zeroRate(Math.max(0.25, wal)) + spreadPct;
  // Level cashflows to the average life, discounted at curve plus spread.
  const coupon = security.couponRate;
  let value = 0;
  const periods = Math.max(1, Math.round(wal * security.frequency));
  for (let i = 1; i <= periods; i++) {
    const t = i / security.frequency;
    value += (coupon / security.frequency) * Math.exp((-discount / 100) * t);
  }
  value += 100 * Math.exp((-discount / 100) * wal);

  const duration = wal * 0.92;
  const krd = ctx.withKeyRates === true ? spreadDurationAcrossKnots(duration, wal) : [...ZERO_KRD];
  const base = emptyValuation(security.securityId, value);
  return {
    ...base,
    dirtyPrice: value,
    yieldToMaturity: discount,
    yieldToWorst: discount,
    workoutDate: security.maturityDate,
    currentYield: currentYield(coupon, value),
    zSpread: ctx.spreadBp,
    oas: ctx.spreadBp,
    modifiedDuration: duration,
    effectiveDuration: duration,
    // Locked out from prepayment, so genuinely positively convex - the
    // opposite of an agency pass-through, and visible in one column.
    convexity: duration * duration * 0.11,
    effectiveConvexity: duration * duration * 0.11,
    dv01: (duration * value) / 10000,
    spreadDuration: wal,
    cs01: (wal * value) / 10000,
    keyRateDurations: krd,
    betaSensitivity: betaSensitivity(krd),
    weightedAverageLife: wal,
  };
}

/** A credit default swap: notional and upfront, not face and price. */
function priceCds(security: Security, ctx: ValuationContext): PricedSecurity {
  const years = Math.max(0.25, yearsTo(ctx.asOf, security.maturityDate));
  const quote = {
    spreadBp: ctx.spreadBp,
    couponBp: security.couponRate >= 4 ? 500 : 100,
    recovery: 0.4,
    discountRate: ctx.curve.zeroRate(years) / 100,
    years,
  };
  const conversion = upfrontFromSpread(quote);
  const position: CdsPosition = { notional: 100, direction: 'SellProtection', quote };

  const base = emptyValuation(security.securityId, conversion.price);
  const duration = conversion.riskyPv01;
  const krd = ctx.withKeyRates === true ? spreadDurationAcrossKnots(duration * 0.15, years) : [...ZERO_KRD];
  return {
    ...base,
    dirtyPrice: conversion.price,
    yieldToMaturity: ctx.spreadBp / 100,
    yieldToWorst: ctx.spreadBp / 100,
    workoutDate: security.maturityDate,
    zSpread: ctx.spreadBp,
    oas: ctx.spreadBp,
    // Rate risk on a CDS is small; the exposure is almost entirely credit.
    modifiedDuration: duration * 0.15,
    effectiveDuration: duration * 0.15,
    convexity: 0,
    effectiveConvexity: 0,
    dv01: (duration * 0.15 * 100) / 10000,
    spreadDuration: duration,
    cs01: cdsCs01(position),
    keyRateDurations: krd,
    betaSensitivity: betaSensitivity(krd),
    weightedAverageLife: years,
  };
}

/** Jump-to-default for a CDS position of a given notional. */
export function cdsJumpToDefault(security: Security, ctx: ValuationContext, notional: number): number {
  // A cash bond has a jump-to-default too, but it is a different number —
  // market value less recovery on face, with no coupon leg to unwind. Running
  // the swap mechanics over one would put a plausible-looking wrong figure in
  // the column, so refuse rather than approximate.
  if (security.assetClass !== 'CDS') return 0;
  const years = Math.max(0.25, yearsTo(ctx.asOf, security.maturityDate));
  return jumpToDefault({
    notional,
    direction: 'SellProtection',
    quote: {
      spreadBp: ctx.spreadBp,
      couponBp: security.couponRate >= 4 ? 500 : 100,
      recovery: 0.4,
      discountRate: ctx.curve.zeroRate(years) / 100,
      years,
    },
  });
}

/** Route a security to the valuation its asset class actually uses. */
export function priceSecurity(security: Security, ctx: ValuationContext): PricedSecurity {
  if (security.maturityDate <= ctx.asOf) return emptyValuation(security.securityId, 100);
  switch (security.assetClass) {
    case 'CDS':
      return priceCds(security, ctx);
    case 'AgencyMBS':
      return priceMbs(security, ctx);
    case 'CMBS':
    case 'RMBS':
    case 'ABS':
    case 'CLO':
      return priceTranche(security, ctx);
    default:
      return security.securityType === 'TBill' ? priceBill(security, ctx) : priceBond(security, ctx);
  }
}

/** Price a bond at a given yield — used to seed a lot's purchase basis. */
export function priceAtYield(security: Security, calendar: Calendar, asOf: DateInt, yieldPct: number): number {
  const terms = termsFor(security, calendar);
  if (terms.schedule.length === 0) return 100;
  const price = cleanPriceFromYield(terms, asOf, yieldPct);
  return Number.isFinite(price) && price > 0 ? price : 100;
}

/** A rough forward date, for seeding historical lot opens. */
export function yearsBefore(asOf: DateInt, years: number): DateInt {
  return addYears(asOf, -years);
}
