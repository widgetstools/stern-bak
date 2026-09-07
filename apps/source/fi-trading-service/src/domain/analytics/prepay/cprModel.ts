/**
 * The composite prepayment model and the cashflows it produces.
 *
 * This is the module that makes an MBS behave like an MBS. The chain is
 *
 *     rate shift -> primary mortgage rate -> refi incentive -> CPR
 *                -> cashflows -> price
 *
 * and every link has to be live for the asset class to come out right. Shift
 * only the discount rate and a mortgage prices as a positively convex
 * amortising bond, which is the single most common way synthetic mortgage data
 * gives itself away. Run the bump through the whole chain and negative
 * convexity appears on its own: rates fall, borrowers refinance, the bond
 * shortens, and it gains less than it lost.
 */

import type { DiscountCurve } from '../../curves/discount.js';
import {
  currentCoupon, primaryMortgageRate, refiIncentive, type MortgageRateState,
} from '../../curves/mortgageRates.js';
import { accrueBurnout, burnout } from './burnout.js';
import { collateralMultiplier, type PoolCollateral } from './poolMultipliers.js';
import {
  CURTAILMENT_CPR, INVOLUNTARY_CPR, MAX_CPR, cprToSmm, effectiveIncentive, lockIn, refiCpr,
  seasonality, turnoverCpr,
} from './sCurve.js';

export interface PoolState {
  /** Gross rate the borrowers pay, in percent. */
  weightedAverageCoupon: number;
  /** Rate passed through to the investor, net of guarantee fee and servicing. */
  netCoupon: number;
  /** Months of term remaining. */
  weightedAverageMaturity: number;
  /** Months since origination. */
  weightedAverageLoanAge: number;
  /** Current balance as a fraction of original. Steps monthly, never smoothly. */
  factor: number;
  originalFaceUsd: number;
  collateral: PoolCollateral;
  /** Months this pool has spent refinanceable. Path-dependent by nature. */
  cumulativeInTheMoneyMonths: number;
}

export interface CprInputs {
  /** Rate a borrower is quoted today, in percent. */
  primaryRate: number;
  /** Calendar month, 1-12, for seasonality. */
  month: number;
  /** Best incentive over the trailing quarter, for the media lag. */
  trailingMaxIncentive?: number;
}

/** Annualised prepayment speed for a pool, in CPR. */
export function projectCpr(pool: PoolState, inputs: CprInputs): number {
  const incentive = refiIncentive(pool.weightedAverageCoupon, inputs.primaryRate);
  const effective = effectiveIncentive(incentive, inputs.trailingMaxIncentive ?? incentive);

  const turnover = turnoverCpr(pool.weightedAverageLoanAge) * lockIn(incentive);
  const refinancing =
    refiCpr(effective) *
    burnout(pool.cumulativeInTheMoneyMonths) *
    collateralMultiplier(pool.collateral);

  const voluntary = seasonality(inputs.month) * (turnover + refinancing);
  return Math.min(MAX_CPR, voluntary + INVOLUNTARY_CPR + CURTAILMENT_CPR);
}

/** Level monthly payment amortising `balance` over `months` at `annualRate`. */
export function mortgagePayment(balance: number, annualRatePct: number, months: number): number {
  if (months <= 0) return balance;
  const monthly = annualRatePct / 100 / 12;
  if (monthly <= 0) return balance / months;
  return (balance * monthly) / (1 - (1 + monthly) ** -months);
}

export interface MbsCashflow {
  month: number;
  /** Years from settlement, for discounting. */
  years: number;
  balanceStart: number;
  interest: number;
  scheduledPrincipal: number;
  prepaidPrincipal: number;
  /** Total cash to the investor. */
  amount: number;
  cpr: number;
}

export interface MbsProjectionOptions {
  /** Primary mortgage rate in a given month. Constant unless a path is given. */
  primaryRateAt: (month: number) => number;
  /** Calendar month the projection starts in, 1-12. */
  startMonth: number;
  /** Stop early; defaults to the pool's remaining term. */
  horizonMonths?: number;
  /**
   * Payment delay in days. A UMBS pays on the 25th of the following month, a
   * 24-day lag worth roughly a quarter of a point on a 5.5% coupon.
   */
  paymentDelayDays?: number;
}

/**
 * Monthly cashflows, with prepayment responding to rates along the path.
 *
 * Burnout accumulates as the projection runs, so a path that spends a year in
 * the money slows down the way a real cohort does.
 */
export function projectMbsCashflows(
  pool: PoolState,
  options: MbsProjectionOptions,
): MbsCashflow[] {
  const horizon = Math.min(options.horizonMonths ?? pool.weightedAverageMaturity, pool.weightedAverageMaturity);
  const delayYears = (options.paymentDelayDays ?? 0) / 365;

  let balance = pool.originalFaceUsd * pool.factor;
  let remainingTerm = pool.weightedAverageMaturity;
  let age = pool.weightedAverageLoanAge;
  let cumulativeItm = pool.cumulativeInTheMoneyMonths;
  let trailingMax = -Infinity;

  const flows: MbsCashflow[] = [];
  for (let m = 1; m <= horizon && balance > 1; m++) {
    const primaryRate = options.primaryRateAt(m);
    const incentive = refiIncentive(pool.weightedAverageCoupon, primaryRate);
    trailingMax = m <= 3 ? Math.max(trailingMax, incentive) : Math.max(incentive, trailingMax * 0.85);

    const cpr = projectCpr(
      {
        ...pool,
        weightedAverageLoanAge: age,
        cumulativeInTheMoneyMonths: cumulativeItm,
      },
      {
        primaryRate,
        month: ((options.startMonth - 1 + m - 1) % 12) + 1,
        trailingMaxIncentive: trailingMax,
      },
    );
    const smm = cprToSmm(cpr);

    const payment = mortgagePayment(balance, pool.weightedAverageCoupon, remainingTerm);
    const grossInterest = (balance * pool.weightedAverageCoupon) / 100 / 12;
    const scheduledPrincipal = Math.max(0, Math.min(balance, payment - grossInterest));
    const prepaidPrincipal = Math.max(0, (balance - scheduledPrincipal) * smm);
    const investorInterest = (balance * pool.netCoupon) / 100 / 12;

    flows.push({
      month: m,
      years: m / 12 + delayYears,
      balanceStart: balance,
      interest: investorInterest,
      scheduledPrincipal,
      prepaidPrincipal,
      amount: investorInterest + scheduledPrincipal + prepaidPrincipal,
      cpr,
    });

    balance -= scheduledPrincipal + prepaidPrincipal;
    remainingTerm -= 1;
    age += 1;
    cumulativeItm = accrueBurnout(cumulativeItm, incentive);
  }
  return flows;
}

/** Weighted average life in years — the number a mortgage desk quotes. */
export function weightedAverageLife(flows: readonly MbsCashflow[]): number {
  let weighted = 0;
  let principal = 0;
  for (const flow of flows) {
    const total = flow.scheduledPrincipal + flow.prepaidPrincipal;
    weighted += (flow.month / 12) * total;
    principal += total;
  }
  return principal <= 0 ? 0 : weighted / principal;
}

export interface MbsPricingInputs {
  pool: PoolState;
  curve: DiscountCurve;
  mortgage: MortgageRateState;
  /** Option-adjusted spread in percent. */
  oasPct: number;
  startMonth: number;
  paymentDelayDays?: number;
}

/**
 * Price a pool under a parallel rate shift, per 100 of current face.
 *
 * The shift moves the curve, which moves the primary mortgage rate, which
 * moves the incentive, which moves CPR, which moves the cashflows. Passing
 * this to `effectiveDurationConvexity` is what produces genuine negative
 * convexity rather than an amortising bond's positive convexity.
 */
export function mbsPriceUnderShift(inputs: MbsPricingInputs, shiftPct: number): number {
  const shifted: DiscountCurve = {
    zeroRate: (tau) => inputs.curve.zeroRate(tau) + shiftPct,
    df: (tau) => (tau <= 0 ? 1 : Math.exp((-(inputs.curve.zeroRate(tau) + shiftPct) / 100) * tau)),
    forwardRate: (from, to) => inputs.curve.forwardRate(from, to) + shiftPct,
    parYield: (tau, frequency) => inputs.curve.parYield(tau, frequency) + shiftPct,
  };
  const primaryRate = primaryMortgageRate(shifted, inputs.mortgage);

  const flows = projectMbsCashflows(inputs.pool, {
    primaryRateAt: () => primaryRate,
    startMonth: inputs.startMonth,
    ...(inputs.paymentDelayDays === undefined ? {} : { paymentDelayDays: inputs.paymentDelayDays }),
  });

  const currentFace = inputs.pool.originalFaceUsd * inputs.pool.factor;
  if (currentFace <= 0) return 0;

  let value = 0;
  for (const flow of flows) {
    const discountRate = shifted.zeroRate(flow.years) + inputs.oasPct;
    value += flow.amount * Math.exp((-discountRate / 100) * flow.years);
  }
  return (value / currentFace) * 100;
}

/** The OAS that reprices a pool to a market price. Bisection, monotone. */
export function mbsOasFromPrice(
  inputs: Omit<MbsPricingInputs, 'oasPct'>,
  targetPrice: number,
  tolerance = 1e-7,
): number {
  let low = -5;
  let high = 25;
  for (let i = 0; i < 200; i++) {
    const mid = (low + high) / 2;
    const price = mbsPriceUnderShift({ ...inputs, oasPct: mid }, 0);
    if (Math.abs(price - targetPrice) < tolerance) return mid;
    if (price > targetPrice) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** Current coupon of the agency market, for pricing a pool against TBA. */
export function poolMoneyness(
  pool: PoolState,
  curve: DiscountCurve,
  mortgage: MortgageRateState,
): number {
  return pool.netCoupon - currentCoupon(curve, mortgage);
}
