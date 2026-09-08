/**
 * Corporate bonds, built as capital structures rather than one at a time.
 *
 * Each issuer gets three to eight bonds across the curve, all sharing its
 * six-character CUSIP prefix and its credit curve. That is what makes an
 * issuer curve exist at all — you can plot a name's 5s, 10s and 30s and see a
 * shape, and when the name gaps on news the whole curve gaps together.
 *
 * Two conventions worth stating:
 *
 *  - **Coupons are set at issue, not today.** A bond issued five years ago
 *    carries the coupon that priced it near par THEN, which is why a seasoned
 *    book contains 2% bonds trading at 82 alongside 6% bonds at 104. Making
 *    every coupon reflect today's curve produces a book that is uniformly near
 *    par, which never happens.
 *  - **Amounts outstanding are round.** Benchmark issues come in 500 million,
 *    750 million, 1 billion, and so on. An amount like $487,331,204 is an
 *    instant tell that a number generator, not a syndicate desk, set the size.
 */

import { addMonths, addYears, type DateInt } from '../core/dateInt.js';
import { isinFromCusip } from '../core/identifiers.js';
import { formatIso } from '../core/dateInt.js';
import { createRng, deriveSeed, pick, pickWeighted, uniformInt, type Rng } from '../core/rng.js';
import { issuerSpreadAtTenor } from '../curves/creditFactors.js';
import type { RedemptionOption } from '../analytics/workout.js';
import type { Issuer } from './creditIssuers.js';
import { mintCusip } from './treasuryCusip.js';
import type { LiquidityTier, Security, Seniority } from './types.js';

/** Benchmark deal sizes. Syndicate desks price round numbers. */
const DEAL_SIZES_USD = [
  300_000_000, 400_000_000, 500_000_000, 600_000_000, 750_000_000,
  1_000_000_000, 1_250_000_000, 1_500_000_000, 2_000_000_000, 3_000_000_000,
] as const;
const DEAL_SIZE_WEIGHTS = [10, 8, 18, 8, 14, 16, 8, 7, 6, 5] as const;

/** Tenors a corporate curve is actually built on. */
const ISSUE_TERMS = [2, 3, 5, 7, 10, 20, 30] as const;
const TERM_WEIGHTS = [8, 10, 22, 12, 24, 8, 16] as const;

/** Coupons print in eighths for investment grade, quarters for high yield. */
function roundCoupon(rate: number, isHighYield: boolean): number {
  const step = isHighYield ? 0.125 : 0.125;
  return Math.max(step, Math.round(rate / step) * step);
}

function seniorityFor(issuer: Issuer, rng: Rng): Seniority {
  if (issuer.sectorIndex === 0 || issuer.sectorIndex === 8) {
    // Banks and insurers issue a real subordinated stack.
    return pickWeighted(rng, ['SeniorUnsecured', 'Subordinated', 'JuniorSubordinated'] as const, [72, 20, 8]);
  }
  if (issuer.isHighYield) {
    return pickWeighted(rng, ['SeniorUnsecured', 'SeniorSecured', 'Subordinated'] as const, [55, 38, 7]);
  }
  return pickWeighted(rng, ['SeniorUnsecured', 'SeniorSecured'] as const, [94, 6]);
}

/** Spread multiplier by seniority — subordination costs, and costs more in stress. */
const SENIORITY_SPREAD: Record<Seniority, number> = {
  Treasury: 1,
  Agency: 1,
  SeniorSecured: 0.8,
  SeniorUnsecured: 1,
  Subordinated: 1.45,
  JuniorSubordinated: 2.1,
  Senior: 1,
  Mezzanine: 1.6,
  Junior: 2.2,
  Equity: 3,
};

/** Ratings are notched down for subordinated debt. */
function notchFor(seniority: Seniority): number {
  if (seniority === 'SeniorSecured') return -1;
  if (seniority === 'Subordinated') return 2;
  if (seniority === 'JuniorSubordinated') return 4;
  return 0;
}

function liquidityFor(amount: number, ageYears: number, isHighYield: boolean): LiquidityTier {
  if (amount >= 1_000_000_000 && ageYears < 1) return 'T2';
  if (amount >= 750_000_000 && ageYears < 3) return isHighYield ? 'T3' : 'T2';
  if (amount >= 500_000_000 && ageYears < 6) return 'T3';
  return ageYears > 8 ? 'T5' : 'T4';
}

/**
 * Call structure.
 *
 * Investment grade issues a make-whole call plus a par call in the last few
 * months — neither of which is ever the worst outcome, so the bond quotes to
 * maturity. High yield issues a genuine step-down schedule after a non-call
 * period, which frequently IS the worst outcome. Treating the two the same
 * would put every IG bond on a false yield-to-call.
 */
function callScheduleFor(
  issuer: Issuer,
  issueDate: DateInt,
  maturityDate: DateInt,
  termYears: number,
  couponRate: number,
): RedemptionOption[] {
  if (!issuer.isHighYield) {
    const parCallMonths = termYears >= 10 ? 6 : 3;
    return [
      { date: addYears(issueDate, 1), price: 100, type: 'Call', makeWhole: true },
      { date: addMonths(maturityDate, -parCallMonths), price: 100, type: 'Call' },
    ];
  }
  const nonCallYears = termYears >= 8 ? 4 : termYears >= 6 ? 3 : 2;
  const firstCall = addYears(issueDate, nonCallYears);
  const steps = 3;
  const schedule: RedemptionOption[] = [];
  for (let i = 0; i < steps; i++) {
    const premium = (couponRate / 2) * (1 - i / steps);
    schedule.push({
      date: addYears(firstCall, i),
      price: Number((100 + premium).toFixed(3)),
      type: 'Call',
    });
  }
  return schedule;
}

export interface CreditBondOptions {
  issuers: readonly Issuer[];
  asOf: DateInt;
  seed: number;
  startSecurityId: number;
  /** Treasury par yield at a tenor as of a date, for setting coupons at issue. */
  benchmarkYield: (issueDate: DateInt, tenorYears: number) => number;
  minPerIssuer?: number;
  maxPerIssuer?: number;
}

export function buildCreditBonds(options: CreditBondOptions): Security[] {
  const minPer = options.minPerIssuer ?? 3;
  const maxPer = options.maxPerIssuer ?? 8;
  let securityId = options.startSecurityId;
  const out: Security[] = [];

  for (const issuer of options.issuers) {
    const rng = createRng(deriveSeed(options.seed, 'creditBonds', issuer.issuerId));
    const used = new Set<string>();
    const count = uniformInt(rng, minPer, maxPer);

    for (let i = 0; i < count; i++) {
      const termYears = pickWeighted(rng, ISSUE_TERMS, TERM_WEIGHTS);
      // Issued somewhere in the first two thirds of its life, so the book
      // holds a realistic mix of recent and seasoned paper.
      const ageYears = Math.min(termYears - 1, uniformInt(rng, 0, Math.max(1, Math.floor(termYears * 0.66))));
      const issueDate = addYears(options.asOf, -ageYears);
      const maturityDate = addYears(issueDate, termYears);
      if (maturityDate <= options.asOf) continue;

      const seniority = seniorityFor(issuer, rng);
      const ratingIndex = Math.max(0, Math.min(7, issuer.ratingIndex + notchFor(seniority)));
      const spreadAtTenor =
        issuerSpreadAtTenor(issuer.baseSpread5yBp, termYears) * (SENIORITY_SPREAD[seniority] ?? 1);
      const benchmark = options.benchmarkYield(issueDate, termYears);
      const couponRate = roundCoupon(benchmark + spreadAtTenor / 100, issuer.isHighYield);

      const cusip = mintCusip(issuer.cusipPrefix, used, rng);
      const amount = pickWeighted(rng, DEAL_SIZES_USD, DEAL_SIZE_WEIGHTS);
      const callSchedule = callScheduleFor(issuer, issueDate, maturityDate, termYears, couponRate);

      out.push({
        securityId: securityId++,
        cusip,
        isin: isinFromCusip(cusip) ?? '',
        assetClass: issuer.isHighYield ? 'CorpHY' : 'CorpIG',
        securityType: 'CorpBond',
        description: `${issuer.name.toUpperCase()} ${couponRate.toFixed(3)}% ${formatIso(maturityDate)}`,
        issuerId: issuer.issuerId,
        issuerName: issuer.name,
        sectorIndex: issuer.sectorIndex,
        currency: 'USD',
        issueDate,
        datedDate: issueDate,
        maturityDate,
        originalTermYears: termYears,
        couponRate,
        couponType: 'Fixed',
        frequency: 2,
        dayCount: '30/360',
        endOfMonth: false,
        amountOutstandingUsd: amount,
        quotationBasis: issuer.isHighYield ? 'Eighths' : 'Spread',
        ratingIndex,
        seniority,
        liquidityTier: liquidityFor(amount, ageYears, issuer.isHighYield),
        callable: callSchedule.some((option) => option.makeWhole !== true),
        callSchedule,
        benchmarkTenor: termYears,
        issueSpreadBp: Math.round(spreadAtTenor),
        onTheRunRank: null,
      });
    }
  }
  return out;
}

/** Every bond of one issuer, shortest maturity first — the issuer curve. */
export function issuerCurve(securities: readonly Security[], issuerId: number): Security[] {
  return securities
    .filter((security) => security.issuerId === issuerId)
    .sort((a, b) => a.maturityDate - b.maturityDate);
}

/** Bonds sharing a CUSIP prefix. Should be exactly one issuer's. */
export function byCusipPrefix(securities: readonly Security[], prefix: string): Security[] {
  return securities.filter((security) => security.cusip.startsWith(prefix));
}

/** A random tenor from the issuance set, for callers that need one. */
export function pickIssueTerm(rng: Rng): number {
  return pick(rng, ISSUE_TERMS);
}
