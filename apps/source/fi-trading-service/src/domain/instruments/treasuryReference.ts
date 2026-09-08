/**
 * The real Treasury universe, loaded from the auction record.
 *
 * This replaces a synthesised auction calendar with the actual one. The
 * difference shows up everywhere: the on-the-run ladder is the ladder that
 * exists, the coupons are the coupons Treasury set, the maturity dates fall on
 * the 15th and the end of the month the way real issues do, and a reopened
 * issue is bigger than one auctioned once. None of that is expensive to fake
 * individually, and all of it together is what a rates trader reads at a
 * glance.
 *
 * The data is a COMMITTED SNAPSHOT (`reference/treasuryAuctions.json`, from
 * `scripts/fetchTreasury.mjs`). Nothing here touches the network. The scenario
 * engine's claim is that a build reproduces from `(seed, date)`, and a build
 * that called an API would reproduce only until the next auction settled.
 *
 * Source: US Treasury Fiscal Data. A US Government work, public domain.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseIsoDate, type DateInt } from '../core/dateInt.js';
import { completeCusip, isinFromCusip } from '../core/identifiers.js';
import type { LiquidityTier, Security } from './types.js';

export interface TreasuryAuctionRecord {
  cusip: string;
  securityType: 'Bill' | 'Note' | 'Bond';
  term: string;
  originalTerm: string;
  auctionDate: string;
  issueDate: string;
  datedDate: string;
  maturityDate: string;
  firstCouponDate: string | null;
  interestRate: number | null;
  offeringAmt: number | null;
  corpusCusip: string | null;
  isTips: boolean;
  isFrn: boolean;
  investmentRate: number | null;
  /** How many times this CUSIP was auctioned again. Reopenings add size. */
  reopenings: number;
}

export interface TreasuryReference {
  source: string;
  licence: string;
  fetchedAt: string;
  auctionRecords: number;
  securities: TreasuryAuctionRecord[];
}

let cached: TreasuryReference | null = null;

/** The vendored snapshot. Read once, then shared. */
export function treasuryReference(): TreasuryReference {
  if (cached === null) {
    const here = dirname(fileURLToPath(import.meta.url));
    // src/domain/instruments -> the package root, in both src and dist layouts.
    const path = join(here, '..', '..', '..', 'reference', 'treasuryAuctions.json');
    cached = JSON.parse(readFileSync(path, 'utf8')) as TreasuryReference;
  }
  return cached;
}

/**
 * Years implied by a Treasury term string.
 *
 * Terms come through as "30-Year", "17-Week", "4-Week", and for reopenings as
 * odd remainders like "29-Year 11-Month" — a 30-year bond reopened a month
 * later is still a 30-year bond, which is why `originalTerm` is what gets
 * bucketed and this only has to be approximately right.
 */
export function termYears(term: string): number {
  let years = 0;
  for (const [, value, unit] of term.matchAll(/(\d+)-(Year|Month|Week|Day)/g)) {
    const n = Number(value);
    years += unit === 'Year' ? n : unit === 'Month' ? n / 12 : unit === 'Week' ? n / 52 : n / 365;
  }
  return years;
}

/** The benchmark tenors a rates desk actually quotes. */
const BENCHMARK_TENORS = [1 / 12, 0.25, 0.5, 1, 2, 3, 5, 7, 10, 20, 30];

function nearestBenchmark(years: number): number {
  let best = BENCHMARK_TENORS[0] as number;
  for (const tenor of BENCHMARK_TENORS) {
    if (Math.abs(tenor - years) < Math.abs(best - years)) best = tenor;
  }
  return best;
}

/**
 * Liquidity by recency, which is how the Treasury market actually works.
 *
 * The on-the-run issue trades inside everything else; the first off-the-run is
 * close behind; anything older is a "seasoned" issue quoted wider. Tiering on
 * anything else — size, coupon, maturity — would miss the single largest
 * determinant of what a Treasury costs to trade.
 */
function tierForRank(rank: number): LiquidityTier {
  if (rank === 0) return 'T1';
  if (rank <= 2) return 'T2';
  return 'T3';
}

export interface TreasuryUniverseFromReference {
  asOf: DateInt;
  /** Include a principal STRIP for each coupon issue that has a corpus CUSIP. */
  includeStrips?: boolean;
  /** Cap, for a smaller demo. Keeps the most recent issues per tenor. */
  limit?: number;
  startSecurityId?: number;
}

/**
 * Every Treasury outstanding on `asOf`, as securities.
 *
 * "Outstanding" means issued and not yet matured. A security auctioned but not
 * settled is excluded: it is when-issued, tradeable but not yet a holding, and
 * treating it as outstanding would let the book hold something that does not
 * exist yet.
 */
export function buildTreasuriesFromReference(
  options: TreasuryUniverseFromReference,
): Security[] {
  const { asOf } = options;
  const reference = treasuryReference();

  const live = reference.securities.filter((record) => {
    const issue = parseIsoDate(record.issueDate);
    const maturity = parseIsoDate(record.maturityDate);
    return issue !== null && maturity !== null && issue <= asOf && maturity > asOf;
  });

  // Rank within the BENCHMARK tenor, not the raw term string. A reopening is
  // recorded with the term remaining at the time — "29-Year 11-Month" — so
  // grouping on the string puts a bond reopened a month late in a category of
  // its own, where it is trivially rank 0. That made a 6.25% bond auctioned in
  // 2000 look like the on-the-run thirty-year.
  const byTerm = new Map<number, TreasuryAuctionRecord[]>();
  for (const record of live) {
    const key = nearestBenchmark(termYears(record.originalTerm));
    byTerm.set(key, [...(byTerm.get(key) ?? []), record]);
  }
  const rankOf = new Map<string, number>();
  for (const group of byTerm.values()) {
    group.sort((a, b) => b.issueDate.localeCompare(a.issueDate));
    for (const [rank, record] of group.entries()) rankOf.set(record.cusip, rank);
  }

  const kept = options.limit === undefined
    ? live
    : [...live].sort((a, b) => (rankOf.get(a.cusip) ?? 99) - (rankOf.get(b.cusip) ?? 99))
        .slice(0, options.limit);

  let securityId = options.startSecurityId ?? 0;
  const out: Security[] = [];

  for (const record of kept) {
    const issueDate = parseIsoDate(record.issueDate) as DateInt;
    const maturityDate = parseIsoDate(record.maturityDate) as DateInt;
    const datedDate = parseIsoDate(record.datedDate) ?? issueDate;
    const rank = rankOf.get(record.cusip) ?? 0;
    const years = termYears(record.originalTerm);
    const isBill = record.securityType === 'Bill';
    const coupon = record.interestRate ?? 0;

    const securityType = isBill ? 'TBill' : record.isFrn ? 'FRN' : record.securityType === 'Bond' ? 'TBond' : 'TNote';
    const label = isBill
      ? `US TREASURY BILL ${record.originalTerm}`
      : `US TREASURY ${record.securityType.toUpperCase()} ${coupon.toFixed(3)}%`;

    out.push({
      securityId: securityId++,
      cusip: record.cusip,
      isin: isinFromCusip(record.cusip) ?? '',
      assetClass: 'Rates',
      securityType,
      description: `${label} ${record.maturityDate}`,
      issuerId: 0,
      issuerName: 'United States Treasury',
      sectorIndex: 0,
      currency: 'USD',
      issueDate,
      datedDate,
      maturityDate,
      originalTermYears: years,
      couponRate: coupon,
      couponType: isBill ? 'Zero' : record.isFrn ? 'Floating' : 'Fixed',
      frequency: isBill ? 1 : record.isFrn ? 4 : 2,
      // Bills quote on an ACT/360 discount basis; coupon issues accrue ACT/ACT.
      dayCount: isBill ? 'ACT/360' : 'ACT/ACT',
      endOfMonth: false,
      // A reopening adds the same amount again, so an issue auctioned three
      // times is roughly three times the size of one auctioned once.
      amountOutstandingUsd: Math.round((record.offeringAmt ?? 0) * (1 + record.reopenings)),
      quotationBasis: isBill ? 'Yield' : 'Thirty2nds',
      ratingIndex: 0,
      seniority: 'Treasury',
      liquidityTier: tierForRank(rank),
      callable: false,
      callSchedule: [],
      benchmarkTenor: nearestBenchmark(years),
      issueSpreadBp: 0,
      onTheRunRank: rank,
    });
  }

  if (options.includeStrips !== false) {
    out.push(...stripsFor(kept, rankOf, securityId, asOf));
  }
  return out;
}

/**
 * Principal STRIPS, using the corpus CUSIP the auction record carries.
 *
 * A stripped principal payment has its own real CUSIP — Treasury publishes it
 * per issue — so these are not invented. Only coupon issues can be stripped,
 * and only ones with enough size to matter.
 */
function stripsFor(
  records: readonly TreasuryAuctionRecord[],
  rankOf: ReadonlyMap<string, number>,
  startSecurityId: number,
  asOf: DateInt,
): Security[] {
  let securityId = startSecurityId;
  const out: Security[] = [];
  // A principal STRIP keeps its PARENT ISSUE's identity, so two bonds
  // redeeming on the same day have different corpus CUSIPs and are not
  // interchangeable — only coupon strips are fungible by date. The corpus
  // CUSIP is therefore the identity, and one security is minted per corpus,
  // not per maturity.
  const mintedCorpus = new Set<string>();
  for (const record of records) {
    if (record.securityType === 'Bill' || record.corpusCusip === null || record.isFrn) continue;
    // Strips are minted off longer issues; a two-year corpus barely trades.
    if (termYears(record.originalTerm) < 5) continue;
    if (mintedCorpus.has(record.corpusCusip)) continue;
    mintedCorpus.add(record.corpusCusip);
    const cusip = completeCusip(record.corpusCusip.slice(0, 8)) ?? record.corpusCusip;
    const maturityDate = parseIsoDate(record.maturityDate) as DateInt;
    const issueDate = parseIsoDate(record.issueDate) as DateInt;
    if (maturityDate <= asOf) continue;

    out.push({
      securityId: securityId++,
      cusip,
      isin: isinFromCusip(cusip) ?? '',
      assetClass: 'Rates',
      securityType: 'Strip',
      description: `US TREASURY STRIP PRINCIPAL ${record.maturityDate}`,
      issuerId: 0,
      issuerName: 'United States Treasury',
      sectorIndex: 0,
      currency: 'USD',
      issueDate,
      datedDate: issueDate,
      maturityDate,
      originalTermYears: termYears(record.originalTerm),
      couponRate: 0,
      couponType: 'Zero',
      frequency: 2,
      dayCount: 'ACT/ACT',
      endOfMonth: false,
      amountOutstandingUsd: Math.round((record.offeringAmt ?? 0) * 0.04),
      quotationBasis: 'Decimal',
      ratingIndex: 0,
      seniority: 'Treasury',
      liquidityTier: (rankOf.get(record.cusip) ?? 9) === 0 ? 'T2' : 'T3',
      callable: false,
      callSchedule: [],
      benchmarkTenor: nearestBenchmark(termYears(record.originalTerm)),
      issueSpreadBp: 0,
      onTheRunRank: null,
    });
  }
  return out;
}
