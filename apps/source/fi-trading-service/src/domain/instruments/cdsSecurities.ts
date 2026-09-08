/**
 * Single-name CDS as securities on the book.
 *
 * A swap is not a bond and the row proves it: the quantity is notional with a
 * direction rather than face with a price, the "price" is points upfront, the
 * maturity is an IMM date rather than an anniversary, and the coupon is one of
 * two fixed values (100 or 500 bp under SNAC) rather than whatever the issuer
 * priced at. All of that is already modelled in `cdsContracts` and `cdsEntities`;
 * this is the adapter that lets a swap sit in the same book as its cash bonds.
 *
 * The `issuerId` is the point. A CDS built here shares its issuer with the
 * corporate bonds built by `creditBonds`, so the bond-CDS basis is a join on a
 * key rather than a fuzzy name match — which is what makes a basis package
 * expressible at all.
 */

import { addMonths, type DateInt } from '../core/dateInt.js';
import { createRng, deriveSeed } from '../core/rng.js';
import type { CdsEntity } from './cdsEntities.js';
import { protectionStart, standardMaturity, tenorYears, type CdsTenor } from './cdsContracts.js';
import type { Security } from './types.js';

/** Tenors a single-name desk actually runs risk in, with their weights. */
const TENOR_MIX: readonly { tenor: CdsTenor; weight: number }[] = [
  { tenor: '3Y', weight: 0.15 },
  { tenor: '5Y', weight: 0.6 },
  { tenor: '7Y', weight: 0.1 },
  { tenor: '10Y', weight: 0.15 },
];

function pickTenor(draw: number): CdsTenor {
  let cumulative = 0;
  for (const entry of TENOR_MIX) {
    cumulative += entry.weight;
    if (draw < cumulative) return entry.tenor;
  }
  return '5Y';
}

export interface CdsSecurityOptions {
  entities: readonly CdsEntity[];
  asOf: DateInt;
  seed: number;
  startSecurityId: number;
  /** Contracts per entity. The 5-year dominates, so most names get one. */
  contractsPerEntity?: number;
}

/** Turn CDS entities into tradeable contracts on the book. */
export function buildCdsSecurities(options: CdsSecurityOptions): Security[] {
  const perEntity = Math.max(1, options.contractsPerEntity ?? 1);
  const out: Security[] = [];
  let securityId = options.startSecurityId;

  for (const entity of options.entities) {
    const rng = createRng(deriveSeed(options.seed, 'cdssec', entity.issuerId));
    const used = new Set<CdsTenor>();
    for (let i = 0; i < perEntity; i++) {
      const tenor = i === 0 ? '5Y' : pickTenor(rng());
      if (used.has(tenor)) continue;
      used.add(tenor);

      // Seasoning. A swap book is not all struck today: contracts traded
      // months ago carry an EARLIER IMM maturity and have rolled down their
      // curve, which is what puts a 5-year contract with four years left on
      // the blotter next to a freshly struck one.
      const monthsAgo = i === 0 ? Math.floor(rng() * 24) : Math.floor(rng() * 12);
      const tradeDate = addMonths(options.asOf, -monthsAgo);
      const maturity = standardMaturity(tradeDate, tenor);
      if (maturity <= options.asOf) continue;
      const years = tenorYears(tenor);
      // The fixed coupon IS the SNAC convention, not a priced spread: the
      // market difference is settled in points upfront.
      const couponRate = entity.standardCouponBp / 100;
      out.push({
        securityId: securityId++,
        // A swap has no CUSIP. The RED pair code is what identifies it, and
        // putting it in the CUSIP column is how a blotter actually shows it.
        cusip: entity.redPair9,
        isin: '',
        assetClass: 'CDS',
        securityType: 'CdsSingleName',
        description:
          `CDS ${entity.ticker} ${entity.tier} ${tenor} ${couponRate.toFixed(0)}% ${entity.docClause}`,
        issuerId: entity.issuerId,
        issuerName: entity.entityName,
        sectorIndex: entity.sectorIndex,
        currency: 'USD',
        issueDate: tradeDate,
        datedDate: protectionStart(tradeDate),
        maturityDate: maturity,
        originalTermYears: years,
        couponRate,
        couponType: 'Fixed',
        frequency: 4,
        // Quarterly ACT/360 on the 20th, the standard CDS accrual.
        dayCount: 'ACT/360',
        endOfMonth: false,
        amountOutstandingUsd: 0,
        quotationBasis: 'Decimal',
        ratingIndex: entity.isHighYield ? 8 : 4,
        seniority: entity.tier === 'SUBLT2' ? 'Subordinated' : 'SeniorUnsecured',
        liquidityTier: entity.isHighYield ? 'T2' : 'T1',
        callable: false,
        callSchedule: [],
        benchmarkTenor: years,
        issueSpreadBp: entity.standardCouponBp,
        onTheRunRank: null,
      });
    }
  }
  return out;
}
