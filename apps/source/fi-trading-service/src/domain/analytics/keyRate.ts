/**
 * Key-rate durations, by tent-basis bumps.
 *
 * Each knot owns a triangular weight that is 1 at its own knot and falls
 * linearly to 0 at its neighbours; the first and last extend flat to the ends.
 * The tents therefore form a PARTITION OF UNITY — they sum to exactly 1 at
 * every tenor — which gives the identity that makes this module worth testing:
 *
 *     sum of key-rate durations  ==  effective duration
 *
 * That single assertion catches curve-interpolation errors, tent-basis errors,
 * sign errors and stale-cashflow errors at once, which is why it is asserted
 * for every security rather than spot-checked.
 */

import type { DateInt } from '../core/dateInt.js';
import type { DiscountCurve } from '../curves/discount.js';
import { KRD_KNOTS } from '../curves/nss.js';
import { pvFromCurve, type BondTerms } from './pricing.js';

export { KRD_KNOTS };

/**
 * Weight knot `index` puts on tenor `tau`.
 *
 * Flat extension outside the knot range is deliberate: without it the tents
 * would sum to less than 1 beyond the ends and the KRD identity would fail
 * for very short and very long securities.
 */
export function tentWeight(tau: number, index: number): number {
  const knots = KRD_KNOTS;
  const last = knots.length - 1;
  const here = knots[index] as number;

  if (index === 0) {
    if (tau <= here) return 1;
    const next = knots[1] as number;
    return tau >= next ? 0 : (next - tau) / (next - here);
  }
  if (index === last) {
    if (tau >= here) return 1;
    const previous = knots[last - 1] as number;
    return tau <= previous ? 0 : (tau - previous) / (here - previous);
  }
  const previous = knots[index - 1] as number;
  const next = knots[index + 1] as number;
  if (tau <= previous || tau >= next) return 0;
  return tau <= here ? (tau - previous) / (here - previous) : (next - tau) / (next - here);
}

/** A curve with a tent-shaped bump added at one knot. */
export function tentBumpedCurve(base: DiscountCurve, index: number, bumpPct: number): DiscountCurve {
  const shift = (tau: number): number => bumpPct * tentWeight(tau, index);
  return {
    zeroRate: (tau) => base.zeroRate(tau) + shift(tau),
    df: (tau) => (tau <= 0 ? 1 : Math.exp((-(base.zeroRate(tau) + shift(tau)) / 100) * tau)),
    forwardRate: (from, to) => base.forwardRate(from, to) + shift(to),
    parYield: (tau, frequency) => base.parYield(tau, frequency) + shift(tau),
  };
}

/** A curve shifted in parallel. */
export function parallelBumpedCurve(base: DiscountCurve, bumpPct: number): DiscountCurve {
  return {
    zeroRate: (tau) => base.zeroRate(tau) + bumpPct,
    df: (tau) => (tau <= 0 ? 1 : Math.exp((-(base.zeroRate(tau) + bumpPct) / 100) * tau)),
    forwardRate: (from, to) => base.forwardRate(from, to) + bumpPct,
    parYield: (tau, frequency) => base.parYield(tau, frequency) + bumpPct,
  };
}

export interface KeyRateOptions {
  spreadPct?: number;
  bumpBp?: number;
}

/** Key-rate durations, one per knot, in years. */
export function keyRateDurations(
  terms: BondTerms,
  settle: DateInt,
  curve: DiscountCurve,
  options: KeyRateOptions = {},
): Float64Array {
  const spread = options.spreadPct ?? 0;
  const bumpBp = options.bumpBp ?? 1;
  const bumpPct = bumpBp / 100;
  const base = pvFromCurve(terms, settle, curve, spread);
  const out = new Float64Array(KRD_KNOTS.length);
  if (base <= 0) return out;

  for (let index = 0; index < KRD_KNOTS.length; index++) {
    const up = pvFromCurve(terms, settle, tentBumpedCurve(curve, index, bumpPct), spread);
    const down = pvFromCurve(terms, settle, tentBumpedCurve(curve, index, -bumpPct), spread);
    out[index] = -(up - down) / (2 * base * (bumpBp / 10000));
  }
  return out;
}

/** Effective duration from a parallel curve bump. */
export function effectiveDurationFromCurve(
  terms: BondTerms,
  settle: DateInt,
  curve: DiscountCurve,
  options: KeyRateOptions = {},
): number {
  const spread = options.spreadPct ?? 0;
  const bumpBp = options.bumpBp ?? 1;
  const bumpPct = bumpBp / 100;
  const base = pvFromCurve(terms, settle, curve, spread);
  if (base <= 0) return 0;
  const up = pvFromCurve(terms, settle, parallelBumpedCurve(curve, bumpPct), spread);
  const down = pvFromCurve(terms, settle, parallelBumpedCurve(curve, -bumpPct), spread);
  return -(up - down) / (2 * base * (bumpBp / 10000));
}

export function sumKeyRateDurations(krd: Float64Array): number {
  let total = 0;
  for (const value of krd) total += value;
  return total;
}
