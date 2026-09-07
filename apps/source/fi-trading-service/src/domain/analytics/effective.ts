/**
 * Effective duration and convexity, by repricing under a shifted curve.
 *
 * Deliberately generic: it takes a REPRICING FUNCTION rather than a bond. For
 * a bullet the analytic measures already agree, so this adds little. For a
 * mortgage it is the whole game — the bump has to flow all the way through
 *
 *     rate shift -> primary mortgage rate -> refi incentive -> CPR
 *                -> cashflows -> price
 *
 * and only then does the negative convexity that defines the asset class
 * appear. Shifting the discount rate alone leaves an MBS positively convex,
 * which is the single most common way a synthetic mortgage dataset gives
 * itself away. Passing a closure keeps that path open without this module
 * knowing anything about prepayment.
 */

export interface EffectiveMeasures {
  /** Years. Negative for interest-only strips. */
  effectiveDuration: number;
  /** Years squared. Negative for premium mortgages. */
  effectiveConvexity: number;
  basePrice: number;
  upPrice: number;
  downPrice: number;
}

/**
 * `reprice(shiftPct)` returns the price under a parallel shift given in
 * PERCENT, so 25 bp is 0.25.
 *
 * The default bump is 25 bp rather than 1 bp: for a convex instrument a
 * 1 bp bump is dominated by floating-point noise in the second difference,
 * and for a mortgage it is too small to move the prepayment model at all.
 */
export function effectiveDurationConvexity(
  reprice: (shiftPct: number) => number,
  bumpBp = 25,
): EffectiveMeasures {
  const shift = bumpBp / 100;
  const decimalShift = bumpBp / 10000;
  const base = reprice(0);
  const up = reprice(shift);
  const down = reprice(-shift);

  if (base === 0) {
    return { effectiveDuration: 0, effectiveConvexity: 0, basePrice: base, upPrice: up, downPrice: down };
  }
  return {
    effectiveDuration: (down - up) / (2 * base * decimalShift),
    effectiveConvexity: (down + up - 2 * base) / (base * decimalShift * decimalShift),
    basePrice: base,
    upPrice: up,
    downPrice: down,
  };
}

/**
 * True when an instrument shortens as rates fall — the mortgage signature.
 * A conduit CMBS, locked out from prepayment, must NOT satisfy this.
 */
export function isNegativelyConvex(measures: EffectiveMeasures): boolean {
  return measures.effectiveConvexity < 0;
}
