/**
 * Agency mortgage pools: TBA cohorts and specified pools.
 *
 * The mortgage market trades in two layers. Most volume is TBA — a promise to
 * deliver *some* pool of a given cohort and coupon on a given settlement date,
 * which is why it is the most liquid fixed-income product after Treasuries.
 * Underneath sit specified pools, identified by pool number, which trade at a
 * PAY-UP over TBA when their collateral prepays more slowly than generic.
 *
 * The pay-up table and the prepayment model have to tell the same story. An
 * 85,000-dollar-average-balance pool commands roughly a point and a half over
 * TBA precisely because `llbMult` says it prepays at 42% of generic speed. If
 * the two disagree, the structured book is internally inconsistent in a way
 * anyone who trades specified pools will notice immediately.
 *
 * Settlement follows the SIFMA class calendar, not T+2: 30-year conventionals
 * settle around the sixth business day, 15-years the ninth, Ginnies the
 * thirteenth. Notification is 15:00 ET two business days before.
 */

import { addMonths, addDays, formatIso, monthOf, toDateInt, yearOf, type DateInt } from '../core/dateInt.js';
import { rollForward } from '../core/businessDays.js';
import { completeCusip, isinFromCusip, issueCode } from '../core/identifiers.js';
import { createRng, deriveSeed, pickWeighted, uniformInt, type Rng } from '../core/rng.js';
import type { Calendar } from '../core/sifmaCalendar.js';
import type { PoolCollateral } from '../analytics/prepay/poolMultipliers.js';
import type { PoolState } from '../analytics/prepay/cprModel.js';
import type { LiquidityTier, Security } from './types.js';

export type TbaCohort = 'UMBS30' | 'UMBS20' | 'UMBS15' | 'GNMA2-30' | 'GNMA2-15';

/** SIFMA settlement classes, by roughly which business day they settle. */
export const SETTLEMENT_CLASS: Readonly<Record<TbaCohort, { klass: 'A' | 'B' | 'C'; businessDay: number }>> = {
  UMBS30: { klass: 'A', businessDay: 6 },
  UMBS20: { klass: 'A', businessDay: 6 },
  UMBS15: { klass: 'B', businessDay: 9 },
  'GNMA2-30': { klass: 'C', businessDay: 13 },
  'GNMA2-15': { klass: 'C', businessDay: 13 },
};

const COHORT_TERM_MONTHS: Readonly<Record<TbaCohort, number>> = {
  UMBS30: 360, UMBS20: 240, UMBS15: 180, 'GNMA2-30': 360, 'GNMA2-15': 180,
};

/** Guarantee fee plus minimum servicing, the gap from WAC to net coupon. */
const SERVICING_AND_GFEE = 0.71;

/** Coupons the TBA market actually trades, in half-point steps. */
export const TBA_COUPONS = [2, 2.5, 3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7] as const;

export type PoolStory =
  | 'Generic' | 'LLB85' | 'LLB110' | 'LLB150' | 'LLB175'
  | 'NewYork' | 'HighLTV' | 'Investor' | 'LowFICO' | 'FLTX' | 'SecondHome' | 'JumboConforming';

/**
 * Pay-up over TBA in 32nds, at a roughly one-point premium and at par.
 *
 * A story is only worth paying for when the pool is at a premium and therefore
 * at risk of prepaying; at par there is nothing to protect, so the pay-up
 * collapses. That moneyness dependence is as important as the levels.
 */
export const PAYUP_32NDS: Readonly<Record<PoolStory, { premium: number; par: number }>> = {
  Generic: { premium: 0, par: 0 },
  LLB85: { premium: 48, par: 6 },
  LLB110: { premium: 28, par: 4 },
  LLB150: { premium: 16, par: 2 },
  LLB175: { premium: 10, par: 1 },
  NewYork: { premium: 20, par: 3 },
  HighLTV: { premium: 22, par: 3 },
  Investor: { premium: 14, par: 2 },
  LowFICO: { premium: 12, par: 2 },
  FLTX: { premium: 8, par: 1 },
  SecondHome: { premium: 7, par: 1 },
  JumboConforming: { premium: 6, par: 1 },
};

/** Pay-up in points, scaled by how far above par the pool trades. */
export function payUpPoints(story: PoolStory, price: number): number {
  const table = PAYUP_32NDS[story];
  const moneyness = Math.min(1.6, Math.max(0.1, (price - 99.5) / 1.5));
  const ticks = table.par + (table.premium - table.par) * moneyness;
  return ticks / 32;
}

/** Collateral matching each story, feeding the prepayment multipliers. */
export function collateralForStory(story: PoolStory): PoolCollateral {
  const base: PoolCollateral = {
    averageLoanSize: 340_000,
    weightedAverageFico: 745,
    weightedAverageLtv: 72,
    sato: 0.1,
    states: { CA: 0.18, TX: 0.09, FL: 0.09, NY: 0.06, IL: 0.05, OH: 0.04 },
    occupancy: { ownerOccupied: 0.88, secondHome: 0.05, investor: 0.07 },
  };
  switch (story) {
    case 'LLB85': return { ...base, averageLoanSize: 85_000 };
    case 'LLB110': return { ...base, averageLoanSize: 110_000 };
    case 'LLB150': return { ...base, averageLoanSize: 150_000 };
    case 'LLB175': return { ...base, averageLoanSize: 175_000 };
    case 'NewYork': return { ...base, states: { NY: 1 } };
    case 'HighLTV': return { ...base, weightedAverageLtv: 97 };
    case 'Investor': return { ...base, occupancy: { ownerOccupied: 0, secondHome: 0, investor: 1 } };
    case 'LowFICO': return { ...base, weightedAverageFico: 665, sato: 0.45 };
    case 'FLTX': return { ...base, states: { FL: 0.5, TX: 0.5 } };
    case 'SecondHome': return { ...base, occupancy: { ownerOccupied: 0, secondHome: 1, investor: 0 } };
    case 'JumboConforming': return { ...base, averageLoanSize: 720_000 };
    case 'Generic': return base;
  }
}

/**
 * Real agency pool-number and CUSIP prefixes.
 *
 * The CUSIP prefix must be exactly six characters: six of issuer plus a
 * two-character issue code makes the eight-character stem a check digit is
 * computed over. A five-character prefix produces a seven-character stem,
 * `completeCusip` rejects it, and the builder silently emits nothing.
 */
const POOL_PREFIX: Readonly<Record<TbaCohort, { pool: string; cusip: string }>> = {
  UMBS30: { pool: 'CL', cusip: '3140J8' },
  UMBS20: { pool: 'CI', cusip: '3140K3' },
  UMBS15: { pool: 'MA', cusip: '3140Q5' },
  'GNMA2-30': { pool: 'MA', cusip: '36179T' },
  'GNMA2-15': { pool: 'MA', cusip: '36202F' },
};

/** The settlement date for a cohort in a given month. */
export function tbaSettlementDate(cohort: TbaCohort, month: DateInt, calendar: Calendar): DateInt {
  const target = SETTLEMENT_CLASS[cohort].businessDay;
  let cursor = rollForward(calendar, toDateInt(yearOf(month), monthOf(month), 1));
  for (let i = 1; i < target; i++) cursor = rollForward(calendar, addDays(cursor, 1));
  return cursor;
}

/** Notification is 15:00 ET two business days before settlement. */
export function tbaNotificationDate(settlement: DateInt, calendar: Calendar): DateInt {
  let cursor = settlement;
  for (let i = 0; i < 2; i++) {
    cursor = addDays(cursor, -1);
    while (!calendar.isBusinessDay(cursor)) cursor = addDays(cursor, -1);
  }
  return cursor;
}

export interface MbsUniverseOptions {
  asOf: DateInt;
  calendar: Calendar;
  seed: number;
  startSecurityId: number;
  /** Specified pools to build per cohort and coupon. */
  poolsPerCohortCoupon?: number;
  /** Cohorts to include. Defaults to all. */
  cohorts?: readonly TbaCohort[];
}

export interface MbsPoolRecord {
  security: Security;
  pool: PoolState;
  story: PoolStory;
  poolNumber: string;
  cohort: TbaCohort;
  /** Pay-up over TBA in 32nds at a one-point premium. */
  payUpTicksAtPremium: number;
}

const STORY_WEIGHTS: readonly (readonly [PoolStory, number])[] = [
  ['Generic', 34], ['LLB85', 5], ['LLB110', 7], ['LLB150', 8], ['LLB175', 8],
  ['NewYork', 6], ['HighLTV', 6], ['Investor', 7], ['LowFICO', 5],
  ['FLTX', 6], ['SecondHome', 4], ['JumboConforming', 4],
];

function poolLiquidity(story: PoolStory, originalFace: number): LiquidityTier {
  if (story === 'Generic') return originalFace > 400_000_000 ? 'T2' : 'T3';
  return originalFace > 200_000_000 ? 'T3' : 'T4';
}

/** Build the specified-pool universe, with the pool state each one prices off. */
export function buildMbsPools(options: MbsUniverseOptions): MbsPoolRecord[] {
  const cohorts = options.cohorts ?? (Object.keys(COHORT_TERM_MONTHS) as TbaCohort[]);
  const perCombination = options.poolsPerCohortCoupon ?? 3;
  let securityId = options.startSecurityId;
  const out: MbsPoolRecord[] = [];

  for (const cohort of cohorts) {
    const termMonths = COHORT_TERM_MONTHS[cohort];
    const prefixes = POOL_PREFIX[cohort];
    const used = new Set<string>();

    for (const coupon of TBA_COUPONS) {
      for (let i = 0; i < perCombination; i++) {
        const rng = createRng(deriveSeed(options.seed, 'mbs', cohort, coupon, i));
        const story = pickWeighted(rng, STORY_WEIGHTS.map(([s]) => s), STORY_WEIGHTS.map(([, w]) => w));
        const wala = uniformInt(rng, 3, Math.min(96, termMonths - 24));
        const issueDate = addMonths(options.asOf, -wala);
        const maturityDate = addMonths(issueDate, termMonths);

        // The factor is published monthly to eight decimals and STEPS - it
        // does not drift continuously, and a continuous factor is a tell.
        const factor = Number(Math.max(0.02, 1 - wala * 0.0045 - rng() * 0.06).toFixed(8));
        const originalFace = uniformInt(rng, 8, 90) * 25_000_000;
        const poolNumber = `${prefixes.pool}${uniformInt(rng, 100000, 999999)}`;

        let cusip = '';
        for (let attempt = 0; attempt < 512; attempt++) {
          const stem = `${prefixes.cusip}${issueCode(uniformInt(rng, 0, 34 * 34 - 1))}`;
          if (stem.length !== 8 || used.has(stem)) continue;
          const candidate = completeCusip(stem);
          if (candidate === null) continue;
          used.add(stem);
          cusip = candidate;
          break;
        }
        if (cusip === '') continue;

        const collateral = collateralForStory(story);
        const pool: PoolState = {
          weightedAverageCoupon: coupon + SERVICING_AND_GFEE,
          netCoupon: coupon,
          weightedAverageMaturity: termMonths - wala,
          weightedAverageLoanAge: wala,
          factor,
          originalFaceUsd: originalFace,
          collateral,
          cumulativeInTheMoneyMonths: 0,
        };

        out.push({
          cohort,
          story,
          poolNumber,
          payUpTicksAtPremium: PAYUP_32NDS[story].premium,
          pool,
          security: {
            securityId: securityId++,
            cusip,
            isin: isinFromCusip(cusip) ?? '',
            assetClass: 'AgencyMBS',
            securityType: 'PassThrough',
            description: `${cohort} ${coupon.toFixed(1)} ${poolNumber} ${story} ${formatIso(maturityDate)}`,
            issuerId: -1,
            issuerName: cohort.startsWith('GNMA') ? 'Government National Mortgage Association' : 'Fannie Mae / Freddie Mac',
            sectorIndex: 13,
            currency: 'USD',
            issueDate,
            datedDate: issueDate,
            maturityDate,
            originalTermYears: termMonths / 12,
            couponRate: coupon,
            couponType: 'Fixed',
            frequency: 12,
            dayCount: '30/360',
            endOfMonth: false,
            amountOutstandingUsd: Math.round(originalFace * factor),
            quotationBasis: 'Thirty2nds',
            ratingIndex: 0,
            seniority: 'Agency',
            liquidityTier: poolLiquidity(story, originalFace),
            callable: false,
            callSchedule: [],
            benchmarkTenor: 10,
            issueSpreadBp: 0,
            onTheRunRank: null,
          },
        });
      }
    }
  }
  return out;
}

/** Pools of one cohort and coupon — a TBA-deliverable set. */
export function cohortPools(
  records: readonly MbsPoolRecord[],
  cohort: TbaCohort,
  coupon: number,
): MbsPoolRecord[] {
  return records.filter((r) => r.cohort === cohort && r.security.couponRate === coupon);
}

/** Deterministic pool-number check, for callers that need one. */
export function isPoolNumber(value: string, rng?: Rng): boolean {
  void rng;
  return /^[A-Z]{2}\d{6}$/.test(value);
}
