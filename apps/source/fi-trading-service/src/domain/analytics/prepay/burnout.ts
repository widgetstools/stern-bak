/**
 * Burnout: the pool remembers.
 *
 * Once a cohort has been in the money for a while, the borrowers who could and
 * would refinance already have. What remains is a residue that does not
 * respond, so the same incentive produces a fraction of the prepayment it did
 * the first time. Twelve months in the money takes a pool to about 31% of its
 * fresh S-curve speed.
 *
 * This is the only genuinely PATH-DEPENDENT piece of state a security carries
 * in the whole model, and it earns that exception: burnout is path dependence
 * by definition, and without it a pool that has been through a refi wave
 * prepays as fast the second time as the first, which no pool does.
 */

/**
 * Multiplier on the refinancing component, from cumulative months in the money.
 *
 * Decays to a floor of 0.45 with a roughly nine-month half-life, so a pool
 * that has been in the money for two years still prepays at about half its
 * fresh speed.
 *
 * The floor is the parameter that matters, and it is easy to set too low. Drop
 * it to 0.3 and a deep-premium pool settles at around 20 CPR, which gives it a
 * five-year average life and a price near 110 — a premium mortgage priced like
 * an uncallable bond. Real premiums cap in the 103-106 range precisely because
 * they keep prepaying, and 0.45 reproduces that.
 */
export function burnout(cumulativeInTheMoneyMonths: number): number {
  return 0.45 + 0.55 * Math.exp(-0.075 * Math.max(0, cumulativeInTheMoneyMonths));
}

/**
 * Advance the burnout counter by one month's worth of burn.
 *
 * The increment is SMOOTH in the incentive, not a threshold. A hard cutoff
 * looks harmless and is not: it puts a step in the price function exactly
 * where the S-curve is steepest, and an effective-convexity calculation is a
 * second difference, so it amplifies that step into a nonsense number. With a
 * 0.25 threshold a 25 bp down-bump could tip a pool from never burning to
 * burning every month, and convexity flipped from -300 to +1800 across a
 * single coupon.
 *
 * Economically the smooth form is also the right one: burnout is a population
 * gradually exhausting, not a switch.
 */
export function accrueBurnout(cumulativeMonths: number, incentivePct: number): number {
  const intensity = 1 / (1 + Math.exp(-4 * (incentivePct - 0.25)));
  return cumulativeMonths + intensity;
}

/** Cumulative months at which a pool is effectively fully burned out. */
export const FULLY_BURNED_MONTHS = 36;
