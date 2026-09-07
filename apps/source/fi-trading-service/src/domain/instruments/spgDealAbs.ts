/**
 * Asset-backed deals: auto, credit card, student loan and esoteric.
 *
 * Each sub-sector has a structure that behaves differently, and flattening
 * them into "an ABS tranche" throws away exactly what makes the book
 * interesting:
 *
 *  - **Autos** quote in ABS (absolute prepayment speed), not CPR, and carry a
 *    money-market A-1 class rated A-1+/P-1 alongside the term classes.
 *  - **Credit cards** are master-trust SOFT BULLETS with a controlled
 *    accumulation period, so their average life is exactly 2.98 or 4.96 — a
 *    hard bullet sitting in a book of amortisers.
 *  - **FFELP student loans** are 97% government guaranteed, so they carry
 *    almost no credit risk but real EXTENSION risk: the bond can fail to pay
 *    by its legal final and be downgraded with zero losses.
 *  - **Esoterics** use an anticipated repayment date with a step-up coupon if
 *    the issuer does not refinance, and a legal final decades later.
 */

import { addYears, formatIso, toDateInt, yearOf, type DateInt } from '../core/dateInt.js';
import { completeCusip, isinFromCusip, issueCode } from '../core/identifiers.js';
import { createRng, deriveSeed, pickWeighted, uniformInt } from '../core/rng.js';
import type { Security } from './types.js';

export type AbsSector = 'AutoPrime' | 'AutoSubprime' | 'CreditCard' | 'StudentFFELP' | 'Equipment' | 'Esoteric';

export interface AbsClass {
  trancheId: string;
  share: number;
  ratingIndex: number;
  walYears: number;
  spreadBp: number;
}

/** Class structures by sector, as shares of deal size. */
const STRUCTURES: Readonly<Record<AbsSector, readonly AbsClass[]>> = {
  AutoPrime: [
    { trancheId: 'A-1', share: 0.16, ratingIndex: 0, walYears: 0.35, spreadBp: 12 },
    { trancheId: 'A-2', share: 0.3, ratingIndex: 0, walYears: 1.5, spreadBp: 32 },
    { trancheId: 'A-3', share: 0.32, ratingIndex: 0, walYears: 2.7, spreadBp: 42 },
    { trancheId: 'A-4', share: 0.14, ratingIndex: 0, walYears: 4.1, spreadBp: 55 },
    { trancheId: 'B', share: 0.035, ratingIndex: 2, walYears: 4.4, spreadBp: 95 },
    { trancheId: 'C', share: 0.03, ratingIndex: 3, walYears: 4.5, spreadBp: 145 },
    { trancheId: 'D', share: 0.015, ratingIndex: 4, walYears: 4.6, spreadBp: 285 },
  ],
  AutoSubprime: [
    { trancheId: 'A-1', share: 0.12, ratingIndex: 0, walYears: 0.3, spreadBp: 18 },
    { trancheId: 'A-2', share: 0.28, ratingIndex: 0, walYears: 1.1, spreadBp: 55 },
    { trancheId: 'A-3', share: 0.2, ratingIndex: 0, walYears: 2.2, spreadBp: 78 },
    { trancheId: 'B', share: 0.14, ratingIndex: 1, walYears: 3.1, spreadBp: 120 },
    { trancheId: 'C', share: 0.13, ratingIndex: 2, walYears: 3.6, spreadBp: 175 },
    { trancheId: 'D', share: 0.08, ratingIndex: 3, walYears: 4, spreadBp: 305 },
    { trancheId: 'E', share: 0.05, ratingIndex: 4, walYears: 4.2, spreadBp: 620 },
  ],
  CreditCard: [
    { trancheId: 'A', share: 0.88, ratingIndex: 0, walYears: 2.98, spreadBp: 38 },
    { trancheId: 'B', share: 0.07, ratingIndex: 2, walYears: 2.98, spreadBp: 88 },
    { trancheId: 'C', share: 0.05, ratingIndex: 3, walYears: 2.98, spreadBp: 165 },
  ],
  StudentFFELP: [
    { trancheId: 'A-1', share: 0.72, ratingIndex: 0, walYears: 4.5, spreadBp: 95 },
    { trancheId: 'A-2', share: 0.22, ratingIndex: 0, walYears: 11.5, spreadBp: 135 },
    { trancheId: 'B', share: 0.06, ratingIndex: 3, walYears: 13, spreadBp: 260 },
  ],
  Equipment: [
    { trancheId: 'A-1', share: 0.14, ratingIndex: 0, walYears: 0.35, spreadBp: 14 },
    { trancheId: 'A-2', share: 0.42, ratingIndex: 0, walYears: 1.6, spreadBp: 40 },
    { trancheId: 'A-3', share: 0.32, ratingIndex: 0, walYears: 3.1, spreadBp: 58 },
    { trancheId: 'B', share: 0.07, ratingIndex: 2, walYears: 3.9, spreadBp: 110 },
    { trancheId: 'C', share: 0.05, ratingIndex: 3, walYears: 4.1, spreadBp: 190 },
  ],
  Esoteric: [
    { trancheId: 'A-2', share: 0.7, ratingIndex: 2, walYears: 5.5, spreadBp: 175 },
    { trancheId: 'B', share: 0.2, ratingIndex: 3, walYears: 6.5, spreadBp: 320 },
    { trancheId: 'C', share: 0.1, ratingIndex: 4, walYears: 7, spreadBp: 550 },
  ],
};

const SHELVES: Readonly<Record<AbsSector, readonly string[]>> = {
  AutoPrime: ['TAOT', 'GMCAR', 'FORDO', 'HAROT', 'NAROT'],
  AutoSubprime: ['SDART', 'AMCAR', 'CPS', 'WOART'],
  CreditCard: ['BACCT', 'CHAIT', 'AMXCA', 'DCENT'],
  StudentFFELP: ['NAVSL', 'SLMA', 'NELNET'],
  Equipment: ['DLLAA', 'JDOT', 'CNH'],
  Esoteric: ['DNKN', 'TRTN', 'AASET', 'VNTR', 'SUNR'],
};

export interface AbsDeal {
  dealId: string;
  sector: AbsSector;
  vintage: number;
  dealSizeUsd: number;
  /** Autos quote in ABS speed, cards in monthly payment rate. */
  absSpeedPct: number | null;
  monthlyPaymentRatePct: number | null;
  excessSpreadPct: number;
  overcollateralisationPct: number;
  reserveAccountPct: number;
  cumulativeNetLossPct: number;
  /** Esoterics only: the date the coupon steps up if not refinanced. */
  anticipatedRepaymentDate: DateInt | null;
  stepUpCouponBp: number;
  classes: readonly AbsClass[];
}

export interface AbsOptions {
  asOf: DateInt;
  seed: number;
  startSecurityId: number;
  dealsPerSector?: number;
}

export function buildAbsDeals(options: AbsOptions): { deals: AbsDeal[]; securities: Security[] } {
  const perSector = options.dealsPerSector ?? 4;
  const asOfYear = yearOf(options.asOf);
  const deals: AbsDeal[] = [];
  const securities: Security[] = [];
  let securityId = options.startSecurityId;
  let dealIndex = 0;

  for (const sector of Object.keys(STRUCTURES) as AbsSector[]) {
    for (let i = 0; i < perSector; i++) {
      const rng = createRng(deriveSeed(options.seed, 'abs', sector, i));
      const shelves = SHELVES[sector];
      const shelf = shelves[i % shelves.length] as string;
      const vintage = asOfYear - uniformInt(rng, 0, 3);
      const dealSizeUsd = uniformInt(rng, 4, 32) * 50_000_000;
      const isSubprime = sector === 'AutoSubprime';
      const isEsoteric = sector === 'Esoteric';

      const deal: AbsDeal = {
        dealId: `${shelf} ${vintage}-${uniformInt(rng, 1, 4)}`,
        sector,
        vintage,
        dealSizeUsd,
        absSpeedPct: sector.startsWith('Auto') ? Number((isSubprime ? 1.0 + rng() * 0.5 : 1.3 + rng() * 0.3).toFixed(2)) : null,
        monthlyPaymentRatePct: sector === 'CreditCard' ? Number((25 + rng() * 10).toFixed(1)) : null,
        excessSpreadPct: Number((isSubprime ? 9 + rng() * 4 : sector === 'CreditCard' ? 9 + rng() * 3 : 2 + rng() * 2).toFixed(2)),
        overcollateralisationPct: Number((isSubprime ? 8 + rng() * 4 : 1 + rng() * 2).toFixed(2)),
        reserveAccountPct: Number((0.25 + rng() * 1.75).toFixed(2)),
        cumulativeNetLossPct: Number((isSubprime ? 6 + rng() * 8 : 0.3 + rng() * 0.9).toFixed(2)),
        anticipatedRepaymentDate: isEsoteric ? addYears(toDateInt(vintage, 5, 20), 7) : null,
        stepUpCouponBp: isEsoteric ? 500 : 0,
        classes: STRUCTURES[sector],
      };
      deals.push(deal);

      const prefix = `${String(20000 + dealIndex * 11).slice(0, 5)}B`;
      dealIndex += 1;
      let codeIndex = 0;
      for (const cls of deal.classes) {
        const cusip = completeCusip(`${prefix}${issueCode(codeIndex++)}`);
        if (cusip === null) continue;
        const legalFinal = toDateInt(vintage + (isEsoteric ? 30 : sector === 'StudentFFELP' ? 25 : 6), 5, 20);
        if (legalFinal <= options.asOf) continue;

        securities.push({
          securityId: securityId++,
          cusip,
          isin: isinFromCusip(cusip) ?? '',
          assetClass: 'ABS',
          securityType: 'AbsTranche',
          description: `${deal.dealId} ${cls.trancheId}`,
          issuerId: -(5000 + dealIndex),
          issuerName: deal.dealId,
          sectorIndex: 4,
          currency: 'USD',
          issueDate: toDateInt(vintage, 5, 20),
          datedDate: toDateInt(vintage, 5, 20),
          maturityDate: legalFinal,
          originalTermYears: yearOf(legalFinal) - vintage,
          couponRate: Number((4.6 + cls.spreadBp / 100).toFixed(3)),
          couponType: sector === 'StudentFFELP' ? 'Floating' : 'Fixed',
          frequency: 12,
          dayCount: sector === 'StudentFFELP' ? 'ACT/360' : '30/360',
          endOfMonth: false,
          amountOutstandingUsd: Math.round(cls.share * dealSizeUsd),
          quotationBasis: sector === 'StudentFFELP' ? 'DiscountMargin' : 'Spread',
          ratingIndex: cls.ratingIndex,
          seniority: cls.ratingIndex === 0 ? 'Senior' : cls.ratingIndex <= 3 ? 'Mezzanine' : 'Junior',
          liquidityTier: cls.ratingIndex === 0 ? 'T3' : cls.ratingIndex <= 3 ? 'T4' : 'T5',
          callable: false,
          callSchedule: [],
          benchmarkTenor: cls.walYears,
          issueSpreadBp: cls.spreadBp,
          onTheRunRank: null,
        });
      }
    }
  }
  return { deals, securities };
}

/** Single monthly mortality implied by an ABS (absolute prepayment) speed. */
export function absToSmm(absPct: number, monthsSeasoned: number): number {
  const abs = absPct / 100;
  const denominator = 1 - abs * (monthsSeasoned - 1);
  return denominator <= 0 ? 1 : abs / denominator;
}

/** Class structures for a sector, for callers that want the shape only. */
export function structureFor(sector: AbsSector): readonly AbsClass[] {
  return STRUCTURES[sector];
}
