/**
 * Collateral multipliers — why one pool prepays faster than another at the
 * same coupon, and therefore why specified pools trade at a pay-up.
 *
 * The most important is loan size. A borrower with an 85,000 dollar mortgage
 * saves so little in absolute dollars from refinancing that the closing costs
 * swamp it, so low-loan-balance pools prepay at about 42% of generic speed.
 * That single fact is what a 1-16 pay-up on an LLB pool is paying for, and the
 * pay-up table and the prepayment model have to tell the same story or the
 * structured book is internally inconsistent.
 */

/** Occupancy mix of a pool. Shares should sum to 1. */
export interface OccupancyMix {
  ownerOccupied: number;
  secondHome: number;
  investor: number;
}

/** Geographic concentration, as state shares. */
export type StateMix = Readonly<Record<string, number>>;

/**
 * Spread at origination: how far above the prevailing rate the borrower paid.
 * A high-SATO borrower was credit-impaired and refinances less.
 */
export function satoMult(sato: number): number {
  return Math.exp(-0.55 * sato);
}

/**
 * Average loan size multiplier. The dominant story multiplier.
 *
 * 85k pools run at 0.42 of generic; above about 400k the effect saturates.
 */
export function llbMult(averageLoanSize: number): number {
  return 0.28 + 0.72 / (1 + Math.exp(-(averageLoanSize - 175000) / 62000));
}

/**
 * State-level refinancing friction. New York's mortgage recording tax is the
 * classic example: it adds real closing cost and visibly slows prepayment.
 */
export const STATE_MULTIPLIER: Readonly<Record<string, number>> = {
  NY: 0.72,
  PR: 0.55,
  TX: 0.88,
  FL: 1.05,
  CA: 1.15,
  AZ: 1.08,
  NV: 1.1,
  IL: 0.95,
  OH: 0.94,
  MI: 0.96,
};

export function geoMult(states: StateMix): number {
  let weighted = 0;
  let total = 0;
  for (const [state, share] of Object.entries(states)) {
    weighted += (STATE_MULTIPLIER[state] ?? 1) * share;
    total += share;
  }
  if (total <= 0) return 1;
  return weighted / total;
}

/** Credit quality. Better borrowers can actually get the new loan. */
export function ficoMult(weightedAverageFico: number): number {
  if (weightedAverageFico < 680) return 0.68;
  if (weightedAverageFico < 720) return 0.85;
  if (weightedAverageFico < 760) return 1.0;
  return 1.12;
}

/** Investors refinance less than owner-occupants. */
export function occupancyMult(mix: OccupancyMix): number {
  const total = mix.ownerOccupied + mix.secondHome + mix.investor;
  if (total <= 0) return 1;
  return (mix.ownerOccupied * 1.0 + mix.secondHome * 0.92 + mix.investor * 0.78) / total;
}

/** Loan-to-value. Very high LTV borrowers cannot refinance at all. */
export function ltvMult(weightedAverageLtv: number): number {
  if (weightedAverageLtv > 95) return 0.72;
  if (weightedAverageLtv > 80) return 0.94;
  return 1.0;
}

export interface PoolCollateral {
  averageLoanSize: number;
  weightedAverageFico: number;
  weightedAverageLtv: number;
  sato: number;
  states: StateMix;
  occupancy: OccupancyMix;
}

/** Every collateral multiplier, combined. */
export function collateralMultiplier(collateral: PoolCollateral): number {
  return (
    satoMult(collateral.sato) *
    llbMult(collateral.averageLoanSize) *
    geoMult(collateral.states) *
    ficoMult(collateral.weightedAverageFico) *
    occupancyMult(collateral.occupancy) *
    ltvMult(collateral.weightedAverageLtv)
  );
}

/** Generic collateral — the TBA-deliverable baseline, multiplier near 1. */
export const GENERIC_COLLATERAL: PoolCollateral = {
  averageLoanSize: 340_000,
  weightedAverageFico: 745,
  weightedAverageLtv: 72,
  sato: 0.1,
  states: { CA: 0.18, TX: 0.09, FL: 0.09, NY: 0.06, IL: 0.05, OH: 0.04 },
  occupancy: { ownerOccupied: 0.88, secondHome: 0.05, investor: 0.07 },
};
