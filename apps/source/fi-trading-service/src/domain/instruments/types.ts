/**
 * The shape every generated security shares.
 *
 * Deliberately flat and terms-only: this describes what the instrument IS, not
 * what it is worth. Prices, yields and risk are computed from these terms plus
 * the factor state, never stored alongside them, which is what stops the two
 * from contradicting each other.
 *
 * Asset-class specifics (pool factors, tranche attachment points, CDS red
 * codes) hang off the optional sub-records rather than widening this into a
 * union with two hundred mostly-null columns.
 */

import type { DateInt } from '../core/dateInt.js';
import type { DayCountConvention } from '../core/dayCount.js';
import type { CouponFrequency } from '../analytics/schedule.js';
import type { RedemptionOption } from '../analytics/workout.js';
import type { QuotationBasis } from '../core/tickPrice.js';

export type AssetClass =
  | 'Rates'
  | 'Agency'
  | 'CorpIG'
  | 'CorpHY'
  | 'Muni'
  | 'AgencyMBS'
  | 'CMBS'
  | 'RMBS'
  | 'ABS'
  | 'CLO'
  | 'CDS';

export type SecurityType =
  | 'TBill'
  | 'TNote'
  | 'TBond'
  | 'TIPS'
  | 'FRN'
  | 'Strip'
  | 'AgencyDeb'
  | 'CorpBond'
  | 'CorpFloater'
  | 'MuniBond'
  | 'PassThrough'
  | 'CmbsTranche'
  | 'RmbsTranche'
  | 'AbsTranche'
  | 'CloTranche'
  | 'CdsSingleName'
  | 'CdsIndex';

export type CouponType = 'Fixed' | 'Zero' | 'Floating' | 'Inflation' | 'Step';

export type Seniority =
  | 'Treasury'
  | 'Agency'
  | 'SeniorSecured'
  | 'SeniorUnsecured'
  | 'Subordinated'
  | 'JuniorSubordinated'
  | 'Senior'
  | 'Mezzanine'
  | 'Junior'
  | 'Equity';

/** Liquidity tier, driving bid/ask, quote arrival and trade intensity. */
export type LiquidityTier = 'T1' | 'T2' | 'T3' | 'T4' | 'T5';

export interface Security {
  securityId: number;
  cusip: string;
  isin: string;
  assetClass: AssetClass;
  securityType: SecurityType;
  /** What a blotter shows: issuer, coupon, maturity. */
  description: string;

  issuerId: number;
  issuerName: string;
  /** Index into CREDIT_SECTORS. */
  sectorIndex: number;
  currency: 'USD';

  /** When it was auctioned or priced. */
  issueDate: DateInt;
  /** When interest starts accruing. Usually the issue date. */
  datedDate: DateInt;
  maturityDate: DateInt;
  /** Term at issue, in years. */
  originalTermYears: number;

  couponRate: number;
  couponType: CouponType;
  frequency: CouponFrequency;
  dayCount: DayCountConvention;
  endOfMonth: boolean;

  amountOutstandingUsd: number;
  quotationBasis: QuotationBasis;
  /** Index into RATING_BUCKETS. */
  ratingIndex: number;
  seniority: Seniority;
  liquidityTier: LiquidityTier;

  callable: boolean;
  /** Empty for a bullet. Make-whole calls are flagged, not priced as fixed. */
  callSchedule: RedemptionOption[];

  /** Benchmark tenor the spread is quoted against, in years. */
  benchmarkTenor: number;
  /** Spread at issue, in basis points. Zero for Treasuries. */
  issueSpreadBp: number;

  /**
   * Recency rank within its auction cycle: 0 is on-the-run, 1 is first
   * off-the-run, and so on. Null for anything that is not auctioned.
   */
  onTheRunRank: number | null;
}

/** Years from `asOf` to maturity. Approximate; used for bucketing, not pricing. */
export function yearsToMaturity(security: Security, asOf: DateInt): number {
  const from = Math.trunc(asOf / 10000) + ((Math.trunc(asOf / 100) % 100) - 1) / 12 + (asOf % 100) / 365;
  const to =
    Math.trunc(security.maturityDate / 10000) +
    ((Math.trunc(security.maturityDate / 100) % 100) - 1) / 12 +
    (security.maturityDate % 100) / 365;
  return Math.max(0, to - from);
}

/** True when the security is the current benchmark for its tenor. */
export function isOnTheRun(security: Security): boolean {
  return security.onTheRunRank === 0;
}
