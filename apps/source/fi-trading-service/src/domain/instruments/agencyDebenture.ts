/**
 * Agency debentures — the GSEs' own unsecured debt.
 *
 * They sit between Treasuries and corporates and behave like neither: a few
 * basis points of spread, government-sponsored but not guaranteed, and a large
 * callable segment that gives the sector negative convexity of its own,
 * separate from anything mortgage-related.
 */

import { addYears, formatIso, type DateInt } from '../core/dateInt.js';
import { isinFromCusip } from '../core/identifiers.js';
import { createRng, deriveSeed, pickWeighted, uniformInt } from '../core/rng.js';
import type { RedemptionOption } from '../analytics/workout.js';
import { mintCusip } from './treasuryCusip.js';
import type { Security } from './types.js';

export interface AgencyIssuer {
  name: string;
  shortName: string;
  cusipPrefix: string;
  /** Spread over Treasuries at five years, in basis points. */
  baseSpreadBp: number;
}

/** Real GSE CUSIP prefixes. */
export const AGENCY_ISSUERS: readonly AgencyIssuer[] = [
  { name: 'Federal National Mortgage Association', shortName: 'FNMA', cusipPrefix: '3135G0', baseSpreadBp: 18 },
  { name: 'Federal Home Loan Banks', shortName: 'FHLB', cusipPrefix: '3130A0', baseSpreadBp: 12 },
  { name: 'Federal Home Loan Mortgage Corp', shortName: 'FHLMC', cusipPrefix: '3137EA', baseSpreadBp: 17 },
  { name: 'Federal Farm Credit Banks', shortName: 'FFCB', cusipPrefix: '3133EN', baseSpreadBp: 14 },
  { name: 'Tennessee Valley Authority', shortName: 'TVA', cusipPrefix: '880591', baseSpreadBp: 26 },
];

const TERMS = [2, 3, 5, 7, 10, 20, 30] as const;
const TERM_WEIGHTS = [16, 16, 22, 12, 18, 6, 10] as const;
const SIZES = [100_000_000, 250_000_000, 500_000_000, 1_000_000_000, 2_000_000_000] as const;
const SIZE_WEIGHTS = [24, 26, 24, 18, 8] as const;

export interface AgencyOptions {
  asOf: DateInt;
  seed: number;
  startSecurityId: number;
  benchmarkYield: (issueDate: DateInt, tenorYears: number) => number;
  /** Debentures per issuer. */
  perIssuer?: number;
}

export function buildAgencyDebentures(options: AgencyOptions): Security[] {
  const perIssuer = options.perIssuer ?? 24;
  let securityId = options.startSecurityId;
  const out: Security[] = [];

  for (const agency of AGENCY_ISSUERS) {
    const rng = createRng(deriveSeed(options.seed, 'agency', agency.shortName));
    const used = new Set<string>();

    for (let i = 0; i < perIssuer; i++) {
      const termYears = pickWeighted(rng, TERMS, TERM_WEIGHTS);
      const ageYears = uniformInt(rng, 0, Math.max(1, Math.floor(termYears * 0.6)));
      const issueDate = addYears(options.asOf, -ageYears);
      const maturityDate = addYears(issueDate, termYears);
      if (maturityDate <= options.asOf) continue;

      // Roughly a third of agency issuance is callable, and it is the reason
      // the sector carries negative convexity without any mortgage in it.
      const isCallable = termYears >= 3 && rng() < 0.35;
      const spreadBp = agency.baseSpreadBp + Math.round(termYears * 0.9) + (isCallable ? 22 : 0);
      const benchmark = options.benchmarkYield(issueDate, termYears);
      const couponRate = Math.max(0.125, Math.round((benchmark + spreadBp / 100) * 8) / 8);

      const callSchedule: RedemptionOption[] = isCallable
        ? [{ date: addYears(issueDate, 1), price: 100, type: 'Call' }]
        : [];
      const cusip = mintCusip(agency.cusipPrefix, used, rng);
      const amount = pickWeighted(rng, SIZES, SIZE_WEIGHTS);

      out.push({
        securityId: securityId++,
        cusip,
        isin: isinFromCusip(cusip) ?? '',
        assetClass: 'Agency',
        securityType: 'AgencyDeb',
        description: `${agency.shortName} ${couponRate.toFixed(3)}% ${formatIso(maturityDate)}${isCallable ? ' CALLABLE' : ''}`,
        issuerId: -1,
        issuerName: agency.name,
        sectorIndex: 13,
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
        quotationBasis: 'Spread',
        ratingIndex: 0,
        seniority: 'Agency',
        liquidityTier: amount >= 1_000_000_000 ? 'T2' : ageYears > 3 ? 'T4' : 'T3',
        callable: isCallable,
        callSchedule,
        benchmarkTenor: termYears,
        issueSpreadBp: spreadBp,
        onTheRunRank: null,
      });
    }
  }
  return out;
}
