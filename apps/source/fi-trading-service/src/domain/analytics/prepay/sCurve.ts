/**
 * The prepayment S-curve and its companions.
 *
 * Prepayment is what makes a mortgage a mortgage, and it responds to the rate
 * the BORROWER is offered, not to Treasuries. The composite has the
 * multiplicative Richard-Roll shape:
 *
 *     CPR = SEAS * [ TURN * LOCKIN + REFI * BURN * collateral multipliers ]
 *
 * Two pieces are easy to leave out and both matter enormously.
 *
 * **Lock-in.** A borrower with a 3% mortgage against a 7% market will not sell
 * the house and give up the loan. Housing turnover on deeply out-of-the-money
 * collateral runs at about a third of normal. Omit it and every low-coupon
 * pool prepays three times too fast, which destroys the entire low-coupon
 * extension story.
 *
 * **Seasonality.** Home sales peak in summer and trough in winter, moving
 * turnover by plus or minus 22%. It is a small effect that is highly visible
 * in a monthly CPR series, because its absence makes the series too smooth.
 */

/**
 * Refinancing response to being in the money, in CPR.
 *
 * Flat and near zero out of the money, steep through the first 150 bp, then
 * saturating near 48 — the classic S. The saturation is the population of
 * borrowers who can and will refinance; the rest are credit- or
 * documentation-impaired at any rate.
 */
export function refiCpr(incentivePct: number): number {
  return 0.5 + 47.5 / (1 + Math.exp(-2.8 * (incentivePct - 0.85)));
}

/**
 * Housing-turnover multiplier from lock-in.
 *
 * Runs from about 0.35 deep out of the money to 1.0 at and above par.
 */
export function lockIn(incentivePct: number): number {
  return 0.35 + 0.65 / (1 + Math.exp(-1.8 * (incentivePct + 1.2)));
}

/** Baseline turnover in CPR, ramping over a 30-month seasoning period. */
export function turnoverCpr(ageMonths: number): number {
  return 6.0 * Math.min(1, Math.max(0, ageMonths) / 30);
}

/**
 * Seasonal multiplier, peaking in July and troughing in January.
 *
 * Home sales, and therefore turnover prepayments, follow the school year.
 */
export function seasonality(month: number): number {
  return 1 + 0.22 * Math.sin((2 * Math.PI * (month - 4)) / 12);
}

/**
 * Effective incentive after the media and capacity lag.
 *
 * Borrowers do not refinance at the spot rate: originators are capacity
 * constrained and the decision follows news of the trough by a quarter or so.
 * Blending the current incentive with the best of the trailing quarter
 * reproduces the lag without a separate state machine.
 */
export function effectiveIncentive(current: number, trailingMax: number): number {
  return 0.65 * current + 0.35 * Math.max(current, trailingMax);
}

/** Involuntary prepayment: agency buyout at 120-day delinquency, in CPR. */
export const INVOLUNTARY_CPR = 0.35;
/** Partial principal payments borrowers make voluntarily, in CPR. */
export const CURTAILMENT_CPR = 0.5;
/** Hard ceiling. Even a fully refinanceable cohort does not exceed this. */
export const MAX_CPR = 60;

/** Single monthly mortality implied by an annual CPR. */
export function cprToSmm(cprPct: number): number {
  const bounded = Math.min(MAX_CPR, Math.max(0, cprPct));
  return 1 - (1 - bounded / 100) ** (1 / 12);
}

/** Annual CPR implied by a single monthly mortality. */
export function smmToCpr(smm: number): number {
  return (1 - (1 - smm) ** 12) * 100;
}

/**
 * PSA speed: 100 PSA is 0.2% CPR in month one, ramping 0.2% a month to 6% at
 * month 30 and flat after. Still the quoting convention for ABS-adjacent
 * agency paper.
 */
export function psaToCpr(psaPct: number, ageMonths: number): number {
  const base = 6 * Math.min(1, Math.max(0, ageMonths) / 30);
  return (base * psaPct) / 100;
}
