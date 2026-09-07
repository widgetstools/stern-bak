/**
 * Cashflow projection and price/yield conversion.
 *
 * Time is measured in COUPON PERIODS from settlement, not in years: the first
 * cashflow sits `w` periods away, where `w` is the unelapsed fraction of the
 * current coupon period, and each subsequent one adds exactly one. That is the
 * street formula, and it is why a bond priced between coupons comes out to the
 * price a dealer would actually quote.
 *
 * Two conventions. `Compound` discounts every flow including the last.
 * `Street` uses SIMPLE interest once only one payment remains, which is what
 * Bloomberg's YAS and most US desks quote — invisible on a ten-year bond,
 * material on one maturing next month.
 */

import type { DateInt } from '../core/dateInt.js';
import { yearFraction, type DayCountConvention } from '../core/dayCount.js';
import type { DiscountCurve } from '../curves/discount.js';
import { accrualFraction, accruedInterest } from './accrued.js';
import { remainingPeriods, type Period } from './schedule.js';

export type YieldConvention = 'Compound' | 'Street';

export interface BondTerms {
  schedule: readonly Period[];
  /** Annual coupon rate in percent. Zero for a strip. */
  couponRate: number;
  frequency: number;
  /** Redemption amount, in the same units as `face`. */
  redemption: number;
  dayCount: DayCountConvention;
  endOfMonth?: boolean;
  /** Face value. Defaults to 100, so prices come out per 100. */
  face?: number;
}

export interface Cashflow {
  date: DateInt;
  /** Time from settlement, in coupon periods. */
  periods: number;
  /** Time from settlement in years, for curve discounting. */
  years: number;
  amount: number;
  principal: number;
}

function faceOf(terms: BondTerms): number {
  return terms.face ?? 100;
}

function accrualInput(terms: BondTerms) {
  return {
    schedule: terms.schedule,
    couponRate: terms.couponRate,
    frequency: terms.frequency,
    dayCount: terms.dayCount,
    face: faceOf(terms),
    ...(terms.endOfMonth === undefined ? {} : { endOfMonth: terms.endOfMonth }),
  };
}

/** Interest paid for one period, prorated for a stub. */
export function periodCoupon(terms: BondTerms, period: Period): number {
  const fraction = yearFraction(terms.dayCount, period.accrualStart, period.accrualEnd, {
    periodStart: period.accrualStart,
    periodEnd: period.accrualEnd,
    frequency: terms.frequency,
    endOfMonth: terms.endOfMonth ?? true,
  });
  return (terms.couponRate / 100) * fraction * faceOf(terms);
}

export interface ProjectionOptions {
  /** Redeem early, e.g. at a call date. Defaults to maturity. */
  redeemOn?: DateInt;
  /** Redemption price per 100 of face. Defaults to the terms' redemption. */
  redeemAt?: number;
}

/** Every cashflow a buyer settling on `settle` receives. */
export function projectCashflows(
  terms: BondTerms,
  settle: DateInt,
  options: ProjectionOptions = {},
): Cashflow[] {
  const redeemOn = options.redeemOn ?? null;
  const periods = remainingPeriods(terms.schedule, settle).filter(
    (period) => redeemOn === null || period.accrualStart < redeemOn,
  );
  if (periods.length === 0) return [];

  const unelapsed = 1 - accrualFraction(accrualInput(terms), settle);
  const face = faceOf(terms);
  const redemption =
    options.redeemAt === undefined ? terms.redemption : (options.redeemAt / 100) * face;

  const flows: Cashflow[] = [];
  for (let i = 0; i < periods.length; i++) {
    const period = periods[i] as Period;
    const last = i === periods.length - 1;
    const timeInPeriods = unelapsed + i;
    flows.push({
      date: redeemOn !== null && last ? redeemOn : period.accrualEnd,
      periods: timeInPeriods,
      years: timeInPeriods / terms.frequency,
      amount: periodCoupon(terms, period) + (last ? redemption : 0),
      principal: last ? redemption : 0,
    });
  }
  return flows;
}

/** Dirty price from a yield, in percent. */
export function dirtyPriceFromFlows(
  flows: readonly Cashflow[],
  yieldPct: number,
  frequency: number,
  convention: YieldConvention = 'Street',
): number {
  if (flows.length === 0) return 0;
  const periodic = yieldPct / 100 / frequency;
  if (convention === 'Street' && flows.length === 1) {
    const only = flows[0] as Cashflow;
    return only.amount / (1 + periodic * only.periods);
  }
  let value = 0;
  for (const flow of flows) value += flow.amount * (1 + periodic) ** -flow.periods;
  return value;
}

export function dirtyPriceFromYield(
  terms: BondTerms,
  settle: DateInt,
  yieldPct: number,
  options: ProjectionOptions & { convention?: YieldConvention } = {},
): number {
  const flows = projectCashflows(terms, settle, options);
  return dirtyPriceFromFlows(flows, yieldPct, terms.frequency, options.convention ?? 'Street');
}

export function accruedFor(terms: BondTerms, settle: DateInt): number {
  return accruedInterest(accrualInput(terms), settle);
}

export function cleanPriceFromYield(
  terms: BondTerms,
  settle: DateInt,
  yieldPct: number,
  options: ProjectionOptions & { convention?: YieldConvention } = {},
): number {
  return dirtyPriceFromYield(terms, settle, yieldPct, options) - accruedFor(terms, settle);
}

/** Derivative of dirty price with respect to yield, per percentage point. */
export function dirtyPriceDerivative(
  flows: readonly Cashflow[],
  yieldPct: number,
  frequency: number,
): number {
  const periodic = yieldPct / 100 / frequency;
  let derivative = 0;
  for (const flow of flows) {
    derivative -= (flow.periods / frequency) * flow.amount * (1 + periodic) ** (-flow.periods - 1);
  }
  return derivative / 100;
}

export interface YieldSolveOptions extends ProjectionOptions {
  convention?: YieldConvention;
  /** Starting guess in percent. Yesterday's yield converges in 3 iterations. */
  guess?: number;
  tolerance?: number;
  maxIterations?: number;
}

/**
 * Yield from a clean price.
 *
 * Newton with the analytic derivative, seeded from a guess. Falls back to
 * bisection when the derivative flattens or Newton wanders — which happens on
 * deep-discount bonds and on the degenerate single-flow case, where quietly
 * returning a diverged value would be much worse than being slow.
 */
export function yieldFromCleanPrice(
  terms: BondTerms,
  settle: DateInt,
  cleanPrice: number,
  options: YieldSolveOptions = {},
): number {
  const flows = projectCashflows(terms, settle, options);
  if (flows.length === 0) return 0;
  const convention = options.convention ?? 'Street';
  const target = cleanPrice + accruedFor(terms, settle);
  const tolerance = options.tolerance ?? 1e-10;
  const maxIterations = options.maxIterations ?? 60;

  let yieldPct = options.guess ?? Math.max(0.01, terms.couponRate);
  for (let i = 0; i < maxIterations; i++) {
    const price = dirtyPriceFromFlows(flows, yieldPct, terms.frequency, convention);
    const diff = price - target;
    if (Math.abs(diff) < tolerance) return yieldPct;
    const derivative = dirtyPriceDerivative(flows, yieldPct, terms.frequency);
    if (!Number.isFinite(derivative) || Math.abs(derivative) < 1e-12) break;
    const next = yieldPct - diff / derivative;
    if (!Number.isFinite(next) || next <= -100 * terms.frequency) break;
    if (Math.abs(next - yieldPct) < tolerance) return next;
    yieldPct = next;
  }
  return bisectYield(flows, target, terms.frequency, convention, tolerance);
}

function bisectYield(
  flows: readonly Cashflow[],
  target: number,
  frequency: number,
  convention: YieldConvention,
  tolerance: number,
): number {
  const priceAt = (y: number): number => dirtyPriceFromFlows(flows, y, frequency, convention);
  let low = -50;
  let high = 500;
  if (priceAt(low) < target) return low;
  if (priceAt(high) > target) return high;
  for (let i = 0; i < 300; i++) {
    const mid = (low + high) / 2;
    const price = priceAt(mid);
    if (Math.abs(price - target) < tolerance) return mid;
    // Price falls as yield rises.
    if (price > target) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** Present value off a curve plus a constant spread, per `face`. */
export function pvFromCurve(
  terms: BondTerms,
  settle: DateInt,
  curve: DiscountCurve,
  spreadPct = 0,
  options: ProjectionOptions = {},
): number {
  const flows = projectCashflows(terms, settle, options);
  let value = 0;
  for (const flow of flows) {
    value += flow.amount * Math.exp((-(curve.zeroRate(flow.years) + spreadPct) / 100) * flow.years);
  }
  return value;
}

/**
 * The constant spread over the curve that reprices the bond to `cleanPrice`.
 *
 * Bisection rather than Newton: present value is monotone in the spread, and
 * this runs once per security per full revaluation rather than on the tick
 * path, so robustness beats speed.
 */
export function zSpreadFromPrice(
  terms: BondTerms,
  settle: DateInt,
  curve: DiscountCurve,
  cleanPrice: number,
  tolerance = 1e-9,
): number {
  const target = cleanPrice + accruedFor(terms, settle);
  let low = -20;
  let high = 100;
  for (let i = 0; i < 300; i++) {
    const mid = (low + high) / 2;
    const value = pvFromCurve(terms, settle, curve, mid);
    if (Math.abs(value - target) < tolerance) return mid;
    if (value > target) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}
