/**
 * The Treasury universe, built from an auction calendar.
 *
 * Generating Treasuries as "a bond with a random coupon and a random maturity"
 * loses the single most recognisable feature of a rates book: the ON-THE-RUN
 * LADDER. A desk does not hold twelve unrelated ten-years; it holds the
 * current ten-year, the one before it, the one before that, and their prices
 * and liquidity differ systematically. That structure only appears if the
 * securities come out of a schedule.
 *
 * Two conventions carry most of the realism:
 *
 *  - **Coupons round DOWN to the nearest eighth** of the auction yield, so a
 *    new issue prices at or just below par. A 4.32% auction produces a 4.25%
 *    coupon and a 99.4 price, never a 5.375% coupon on a 4.32% yield.
 *  - **Reopenings**, where a later auction adds to an existing security rather
 *    than creating a new one. The 10-year is new in February, May, August and
 *    November and reopened in between, which is why the off-the-run ladder is
 *    quarterly while the 2-year ladder is monthly.
 */

import { addMonths, addDays, monthOf, type DateInt } from '../core/dateInt.js';
import { completeCusip, isinFromCusip, issueCode } from '../core/identifiers.js';
import { createRng, deriveSeed, uniformInt, type Rng } from '../core/rng.js';
import { formatIso } from '../core/dateInt.js';
import type { Security, LiquidityTier } from './types.js';

/** Issuer prefixes matching real Treasury CUSIP families. */
export const TREASURY_PREFIX = {
  bill: '912797',
  note: '91282C',
  bond: '912810',
  strip: '912803',
} as const;

export interface TreasuryTenor {
  securityType: 'TBill' | 'TNote' | 'TBond' | 'TIPS' | 'FRN';
  /** Term at issue, in years. */
  termYears: number;
  /** Months between NEW issues (a reopening does not create a security). */
  newIssueMonths: number;
  /** Typical auction size, in billions. */
  sizeBn: number;
  label: string;
}

/**
 * The auction cycle, close to the real schedule: 2s, 3s, 5s and 7s monthly,
 * 10s, 20s and 30s quarterly with reopenings between, TIPS on their own
 * cycle, and bills weekly.
 */
export const TREASURY_TENORS: readonly TreasuryTenor[] = [
  { securityType: 'TBill', termYears: 4 / 52, newIssueMonths: 0.25, sizeBn: 85, label: '4-Week' },
  { securityType: 'TBill', termYears: 8 / 52, newIssueMonths: 0.25, sizeBn: 80, label: '8-Week' },
  { securityType: 'TBill', termYears: 13 / 52, newIssueMonths: 0.25, sizeBn: 76, label: '13-Week' },
  { securityType: 'TBill', termYears: 17 / 52, newIssueMonths: 0.25, sizeBn: 60, label: '17-Week' },
  { securityType: 'TBill', termYears: 26 / 52, newIssueMonths: 0.25, sizeBn: 68, label: '26-Week' },
  { securityType: 'TBill', termYears: 1, newIssueMonths: 1, sizeBn: 46, label: '52-Week' },
  { securityType: 'TNote', termYears: 2, newIssueMonths: 1, sizeBn: 69, label: '2-Year' },
  { securityType: 'TNote', termYears: 3, newIssueMonths: 1, sizeBn: 58, label: '3-Year' },
  { securityType: 'TNote', termYears: 5, newIssueMonths: 1, sizeBn: 70, label: '5-Year' },
  { securityType: 'TNote', termYears: 7, newIssueMonths: 1, sizeBn: 44, label: '7-Year' },
  { securityType: 'TNote', termYears: 10, newIssueMonths: 3, sizeBn: 42, label: '10-Year' },
  { securityType: 'TBond', termYears: 20, newIssueMonths: 3, sizeBn: 16, label: '20-Year' },
  { securityType: 'TBond', termYears: 30, newIssueMonths: 3, sizeBn: 25, label: '30-Year' },
  { securityType: 'TIPS', termYears: 5, newIssueMonths: 6, sizeBn: 21, label: '5-Year TIPS' },
  { securityType: 'TIPS', termYears: 10, newIssueMonths: 4, sizeBn: 18, label: '10-Year TIPS' },
  { securityType: 'TIPS', termYears: 30, newIssueMonths: 6, sizeBn: 8, label: '30-Year TIPS' },
  { securityType: 'FRN', termYears: 2, newIssueMonths: 3, sizeBn: 28, label: '2-Year FRN' },
];

/**
 * Set the coupon from the auction yield.
 *
 * Rounds DOWN to the nearest eighth so the security prices at or just under
 * par — the rule that keeps a 4.32% auction from producing an off-market
 * coupon. Never below an eighth, which is the Treasury's own floor.
 */
export function couponFromAuctionYield(auctionYieldPct: number): number {
  if (auctionYieldPct <= 0.125) return 0.125;
  return Math.max(0.125, Math.floor(auctionYieldPct * 8) / 8);
}

/** A yield curve as of a historical date — the seam for a backfilled path. */
export type HistoricalYield = (date: DateInt, tenorYears: number) => number;

export interface TreasuryUniverseOptions {
  asOf: DateInt;
  /** Par yield at a past date. Defaults to a flat 4.25% if not supplied. */
  historicalYield?: HistoricalYield;
  /** Past issues kept per tenor. The first is on-the-run. */
  historyPerTenor?: number;
  seed: number;
  startSecurityId?: number;
  /** Include principal STRIPS off the long bonds. */
  includeStrips?: boolean;
}

function tierFor(rank: number, termYears: number): LiquidityTier {
  if (rank === 0) return 'T1';
  if (rank === 1) return termYears >= 2 ? 'T2' : 'T1';
  if (rank <= 3) return 'T2';
  return 'T3';
}

function billDescription(tenor: TreasuryTenor, maturity: DateInt): string {
  return `US TREASURY BILL ${tenor.label} ${formatIso(maturity)}`;
}

function couponDescription(couponRate: number, maturity: DateInt, type: string): string {
  return `US TREASURY ${type} ${couponRate.toFixed(3)}% ${formatIso(maturity)}`;
}

/** Months between issues, expressed as whole months (bills roll weekly). */
function issueStepDays(tenor: TreasuryTenor): number {
  return tenor.newIssueMonths < 1 ? 7 : 0;
}

function auctionSize(tenor: TreasuryTenor, rng: Rng): number {
  // Auction sizes are announced in round billions and drift a little.
  const jitter = uniformInt(rng, -3, 3);
  return Math.max(1, tenor.sizeBn + jitter) * 1_000_000_000;
}

/**
 * Build the Treasury universe as of a date.
 *
 * Securities come out ordered by tenor then recency, so index 0 of each tenor
 * is that tenor's on-the-run issue.
 */
export function buildTreasuries(options: TreasuryUniverseOptions): Security[] {
  const historyPerTenor = options.historyPerTenor ?? 6;
  const yieldAt = options.historicalYield ?? (() => 4.25);
  let securityId = options.startSecurityId ?? 1;
  const out: Security[] = [];
  const usedCodes = new Set<string>();

  for (const tenor of TREASURY_TENORS) {
    const rng = createRng(deriveSeed(options.seed, 'treasury', tenor.label));
    const stepDays = issueStepDays(tenor);

    for (let rank = 0; rank < historyPerTenor; rank++) {
      const issueDate =
        stepDays > 0
          ? addDays(options.asOf, -rank * stepDays)
          : addMonths(options.asOf, -Math.round(rank * tenor.newIssueMonths));
      const maturityDate =
        tenor.termYears < 1
          ? addDays(issueDate, Math.round(tenor.termYears * 364))
          : addMonths(issueDate, Math.round(tenor.termYears * 12));

      const isBill = tenor.securityType === 'TBill';
      const isFrn = tenor.securityType === 'FRN';
      const auctionYield = yieldAt(issueDate, tenor.termYears);
      const couponRate = isBill || isFrn ? 0 : couponFromAuctionYield(auctionYield);

      const prefix =
        isBill ? TREASURY_PREFIX.bill : tenor.termYears > 10 ? TREASURY_PREFIX.bond : TREASURY_PREFIX.note;
      const cusip = mintCusip(prefix, usedCodes, rng);

      out.push({
        securityId: securityId++,
        cusip,
        isin: isinFromCusip(cusip) ?? '',
        assetClass: 'Rates',
        securityType: tenor.securityType,
        description: isBill
          ? billDescription(tenor, maturityDate)
          : couponDescription(couponRate, maturityDate, tenor.securityType === 'TIPS' ? 'TIPS' : tenor.securityType === 'FRN' ? 'FRN' : 'NOTE'),
        issuerId: 0,
        issuerName: 'United States Treasury',
        sectorIndex: 13,
        currency: 'USD',
        issueDate,
        datedDate: issueDate,
        maturityDate,
        originalTermYears: tenor.termYears,
        couponRate,
        couponType: isBill ? 'Zero' : isFrn ? 'Floating' : tenor.securityType === 'TIPS' ? 'Inflation' : 'Fixed',
        frequency: isBill ? 1 : isFrn ? 4 : 2,
        dayCount: isBill ? 'ACT/360' : 'ACT/ACT',
        endOfMonth: false,
        amountOutstandingUsd: auctionSize(tenor, rng),
        quotationBasis: isBill ? 'Yield' : 'Thirty2nds',
        ratingIndex: 0,
        seniority: 'Treasury',
        liquidityTier: tierFor(rank, tenor.termYears),
        callable: false,
        callSchedule: [],
        benchmarkTenor: tenor.termYears,
        issueSpreadBp: 0,
        onTheRunRank: rank,
      });
    }
  }

  if (options.includeStrips === true) {
    out.push(...buildStrips(out, options.seed, securityId, usedCodes));
  }
  return out;
}

/**
 * Principal STRIPS off the long bonds.
 *
 * They matter out of proportion to their size: a 30-year strip has a duration
 * of exactly 30 and a convexity near 880, which is far outside anything a
 * coupon bond produces and a useful sanity check on a risk column.
 */
function buildStrips(
  bonds: readonly Security[],
  seed: number,
  startId: number,
  usedCodes: Set<string>,
): Security[] {
  const rng = createRng(deriveSeed(seed, 'strips'));
  let securityId = startId;
  const out: Security[] = [];
  for (const bond of bonds) {
    if (bond.securityType !== 'TBond' || bond.onTheRunRank !== 0) continue;
    const cusip = mintCusip(TREASURY_PREFIX.strip, usedCodes, rng);
    out.push({
      ...bond,
      securityId: securityId++,
      cusip,
      isin: isinFromCusip(cusip) ?? '',
      securityType: 'Strip',
      description: `US TREASURY STRIP PRINCIPAL ${formatIso(bond.maturityDate)}`,
      couponRate: 0,
      couponType: 'Zero',
      frequency: 2,
      amountOutstandingUsd: Math.round(bond.amountOutstandingUsd * 0.04),
      liquidityTier: 'T3',
      onTheRunRank: null,
    });
  }
  return out;
}

/** A CUSIP on the given issuer prefix, unique within this build. */
export function mintCusip(prefix6: string, used: Set<string>, rng: Rng): string {
  for (let attempt = 0; attempt < 4096; attempt++) {
    const code = issueCode(uniformInt(rng, 0, 34 * 34 - 1));
    const stem = `${prefix6}${code}`;
    if (used.has(stem)) continue;
    const cusip = completeCusip(stem);
    if (cusip === null) continue;
    used.add(stem);
    return cusip;
  }
  throw new Error(`Exhausted the issue-code space for prefix ${prefix6}`);
}

/** The on-the-run security for a tenor, or null when none was built. */
export function onTheRunFor(securities: readonly Security[], termYears: number): Security | null {
  for (const security of securities) {
    if (security.assetClass !== 'Rates') continue;
    if (security.onTheRunRank !== 0) continue;
    if (security.originalTermYears !== termYears) continue;
    return security;
  }
  return null;
}

/** Every issue of one tenor, on-the-run first. */
export function ladderFor(securities: readonly Security[], termYears: number): Security[] {
  return securities
    .filter((s) => s.assetClass === 'Rates' && s.originalTermYears === termYears && s.onTheRunRank !== null)
    .sort((a, b) => (a.onTheRunRank as number) - (b.onTheRunRank as number));
}

/** Quarter the issue fell in — reopenings share one. */
export function issueQuarter(security: Security): number {
  return Math.ceil(monthOf(security.issueDate) / 3);
}
