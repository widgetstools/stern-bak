/**
 * Tax lots, and the position that is derived from them.
 *
 * A position is NOT a stored quantity with a stored cost. It is the rollup of
 * its open lots: quantity is the sum of signed faces, average cost is the
 * face-weighted average of amortised bases, and realised P&L accumulates as
 * lots are relieved. Storing the position independently is what lets a
 * generated book drift into numbers that do not add up under inspection.
 *
 * Amortisation is CONSTANT YIELD (IRC 171 for premium, 1272 for discount), and
 * it falls out of machinery that already exists: the amortised basis of a lot
 * is simply the bond repriced today at the yield it was bought at. So a bond
 * bought at 104 to yield 4.2% shows a basis that grinds toward par as it
 * seasons, and the pull-to-par shows up as income rather than as a capital
 * loss — which is the whole point of the convention.
 */

import { diffDays, type DateInt } from '../core/dateInt.js';
import { cleanPriceFromYield, type BondTerms } from '../analytics/pricing.js';

export type LotSide = 'LONG' | 'SHORT';

/** How a sale is matched against open lots. */
export type LotMethod = 'FIFO' | 'LIFO' | 'HICO';

export interface Lot {
  lotId: string;
  positionId: string;
  securityId: number;
  openTradeId: string;
  openDate: DateInt;
  settleDate: DateInt;
  side: LotSide;
  /** Face at purchase. Never changes. */
  originalFace: number;
  /** Face still held. Falls as the lot is relieved. */
  remainingFace: number;
  /** Clean price paid, per 100. */
  purchasePriceClean: number;
  /** Yield at purchase — the rate the basis amortises at. */
  purchaseYield: number;
  accruedAtPurchase: number;
  closedDate: DateInt | null;
  realizedPnl: number;
}

/**
 * Amortised cost per 100 of face, today.
 *
 * The bond repriced at the yield it was bought at. Premium grinds down toward
 * par, discount accretes up, and both do so on the constant-yield schedule the
 * tax code actually prescribes.
 */
export function amortizedCost(lot: Lot, terms: BondTerms, asOf: DateInt): number {
  const maturity = terms.schedule[terms.schedule.length - 1]?.accrualEnd;
  if (maturity === undefined || asOf >= maturity) return 100;
  return cleanPriceFromYield(terms, asOf, lot.purchaseYield);
}

/** Unamortised premium (positive) or discount (negative) still to run off. */
export function unamortizedPremium(lot: Lot, terms: BondTerms, asOf: DateInt): number {
  return amortizedCost(lot, terms, asOf) - 100;
}

export interface RelievedLot {
  lotId: string;
  faceRelieved: number;
  costBasis: number;
  proceeds: number;
  realizedPnl: number;
  holdingDays: number;
}

export interface ReliefResult {
  closed: RelievedLot[];
  /** Lots after relief, with `remainingFace` reduced. */
  remaining: Lot[];
  realizedPnl: number;
  faceRelieved: number;
  /** Face the sale could not be matched against — a short would be opened. */
  unmatchedFace: number;
}

function orderFor(lots: readonly Lot[], method: LotMethod): Lot[] {
  const open = lots.filter((lot) => lot.remainingFace > 0);
  if (method === 'LIFO') return [...open].sort((a, b) => b.openDate - a.openDate);
  // Highest cost first minimises the realised gain — the usual tax choice.
  if (method === 'HICO') return [...open].sort((a, b) => b.purchasePriceClean - a.purchasePriceClean);
  return [...open].sort((a, b) => a.openDate - b.openDate);
}

/**
 * Match a sale against open lots.
 *
 * Realised P&L is `face x (salePrice - basis) / 100` per lot, using the
 * amortised basis rather than the purchase price — otherwise a premium bond
 * held to maturity would show a capital loss that never happened.
 */
export function relieveLots(
  lots: readonly Lot[],
  faceToRelieve: number,
  salePriceClean: number,
  method: LotMethod,
  asOf: DateInt,
  basisAt: (lot: Lot) => number,
): ReliefResult {
  const byId = new Map(lots.map((lot) => [lot.lotId, { ...lot }]));
  const closed: RelievedLot[] = [];
  let outstanding = Math.max(0, faceToRelieve);
  let realizedPnl = 0;

  for (const candidate of orderFor(lots, method)) {
    if (outstanding <= 0) break;
    const lot = byId.get(candidate.lotId) as Lot;
    const take = Math.min(lot.remainingFace, outstanding);
    if (take <= 0) continue;

    const basis = basisAt(lot);
    const proceeds = (salePriceClean / 100) * take;
    const cost = (basis / 100) * take;
    const gain = proceeds - cost;

    lot.remainingFace -= take;
    lot.realizedPnl += gain;
    if (lot.remainingFace <= 0) lot.closedDate = asOf;

    closed.push({
      lotId: lot.lotId,
      faceRelieved: take,
      costBasis: basis,
      proceeds,
      realizedPnl: gain,
      holdingDays: Math.max(0, asOf - lot.openDate),
    });
    realizedPnl += gain;
    outstanding -= take;
  }

  return {
    closed,
    remaining: [...byId.values()],
    realizedPnl,
    faceRelieved: faceToRelieve - outstanding,
    unmatchedFace: outstanding,
  };
}

export interface LotRollup {
  quantityFace: number;
  /** Face-weighted average amortised basis, per 100. */
  averageCost: number;
  /** Face-weighted average price actually paid, per 100. */
  averagePurchasePrice: number;
  realizedPnl: number;
  openLotCount: number;
  /** Weighted average holding period, in days. */
  averageHoldingDays: number;
  earliestOpenDate: DateInt | null;
}

/**
 * Roll open lots up into the numbers a position shows.
 *
 * This is the only place a position's quantity and cost come from, which is
 * what makes `quantity == sum of signed lot faces` true by construction rather
 * than by convention.
 */
export function rollupLots(
  lots: readonly Lot[],
  asOf: DateInt,
  basisAt: (lot: Lot) => number,
): LotRollup {
  let face = 0;
  let weightedBasis = 0;
  let weightedPaid = 0;
  let weightedDays = 0;
  let realized = 0;
  let openLotCount = 0;
  let earliest: DateInt | null = null;

  for (const lot of lots) {
    realized += lot.realizedPnl;
    if (lot.remainingFace <= 0) continue;
    const signed = lot.side === 'SHORT' ? -lot.remainingFace : lot.remainingFace;
    face += signed;
    weightedBasis += basisAt(lot) * lot.remainingFace;
    weightedPaid += lot.purchasePriceClean * lot.remainingFace;
    weightedDays += Math.max(0, diffDays(lot.openDate, asOf)) * lot.remainingFace;
    openLotCount += 1;
    if (earliest === null || lot.openDate < earliest) earliest = lot.openDate;
  }

  const grossFace = lots.reduce((sum, lot) => sum + Math.max(0, lot.remainingFace), 0);
  return {
    quantityFace: face,
    averageCost: grossFace <= 0 ? 0 : weightedBasis / grossFace,
    averagePurchasePrice: grossFace <= 0 ? 0 : weightedPaid / grossFace,
    realizedPnl: realized,
    openLotCount,
    averageHoldingDays: grossFace <= 0 ? 0 : weightedDays / grossFace,
    earliestOpenDate: earliest,
  };
}

/**
 * Paydown P&L on an amortising security.
 *
 * Principal returns at par, so a pool bought at a premium books a LOSS on every
 * paydown and one bought at a discount books a gain. It is a distinct monthly
 * line for the whole securitised book and it does not exist at all in a
 * generator that treats mortgages as bullets.
 */
export function paydownPnl(principalPaid: number, amortizedCostPerUnit: number): number {
  return principalPaid * ((100 - amortizedCostPerUnit) / 100);
}
