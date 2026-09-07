/**
 * Mortgage rates: current coupon, and the rate a borrower is actually offered.
 *
 * The chain that matters for prepayment is
 *
 *   current coupon = blend of the 5- and 10-year Treasury + CC spread
 *   primary rate   = current coupon + guarantee fee + minimum servicing
 *                    + primary/secondary spread
 *
 * and prepayment responds to the PRIMARY rate, not to Treasuries. Skipping the
 * intermediate steps is the usual shortcut and it breaks the refi incentive by
 * over a hundred basis points, which moves modelled CPR by a factor of three
 * in the steep part of the S-curve.
 */

import { ouStep, type OuSpec } from './ouProcess.js';
import type { DiscountCurve } from './discount.js';

/** Spread of the agency current coupon over the 5s10s Treasury blend. */
export const CURRENT_COUPON_SPREAD_SPEC: OuSpec = { kappa: 2.0, theta: 1.35, sigma: 0.45 };

/**
 * Primary/secondary spread — originator margin and capacity.
 *
 * theta is 0.35 rather than the 0.55 a first pass suggests: with the guarantee
 * fee and minimum servicing below, 0.55 puts the borrower rate 126 bp over the
 * current coupon, and the observed primary/secondary gap is nearer 105. The
 * difference is a full percent of CPR in the steep part of the S-curve.
 */
export const PRIMARY_SECONDARY_SPEC: OuSpec = { kappa: 1.5, theta: 0.35, sigma: 0.15 };

/** Agency guarantee fee, in percent. */
export const GUARANTEE_FEE = 0.46;
/** Minimum servicing retained by the originator, in percent. */
export const MINIMUM_SERVICING = 0.25;

export interface MortgageRateState {
  /** Current-coupon spread over the Treasury blend, in percent. */
  currentCouponSpread: number;
  /** Primary/secondary spread, in percent. */
  primarySecondarySpread: number;
}

export function seedMortgageRates(): MortgageRateState {
  return {
    currentCouponSpread: CURRENT_COUPON_SPREAD_SPEC.theta,
    primarySecondarySpread: PRIMARY_SECONDARY_SPEC.theta,
  };
}

export function evolveMortgageRates(
  state: MortgageRateState,
  dt: number,
  zCc: number,
  zPs: number,
): MortgageRateState {
  return {
    currentCouponSpread: ouStep(state.currentCouponSpread, CURRENT_COUPON_SPREAD_SPEC, dt, zCc),
    primarySecondarySpread: ouStep(state.primarySecondarySpread, PRIMARY_SECONDARY_SPEC, dt, zPs),
  };
}

/** Agency current coupon, in percent. */
export function currentCoupon(curve: DiscountCurve, state: MortgageRateState): number {
  const blend = 0.5 * curve.zeroRate(5) + 0.5 * curve.zeroRate(10);
  return blend + state.currentCouponSpread;
}

/** The rate a borrower is quoted, in percent. This is what drives refis. */
export function primaryMortgageRate(curve: DiscountCurve, state: MortgageRateState): number {
  return (
    currentCoupon(curve, state) + GUARANTEE_FEE + MINIMUM_SERVICING + state.primarySecondarySpread
  );
}

/**
 * Refi incentive: how far in the money a borrower's coupon is, in percent.
 * Positive means the pool's rate is above what is available now.
 */
export function refiIncentive(weightedAverageCoupon: number, primaryRate: number): number {
  return weightedAverageCoupon - primaryRate;
}
