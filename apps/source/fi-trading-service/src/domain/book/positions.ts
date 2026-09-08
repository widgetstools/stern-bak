/**
 * A position, and the row a blotter shows for it.
 *
 * The position is DERIVED — quantity is the sum of its signed lot faces,
 * average cost is the face-weighted amortised basis, unrealised P&L is the
 * difference between the two at today's price. Nothing here is stored and
 * later contradicted by the lots underneath it.
 *
 * The row is wide because a fixed-income blotter is wide, but every field on
 * it is computed rather than sampled, so the risk columns agree with the price
 * columns and DV01 predicts what a basis point actually does.
 */

import { diffDays, formatIso, type DateInt } from '../core/dateInt.js';
import { formatPrice } from '../core/tickPrice.js';
import { RATING_BUCKETS } from '../curves/ratingMigration.js';
import { CREDIT_SECTORS } from '../curves/creditFactors.js';
import type { Security } from '../instruments/types.js';
import { rollupLots, type Lot } from './lots.js';
import { benchmarkWeight, type DeskAssignment } from './institutions.js';
import { dv01 } from '../analytics/riskAnalytic.js';
import type { PricedSecurity } from './valuation.js';


export interface PositionInputs {
  positionId: string;
  security: Security;
  priced: PricedSecurity;
  lots: readonly Lot[];
  desk: DeskAssignment;
  asOf: DateInt;
  /** Amortised basis for a lot, per 100. */
  basisAt: (lot: Lot) => number;
  /** Yesterday's mid, for the daily change columns. */
  previousMid?: number;
  /** Current factor for an amortising security. Steps monthly. */
  poolFactor?: number;
  /**
   * Dealer only: the side the desk is advertising, and in what size. An axe is
   * what a dealer publishes to clients — "I want to sell this" — and it is the
   * single most useful column on an inventory blotter.
   */
  axe?: { side: 'Bid' | 'Offer' | 'Both'; sizeUsd: number } | null;
  /** Fund only: this holding's share of the portfolio, in percent. */
  portfolioWeightPct?: number;
  /**
   * Fund only: this holding's share of its SLEEVE, used to pro-rate the
   * benchmark's sleeve weight down to the position.
   */
  benchmarkShare?: number;
  /**
   * Feed timestamp. Defaults to wall clock, which is right for a live quote
   * and wrong for a build: a book has to be reproducible from its seed, and a
   * `Date.now()` baked into the snapshot makes two identical builds differ.
   */
  timestamp?: number;
}

export interface PositionRow extends Record<string, unknown> {
  positionId: string;
  securityId: number;
  cusip: string;
  midPrice: number;
  marketValue: number;
  lastUpdate: number;
  effectiveDv01: number;
  onTheRunRank: number | null;
  bookType: string;
  benchmark: string | null;
  axeSide: string | null;
  axeSizeUsd: number | null;
  inventoryAgeDays: number | null;
  portfolioWeightPct: number | null;
  benchmarkWeightPct: number | null;
  activeWeightPct: number | null;
}

const KRD_LABELS = ['krd3M', 'krd6M', 'krd1Y', 'krd2Y', 'krd3Y', 'krd5Y', 'krd7Y', 'krd10Y', 'krd20Y', 'krd30Y'] as const;

function round(value: number, dp: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
}

/** Half the bid-ask, in points, by liquidity tier and asset class. */
export function halfSpreadPoints(security: Security, duration: number): number {
  const byTier: Record<string, number> = { T1: 0.25, T2: 1.5, T3: 4, T4: 10, T5: 28 };
  const yieldBp = byTier[security.liquidityTier] ?? 8;
  const classMultiple =
    security.assetClass === 'CorpHY' ? 2.2
    : security.assetClass === 'Muni' ? 1.6
    : security.assetClass === 'CLO' ? 2.6
    : security.assetClass === 'CMBS' || security.assetClass === 'ABS' ? 1.8
    // A credit index trades inside every one of its own constituents — that is
    // most of the reason it exists, and it is why a desk moves credit risk in
    // index form. Without this a five-year index can quote wider than a
    // ten-year single name, purely because the spread scales with duration.
    : security.securityType === 'CdsIndex' ? 0.35
    // A Treasury trades inside a corporate of the same liquidity tier by an
    // order of magnitude — an off-the-run note is a fraction of a 32nd where an
    // investment-grade bond is several basis points of yield. Without this the
    // two came out identical whenever they shared a tier, which the real
    // auction data made common: most outstanding Treasuries are seasoned.
    : security.assetClass === 'Rates' ? 0.2
    : security.assetClass === 'Agency' ? 0.5
    : 1;
  // Convert a yield half-spread into price using duration.
  return (yieldBp / 10000) * classMultiple * Math.max(0.25, duration) * 100;
}

/**
 * Build the blotter row.
 *
 * Ordered the way a desk reads one: identity, terms, credit, pricing, yields
 * and spreads, risk, then the position and its P&L.
 */
/** Dollars per basis point per 100 of face, for a duration and a dirty price. */
function dv01Of(duration: number, dirtyPrice: number): number {
  return dv01(duration, dirtyPrice, 100);
}

export function buildPositionRow(inputs: PositionInputs): PositionRow {
  const { security, priced, lots, desk, asOf } = inputs;
  const rollup = rollupLots(lots, asOf, inputs.basisAt);

  const factor = inputs.poolFactor ?? 1;
  const currentFace = rollup.quantityFace * factor;
  const mid = priced.cleanPrice;
  const half = halfSpreadPoints(security, priced.modifiedDuration);
  const previousMid = inputs.previousMid ?? mid;

  // A swap's market value is its mark, not its notional. Points upfront are
  // quoted against 100, so the value of the position is what has accrued away
  // from par — counting 102 as "102% of notional held" would put the whole
  // notional of the CDS book into the firm's market value.
  const isSwap = security.assetClass === 'CDS';
  const fundWeight = desk.bookType === 'Fund' ? inputs.portfolioWeightPct ?? 0 : null;
  // Pro-rated to this row, so a sleeve's rows sum to the index's sleeve weight.
  const rowIndexWeight =
    benchmarkWeight(desk.benchmark, desk.desk) * (inputs.benchmarkShare ?? 0);

  const marketValue = isSwap
    ? ((mid - 100) / 100) * currentFace
    : (mid / 100) * currentFace;
  const accrued = (priced.accruedInterest / 100) * currentFace;
  const costBasis = isSwap
    ? ((rollup.averageCost - 100) / 100) * currentFace
    : (rollup.averageCost / 100) * currentFace;
  const unrealized = marketValue - costBasis;
  const dailyPnl = ((mid - previousMid) / 100) * currentFace;

  const row: PositionRow = {
    // identity
    positionId: inputs.positionId,
    securityId: security.securityId,
    cusip: security.cusip,
    isin: security.isin,
    description: security.description,
    issuerId: security.issuerId,
    issuerName: security.issuerName,
    sector: CREDIT_SECTORS[security.sectorIndex] ?? 'Sovereign',
    assetClass: security.assetClass,
    securityType: security.securityType,
    seniority: security.seniority,
    currency: security.currency,

    // terms
    couponRate: security.couponRate,
    couponType: security.couponType,
    issueDate: formatIso(security.issueDate),
    maturityDate: formatIso(security.maturityDate),
    originalTermYears: security.originalTermYears,
    yearsToMaturity: round(Math.max(0, diffDays(asOf, security.maturityDate) / 365.25), 3),
    dayCount: security.dayCount,
    frequency: security.frequency,
    callable: security.callable,
    nextCallDate: security.callSchedule.length > 0 ? formatIso(security.callSchedule[0]?.date as DateInt) : null,
    amountOutstanding: security.amountOutstandingUsd,

    // credit
    rating: RATING_BUCKETS[security.ratingIndex] ?? 'NR',
    ratingIndex: security.ratingIndex,
    ratingBucket: security.ratingIndex <= 3 ? 'IG' : security.ratingIndex >= 7 ? 'D' : 'HY',
    liquidityTier: security.liquidityTier,
    // 0 is on-the-run, 1 the first off-the-run, null for anything not
    // auctioned. The single largest determinant of what a Treasury costs to
    // trade, and the rates desk's primary axis.
    onTheRunRank: security.onTheRunRank,

    // pricing
    bidPrice: round(mid - half, 4),
    askPrice: round(mid + half, 4),
    midPrice: round(mid, 4),
    cleanPrice: round(mid, 4),
    dirtyPrice: round(priced.dirtyPrice, 4),
    quotedPrice: formatPrice(mid, security.quotationBasis),
    quotationBasis: security.quotationBasis,
    bidAskPoints: round(half * 2, 4),
    priceChange: round(mid - previousMid, 4),
    priceChangePct: previousMid === 0 ? 0 : round(((mid - previousMid) / previousMid) * 100, 4),

    // yields and spreads
    yieldToMaturity: round(priced.yieldToMaturity, 4),
    yieldToWorst: round(priced.yieldToWorst, 4),
    workoutDate: priced.workoutDate === 0 ? null : formatIso(priced.workoutDate),
    workoutType: priced.workoutType,
    currentYield: round(priced.currentYield, 4),
    zSpread: round(priced.zSpread, 1),
    oas: round(priced.oas, 1),
    issueSpreadBp: security.issueSpreadBp,
    discountRate: round(priced.discountRate, 4),
    bondEquivalentYield: round(priced.bondEquivalentYield, 4),

    // risk
    modifiedDuration: round(priced.modifiedDuration, 4),
    effectiveDuration: round(priced.effectiveDuration, 4),
    convexity: round(priced.convexity, 4),
    effectiveConvexity: round(priced.effectiveConvexity, 4),
    spreadDuration: round(priced.spreadDuration, 4),
    weightedAverageLife: round(priced.weightedAverageLife, 3),
    dv01: round((priced.dv01 / 100) * currentFace, 2),
    // The key rate columns sum to THIS, not to `dv01`: they are built off the
    // effective duration (the key rates partition unity over it), and effective
    // and modified duration differ by `1 + y/2`. Emitting both keeps the hedge
    // solver's bucket constraints consistent with its total-duration one.
    effectiveDv01: round((dv01Of(priced.effectiveDuration, priced.dirtyPrice) / 100) * currentFace, 2),
    cs01: round((priced.cs01 / 100) * currentFace, 2),

    // position and P&L
    quantityFace: round(rollup.quantityFace, 2),
    currentFace: round(currentFace, 2),
    factor: round(factor, 8),
    marketValue: round(marketValue, 2),
    accruedInterest: round(accrued, 2),
    avgCost: round(rollup.averageCost, 4),
    purchasePrice: round(rollup.averagePurchasePrice, 4),
    bookYield: round(lots[0]?.purchaseYield ?? priced.yieldToMaturity, 4),
    unrealizedPnL: round(unrealized, 2),
    realizedPnL: round(rollup.realizedPnl, 2),
    dailyPnL: round(dailyPnl, 2),
    openLots: rollup.openLotCount,
    daysHeld: Math.round(rollup.averageHoldingDays),
    openDate: rollup.earliestOpenDate === null ? null : formatIso(rollup.earliestOpenDate),

    // book — who owns this, and on which side of the market
    bookType: desk.bookType,
    desk: desk.desk,
    book: desk.book,
    trader: desk.trader,
    portfolio: desk.portfolio,
    strategy: desk.strategy,
    accountId: desk.accountId,
    benchmark: desk.benchmark,

    // sell side: what the desk is advertising, and how long it has been stuck
    // with the position. Aged inventory is a dealer's problem and nobody
    // else's — capital is tied up in it and the desk is charged for that.
    axeSide: inputs.axe?.side ?? null,
    axeSizeUsd: inputs.axe === null || inputs.axe === undefined ? null : round(inputs.axe.sizeUsd, 0),
    inventoryAgeDays: desk.bookType === 'Dealer' ? Math.round(rollup.averageHoldingDays) : null,

    // buy side: the position is the ACTIVE weight, not the holding. Holding 8%
    // high yield against an index that holds none IS the bet; the 8% alone
    // says nothing without the index beside it.
    portfolioWeightPct: fundWeight === null ? null : round(fundWeight, 4),
    benchmarkWeightPct: fundWeight === null ? null : round(rowIndexWeight, 4),
    activeWeightPct: fundWeight === null ? null : round(fundWeight - rowIndexWeight, 4),

    asOf: formatIso(asOf),
    lastUpdate: inputs.timestamp ?? Date.now(),
  };

  for (let i = 0; i < KRD_LABELS.length; i++) {
    // Dollars per BASIS POINT, like every other risk column on the row. The
    // duration alone is dollars per 100 bp on face, which is a hundred times
    // the number a risk report shows and does not sum to any DV01.
    const scaled = (dv01Of(priced.keyRateDurations[i] ?? 0, priced.dirtyPrice) / 100) * currentFace;
    row[KRD_LABELS[i] as string] = round(scaled, 2);
  }
  return row;
}

/** The desks a generated book is spread across, with mandates that match. */
