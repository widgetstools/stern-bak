/**
 * Collateralised loan obligations.
 *
 * A CLO is not a bond with a rating; it is a leveraged fund with tests. Three
 * mechanics carry the realism and all three are computed, never assigned:
 *
 * **WARF is derived from the pool**, as the par-weighted average of Moody's
 * rating factors — which are exponential in credit quality, so a few CCCs move
 * it far more than the same par of BBs. Drawing a plausible WARF directly and
 * a plausible pool separately produces a deal whose stated quality and stated
 * collateral disagree.
 *
 * **Overcollateralisation tests** compare collateral par to cumulative debt at
 * each class. They are what make a CLO respond to a credit selloff
 * STRUCTURALLY rather than cosmetically: when the Caa bucket swells past its
 * limit, the excess is carried at market value in the OC numerator, cushions
 * compress, and on a breach cash diverts from the equity to amortise the AAA.
 *
 * **Equity is levered about nine and a half times.** The subordinated notes
 * are a tenth of the capital structure, so a two-point move in loan prices is
 * nineteen points of net asset value. If the equity tranche in a blotter moves
 * like a bond, the deal is not modelled.
 */

import { addYears, formatIso, toDateInt, yearOf, type DateInt } from '../core/dateInt.js';
import { completeCusip, isinFromCusip, issueCode } from '../core/identifiers.js';
import { createRng, deriveSeed, pickWeighted, uniformInt, type Rng } from '../core/rng.js';
import type { Security } from './types.js';

/**
 * Moody's rating factors, indexed by this model's rating buckets.
 *
 * Exponential rather than linear: a Caa is worth 24 B-equivalents in WARF, and
 * that convexity is why a small CCC bucket dominates a deal's stated quality.
 */
export const RATING_FACTOR: readonly number[] = [1, 20, 120, 360, 1350, 2720, 6500, 10000];

export interface CloLoan {
  obligorName: string;
  ratingIndex: number;
  parUsd: number;
  spreadBp: number;
  /** Market price per 100. Below par when the credit is impaired. */
  price: number;
}

/** Par-weighted average rating factor. The industry quality measure. */
export function weightedAverageRatingFactor(loans: readonly CloLoan[]): number {
  let weighted = 0;
  let par = 0;
  for (const loan of loans) {
    weighted += (RATING_FACTOR[loan.ratingIndex] ?? 2720) * loan.parUsd;
    par += loan.parUsd;
  }
  return par <= 0 ? 0 : weighted / par;
}

/** Par-weighted average spread over the floating index, in basis points. */
export function weightedAverageSpread(loans: readonly CloLoan[]): number {
  let weighted = 0;
  let par = 0;
  for (const loan of loans) {
    weighted += loan.spreadBp * loan.parUsd;
    par += loan.parUsd;
  }
  return par <= 0 ? 0 : weighted / par;
}

/** Share of the pool rated Caa or worse, which the OC test haircuts. */
export function caaBucketShare(loans: readonly CloLoan[]): number {
  let caa = 0;
  let par = 0;
  for (const loan of loans) {
    if (loan.ratingIndex >= 6) caa += loan.parUsd;
    par += loan.parUsd;
  }
  return par <= 0 ? 0 : caa / par;
}

/** Diversity score, capped. A crude but standard concentration measure. */
export function diversityScore(loans: readonly CloLoan[]): number {
  return Math.min(100, Math.round(loans.length * 0.42));
}

/** Limit above which the Caa bucket is carried at market value. */
export const CAA_LIMIT = 0.075;

/**
 * Adjusted collateral par for the OC numerator.
 *
 * Par above the Caa limit is carried at MARKET VALUE, not par. This is the
 * mechanic that transmits a credit selloff into the structure: as the Caa
 * bucket swells and its prices fall, the numerator drops twice over.
 */
export function adjustedCollateralPar(loans: readonly CloLoan[], defaultedParUsd = 0): number {
  const totalPar = loans.reduce((sum, loan) => sum + loan.parUsd, 0);
  const caaLoans = loans.filter((loan) => loan.ratingIndex >= 6);
  const caaPar = caaLoans.reduce((sum, loan) => sum + loan.parUsd, 0);
  const limit = CAA_LIMIT * totalPar;

  let adjusted = totalPar - defaultedParUsd;
  if (caaPar > limit) {
    const excess = caaPar - limit;
    const caaMarketValue =
      caaPar <= 0 ? 0 : caaLoans.reduce((sum, loan) => sum + (loan.parUsd * loan.price) / 100, 0) / caaPar;
    adjusted -= excess * (1 - caaMarketValue);
  }
  return adjusted;
}

export interface CoverageTest {
  trancheId: string;
  /** Adjusted collateral par over cumulative debt par. */
  ratio: number;
  trigger: number;
  cushionBp: number;
  passing: boolean;
}

/** Debt stack as a share of collateral par, senior first. */
const CLO_DEBT_STACK: readonly (readonly [string, number, number, number, number])[] = [
  // id, share of collateral par, rating index, spread over SOFR, OC trigger
  ['A-1', 0.61, 0, 148, 0],
  ['A-2', 0.11, 1, 195, 1.28],
  ['B', 0.06, 2, 235, 1.19],
  ['C', 0.055, 3, 340, 1.12],
  ['D', 0.045, 4, 610, 1.07],
  ['E', 0.025, 5, 880, 1.04],
];

/** Upfront costs, funded by the equity. */
export const UPFRONT_COST_PCT = 0.01;

/** Subordinated notes as a share of collateral par: what is left over. */
export function subordinatedShare(): number {
  const debt = CLO_DEBT_STACK.reduce((sum, [, share]) => sum + share, 0);
  return 1 + UPFRONT_COST_PCT - debt;
}

/** Collateral par divided by subordinated notes par — the equity's leverage. */
export function equityLeverage(): number {
  return 1 / subordinatedShare();
}

/** Every overcollateralisation test, computed from the pool. */
export function coverageTests(
  loans: readonly CloLoan[],
  collateralParUsd: number,
  defaultedParUsd = 0,
): CoverageTest[] {
  const adjusted = adjustedCollateralPar(loans, defaultedParUsd);
  const tests: CoverageTest[] = [];
  let cumulativeDebt = 0;
  for (const [trancheId, share, , , trigger] of CLO_DEBT_STACK) {
    cumulativeDebt += share * collateralParUsd;
    if (trigger <= 0) continue;
    const ratio = cumulativeDebt <= 0 ? 0 : adjusted / cumulativeDebt;
    tests.push({
      trancheId,
      ratio,
      trigger,
      cushionBp: Math.round((ratio - trigger) * 10000),
      passing: ratio >= trigger,
    });
  }
  return tests;
}

/**
 * Equity net asset value per 100 of subordinated notes.
 *
 * `(collateral market value - debt par) / subordinated par`. At a collateral
 * price of 98.5 this is 76; at 96.5 it is 57. A two-point move in loan prices
 * is nineteen points of NAV, which is the leverage doing its work.
 */
export function equityNav(
  collateralParUsd: number,
  collateralPricePct: number,
  debtParUsd: number,
  subordinatedParUsd: number,
): number {
  if (subordinatedParUsd <= 0) return 0;
  const marketValue = (collateralParUsd * collateralPricePct) / 100;
  return ((marketValue - debtParUsd) / subordinatedParUsd) * 100;
}

export interface CloDeal {
  dealId: string;
  manager: string;
  vintage: number;
  dealType: 'BSL' | 'MM';
  collateralParUsd: number;
  reinvestmentEndDate: DateInt;
  nonCallEndDate: DateInt;
  warf: number;
  weightedAverageSpreadBp: number;
  weightedAverageRecoveryPct: number;
  diversityScore: number;
  caaBucketPct: number;
  defaultedParUsd: number;
  loans: CloLoan[];
  coverageTests: CoverageTest[];
  equityNavPct: number;
  equityLeverage: number;
}

const MANAGERS = [
  'Carlyle Investment Management', 'Golub Capital', 'Ares Management', 'Bain Capital Credit',
  'Blackstone Credit', 'Neuberger Berman', 'Octagon Credit', 'CIFC Asset Management',
] as const;

/** Pool rating mix, tuned so a BSL deal lands in the 2750-2950 WARF band. */
const POOL_MIX: readonly (readonly [number, number])[] = [
  [3, 6], [4, 12], [5, 72], [6, 10],
];

export interface CloOptions {
  asOf: DateInt;
  seed: number;
  startSecurityId: number;
  dealCount?: number;
  /** Collateral price, which drives the equity NAV. */
  collateralPricePct?: number;
}

function buildLoanPool(rng: Rng, collateralParUsd: number, loanCount: number): CloLoan[] {
  const loans: CloLoan[] = [];
  const averagePar = collateralParUsd / loanCount;
  for (let i = 0; i < loanCount; i++) {
    const ratingIndex = pickWeighted(rng, POOL_MIX.map(([r]) => r), POOL_MIX.map(([, w]) => w));
    const impaired = ratingIndex >= 6;
    loans.push({
      obligorName: `Obligor ${String(i + 1).padStart(3, '0')}`,
      ratingIndex,
      parUsd: Math.round(averagePar * (0.55 + rng() * 0.9)),
      spreadBp: 300 + (ratingIndex - 3) * 55 + uniformInt(rng, -40, 60),
      price: impaired ? 62 + rng() * 22 : 96 + rng() * 3.5,
    });
  }
  return loans;
}

export function buildCloDeals(options: CloOptions): { deals: CloDeal[]; securities: Security[] } {
  const dealCount = options.dealCount ?? 16;
  const collateralPrice = options.collateralPricePct ?? 98.5;
  const asOfYear = yearOf(options.asOf);
  const deals: CloDeal[] = [];
  const securities: Security[] = [];
  let securityId = options.startSecurityId;

  for (let d = 0; d < dealCount; d++) {
    const rng = createRng(deriveSeed(options.seed, 'clo', d));
    const vintage = asOfYear - uniformInt(rng, 0, 4);
    const dealType: 'BSL' | 'MM' = rng() < 0.78 ? 'BSL' : 'MM';
    const collateralParUsd = uniformInt(rng, 300, 700) * 1_000_000;
    const loans = buildLoanPool(rng, collateralParUsd, dealType === 'BSL' ? uniformInt(rng, 190, 260) : uniformInt(rng, 80, 130));
    const defaultedParUsd = Math.round(collateralParUsd * rng() * 0.012);

    const tests = coverageTests(loans, collateralParUsd, defaultedParUsd);
    const debtParUsd = CLO_DEBT_STACK.reduce((sum, [, share]) => sum + share * collateralParUsd, 0);
    const subordinatedParUsd = subordinatedShare() * collateralParUsd;

    const deal: CloDeal = {
      dealId: `${MANAGERS[d % MANAGERS.length]?.split(' ')[0]} CLO ${vintage}-${uniformInt(rng, 1, 4)}`,
      manager: MANAGERS[d % MANAGERS.length] as string,
      vintage,
      dealType,
      collateralParUsd,
      reinvestmentEndDate: addYears(toDateInt(vintage, 7, 20), 5),
      nonCallEndDate: addYears(toDateInt(vintage, 7, 20), 2),
      warf: Math.round(weightedAverageRatingFactor(loans)),
      weightedAverageSpreadBp: Math.round(weightedAverageSpread(loans)),
      weightedAverageRecoveryPct: Number((62 + rng() * 8).toFixed(1)),
      diversityScore: diversityScore(loans),
      caaBucketPct: Number((caaBucketShare(loans) * 100).toFixed(2)),
      defaultedParUsd,
      loans,
      coverageTests: tests,
      equityNavPct: Number(equityNav(collateralParUsd, collateralPrice, debtParUsd, subordinatedParUsd).toFixed(1)),
      equityLeverage: Number(equityLeverage().toFixed(2)),
    };
    deals.push(deal);

    const prefix = `${String(12500 + d * 3).slice(0, 5)}C`;
    let codeIndex = 0;
    const classes: readonly (readonly [string, number, number, number])[] = [
      ...CLO_DEBT_STACK.map(([id, share, rating, spread]) => [id, share, rating, spread] as const),
      ['SUB', subordinatedShare(), 7, 0] as const,
    ];
    for (const [trancheId, share, ratingIndex, spreadBp] of classes) {
      const cusip = completeCusip(`${prefix}${issueCode(codeIndex++)}`);
      if (cusip === null) continue;
      const maturityDate = toDateInt(vintage + 13, 7, 20);
      if (maturityDate <= options.asOf) continue;

      securities.push({
        securityId: securityId++,
        cusip,
        isin: isinFromCusip(cusip) ?? '',
        assetClass: 'CLO',
        securityType: 'CloTranche',
        description: `${deal.dealId} ${trancheId}`,
        issuerId: -(3000 + d),
        issuerName: deal.dealId,
        sectorIndex: 0,
        currency: 'USD',
        issueDate: toDateInt(vintage, 7, 20),
        datedDate: toDateInt(vintage, 7, 20),
        maturityDate,
        originalTermYears: 13,
        couponRate: Number((5.2 + spreadBp / 100).toFixed(3)),
        couponType: trancheId === 'SUB' ? 'Zero' : 'Floating',
        frequency: 4,
        dayCount: 'ACT/360',
        endOfMonth: false,
        amountOutstandingUsd: Math.round(share * collateralParUsd),
        quotationBasis: trancheId === 'SUB' ? 'Decimal' : 'DiscountMargin',
        ratingIndex,
        seniority: trancheId === 'SUB' ? 'Equity' : ratingIndex <= 3 ? 'Senior' : 'Mezzanine',
        liquidityTier: ratingIndex <= 1 ? 'T3' : ratingIndex <= 3 ? 'T4' : 'T5',
        callable: true,
        callSchedule: [{ date: deal.nonCallEndDate, price: 100, type: 'Call' }],
        benchmarkTenor: 5,
        issueSpreadBp: spreadBp,
        onTheRunRank: null,
      });
    }
  }
  return { deals, securities };
}
