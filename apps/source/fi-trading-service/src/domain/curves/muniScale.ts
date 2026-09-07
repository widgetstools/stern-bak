/**
 * The MMD AAA municipal scale.
 *
 * Munis are not quoted off Treasuries directly; they are quoted off a dealer
 * poll, and the relationship to Treasuries is expressed as a RATIO that itself
 * moves. Modelling the ratio rather than a spread is what produces the
 * behaviour a muni desk expects: when Treasuries rally hard, muni yields lag
 * and the ratio falls.
 *
 *   ratio(tau) = a + b * (1 - exp(-tau/18))
 *
 * The other half is stickiness, and it matters more than it looks. MMD is a
 * poll published once a day in whole basis points, and it does not move for
 * every wiggle in Treasuries. Modelling it as a clean function of the UST
 * curve would make the muni book tick as often as the rates book, which is
 * wrong: the scale is unchanged on a third of business days, and the ratio
 * therefore oscillates mechanically on big Treasury days.
 */

import { ouStep, type OuSpec } from './ouProcess.js';

/** Ratio intercept: the front-end muni/Treasury ratio. */
export const MUNI_RATIO_A_SPEC: OuSpec = { kappa: 1.8, theta: 0.55, sigma: 0.1 };
/** Ratio slope: how much the ratio rises out the curve. */
export const MUNI_RATIO_B_SPEC: OuSpec = { kappa: 1.2, theta: 0.4, sigma: 0.12 };
/** Correlation of the ratio intercept with the systematic credit factor. */
export const MUNI_RATIO_CREDIT_CORRELATION = 0.35;

/** Decay controlling how quickly the ratio rises with tenor, in years. */
const RATIO_DECAY = 18;

/** Fraction of a model move the published scale takes on day one. */
export const MMD_PASSTHROUGH = 0.55;
/** The scale only moves when the indicated change reaches this, in percent. */
export const MMD_MOVE_THRESHOLD = 0.02;

export interface MuniRatioState {
  a: number;
  b: number;
}

export function seedMuniRatio(): MuniRatioState {
  return { a: MUNI_RATIO_A_SPEC.theta, b: MUNI_RATIO_B_SPEC.theta };
}

/** Muni/Treasury yield ratio at a tenor. */
export function muniRatio(state: MuniRatioState, tau: number): number {
  return state.a + state.b * (1 - Math.exp(-tau / RATIO_DECAY));
}

export function evolveMuniRatio(
  state: MuniRatioState,
  dt: number,
  za: number,
  zb: number,
): MuniRatioState {
  return {
    a: ouStep(state.a, MUNI_RATIO_A_SPEC, dt, za),
    b: ouStep(state.b, MUNI_RATIO_B_SPEC, dt, zb),
  };
}

/** The tenors the scale is published on. */
export const MMD_KNOTS = [1, 2, 3, 5, 7, 10, 15, 20, 25, 30] as const;

/**
 * Advance the published scale.
 *
 * `previous` may be null on the first day, in which case the model value is
 * taken as published. Otherwise the scale lags by `MMD_PASSTHROUGH`, rounds to
 * the basis point, and stands still when the indicated move is under the
 * threshold — which is why it is unchanged on a large share of days.
 */
export function publishMmdScale(
  previous: Float64Array | null,
  treasuryParYields: readonly number[],
  ratio: MuniRatioState,
): Float64Array {
  const published = new Float64Array(MMD_KNOTS.length);
  for (let i = 0; i < MMD_KNOTS.length; i++) {
    const tau = MMD_KNOTS[i] as number;
    const model = (treasuryParYields[i] ?? 0) * muniRatio(ratio, tau);
    if (previous === null) {
      published[i] = Math.round(model * 100) / 100;
      continue;
    }
    const prior = previous[i] as number;
    const lagged = prior + MMD_PASSTHROUGH * (model - prior);
    published[i] =
      Math.abs(lagged - prior) >= MMD_MOVE_THRESHOLD ? Math.round(lagged * 100) / 100 : prior;
  }
  return published;
}

/** Linear interpolation across the published knots, flat outside them. */
export function mmdYield(scale: Float64Array, tau: number): number {
  const first = MMD_KNOTS[0] as number;
  const last = MMD_KNOTS[MMD_KNOTS.length - 1] as number;
  if (tau <= first) return scale[0] as number;
  if (tau >= last) return scale[scale.length - 1] as number;
  for (let i = 1; i < MMD_KNOTS.length; i++) {
    const hi = MMD_KNOTS[i] as number;
    if (tau > hi) continue;
    const lo = MMD_KNOTS[i - 1] as number;
    const weight = (tau - lo) / (hi - lo);
    return (scale[i - 1] as number) * (1 - weight) + (scale[i] as number) * weight;
  }
  return scale[scale.length - 1] as number;
}

/**
 * De minimis threshold, in points of price.
 *
 * Below `100 - 0.25 * years`, the accretion of a market discount is taxed as
 * ordinary income rather than capital gain, so the market demands a
 * discontinuously higher yield. Bonds do not drift smoothly through this line.
 */
export function deMinimisThreshold(yearsToMaturity: number): number {
  return 100 - 0.25 * yearsToMaturity;
}

const ORDINARY_TAX_RATE = 0.408;
const CAPITAL_GAINS_TAX_RATE = 0.238;

/**
 * The extra yield a discount muni must offer once it breaks the de minimis
 * line, in PERCENT (the unit every other yield in this model uses).
 *
 * Zero above the threshold, then discontinuous: a 10-year at 99.2 pays no
 * penalty and one at 97.0 pays about 7 bp, rising to 19 bp at 92. The market
 * genuinely prices this step, so bonds do not drift smoothly across the line.
 */
export function deMinimisYieldPenalty(
  price: number,
  yearsToMaturity: number,
  modifiedDuration: number,
): number {
  const threshold = deMinimisThreshold(yearsToMaturity);
  if (price >= threshold || modifiedDuration <= 0 || price <= 0) return 0;
  const fraction =
    ((ORDINARY_TAX_RATE - CAPITAL_GAINS_TAX_RATE) * (100 - price)) / (price * modifiedDuration);
  return fraction * 100;
}

/** Yield an investor at `taxRate` would need on a taxable bond to match. */
export function taxableEquivalentYield(muniYield: number, taxRate = ORDINARY_TAX_RATE): number {
  return muniYield / (1 - taxRate);
}
