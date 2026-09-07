/**
 * Municipal bonds, built as SERIAL DEALS.
 *
 * Munis do not come to market one bond at a time. A single deal issues twenty
 * to thirty consecutive annual maturities plus a term bond or two, all under
 * one obligor's six-character CUSIP prefix, with issue codes advancing
 * alphabetically by maturity. A muni blotter is therefore full of runs like
 *
 *     13063DAA1  13063DAB9  13063DAC7  13063DAD5 ...
 *
 * and generating munis independently loses that entirely — which is one of the
 * quickest ways for someone who trades them to spot synthetic data.
 *
 * The other convention that must be right is the 5% COUPON. Tax-exempt
 * maturities beyond about ten years are issued with a 5.000% coupon priced to
 * a ten-year par call, so the book trades at 108 to 125 rather than near par,
 * and quotes a yield-to-worst materially below its yield-to-maturity. A muni
 * generator that produces par bonds quoting only YTM is wrong twice over.
 */

import { addYears, formatIso, toDateInt, yearOf, type DateInt } from '../core/dateInt.js';
import { completeCusip, isinFromCusip, issueCode } from '../core/identifiers.js';
import { createRng, deriveSeed, pickWeighted, uniformInt, type Rng } from '../core/rng.js';
import type { RedemptionOption } from '../analytics/workout.js';
import type { LiquidityTier, Security } from './types.js';

export type MuniPurpose =
  | 'General Obligation'
  | 'Water & Sewer'
  | 'Electric'
  | 'Transportation'
  | 'Airport'
  | 'Higher Education'
  | 'Hospital'
  | 'Housing'
  | 'Special Tax'
  | 'Tobacco Settlement';

export type MuniSecurityType = 'GO-UT' | 'GO-LT' | 'Revenue' | 'Appropriation';
export type FederalTaxStatus = 'TaxExempt' | 'AMT' | 'Taxable';
export type MuniInsurer = 'AGM' | 'BAM' | 'AGC' | null;

/** Spread to the AAA scale by purpose, in basis points at ten years. */
const PURPOSE_SPREAD: Record<MuniPurpose, number> = {
  'General Obligation': 3,
  'Water & Sewer': -2,
  Electric: 12,
  Transportation: 8,
  Airport: 20,
  'Higher Education': 15,
  Hospital: 45,
  Housing: 25,
  'Special Tax': 10,
  'Tobacco Settlement': 160,
};

/** In-state demand moves the scale. California and New York trade rich. */
export const STATE_SPREAD_BP: Readonly<Record<string, number>> = {
  CA: -12, NY: -10, MA: -8, MN: -7, NJ: -5, PA: -3, OH: 0, WA: 5,
  TX: 6, FL: 6, GA: 4, NC: 3, VA: 2, MI: 8, IL: 45, PR: 400,
};

const STATES = Object.keys(STATE_SPREAD_BP);

const OBLIGORS: readonly (readonly [string, string, MuniPurpose, MuniSecurityType, number])[] = [
  ['State of California', 'CA', 'General Obligation', 'GO-UT', 2],
  ['State of New York', 'NY', 'General Obligation', 'GO-UT', 1],
  ['City of New York', 'NY', 'General Obligation', 'GO-UT', 2],
  ['State of Texas', 'TX', 'General Obligation', 'GO-UT', 0],
  ['State of Illinois', 'IL', 'General Obligation', 'GO-UT', 3],
  ['Commonwealth of Massachusetts', 'MA', 'General Obligation', 'GO-UT', 1],
  ['State of Washington', 'WA', 'General Obligation', 'GO-UT', 1],
  ['State of Georgia', 'GA', 'General Obligation', 'GO-UT', 0],
  ['Metropolitan Transportation Authority', 'NY', 'Transportation', 'Revenue', 3],
  ['Bay Area Toll Authority', 'CA', 'Transportation', 'Revenue', 2],
  ['New Jersey Turnpike Authority', 'NJ', 'Transportation', 'Revenue', 2],
  ['Port Authority of NY & NJ', 'NY', 'Transportation', 'Revenue', 2],
  ['Chicago O Hare International Airport', 'IL', 'Airport', 'Revenue', 3],
  ['Dallas Fort Worth International Airport', 'TX', 'Airport', 'Revenue', 2],
  ['Los Angeles Department of Water & Power', 'CA', 'Electric', 'Revenue', 1],
  ['Salt River Project', 'TX', 'Electric', 'Revenue', 1],
  ['New York City Municipal Water Finance Authority', 'NY', 'Water & Sewer', 'Revenue', 1],
  ['District of Columbia Water & Sewer Authority', 'VA', 'Water & Sewer', 'Revenue', 2],
  ['Massachusetts Water Resources Authority', 'MA', 'Water & Sewer', 'Revenue', 1],
  ['University of California Regents', 'CA', 'Higher Education', 'Revenue', 2],
  ['University of Texas System', 'TX', 'Higher Education', 'Revenue', 0],
  ['Michigan State University', 'MI', 'Higher Education', 'Revenue', 2],
  ['Cleveland Clinic Health System', 'OH', 'Hospital', 'Revenue', 2],
  ['Sutter Health', 'CA', 'Hospital', 'Revenue', 3],
  ['Ascension Health Alliance', 'MI', 'Hospital', 'Revenue', 2],
  ['California Housing Finance Agency', 'CA', 'Housing', 'Revenue', 2],
  ['New York State Housing Finance Agency', 'NY', 'Housing', 'Revenue', 2],
  ['Puerto Rico Sales Tax Financing Corp', 'PR', 'Special Tax', 'Revenue', 5],
  ['Tobacco Settlement Financing Corp', 'NJ', 'Tobacco Settlement', 'Revenue', 5],
  ['Chicago Board of Education', 'IL', 'General Obligation', 'GO-LT', 4],
];

export interface MuniDeal {
  dealId: string;
  obligorName: string;
  state: string;
  purpose: MuniPurpose;
  security: MuniSecurityType;
  cusipPrefix: string;
  parAmountUsd: number;
  datedDate: DateInt;
  /** First serial maturity year. */
  serialFrom: number;
  /** Last serial maturity year. */
  serialTo: number;
  /** Term bond maturity years, beyond the serials. */
  termYears: number[];
  /** Ten-year par call, or null for a short deal. */
  parCallDate: DateInt | null;
  federalTax: FederalTaxStatus;
  bankQualified: boolean;
  insurer: MuniInsurer;
  underlyingRatingIndex: number;
  competitiveOrNegotiated: 'Competitive' | 'Negotiated';
}

/** The muni market's coupon convention. */
export function muniCoupon(
  yearsToMaturity: number,
  scaleYieldPct: number,
  federalTax: FederalTaxStatus,
): number {
  if (federalTax === 'Taxable') {
    return Math.max(0.125, Math.round(scaleYieldPct * 8) / 8);
  }
  // Beyond ten years the market issues a 5% coupon priced to the par call.
  if (yearsToMaturity >= 11) return 5;
  if (yearsToMaturity >= 8) return 4;
  return Math.max(0.125, Math.round(scaleYieldPct * 8) / 8);
}

/** Spread to the AAA scale for a deal, in basis points. */
export function muniSpreadToScaleBp(
  deal: Pick<MuniDeal, 'purpose' | 'state' | 'federalTax' | 'bankQualified' | 'insurer'>,
  ratingIndex: number,
): number {
  const ratingSpread = [0, 6, 20, 60, 200, 380, 800, 2000][ratingIndex] ?? 60;
  let spread = ratingSpread + (PURPOSE_SPREAD[deal.purpose] ?? 0) + (STATE_SPREAD_BP[deal.state] ?? 0);
  if (deal.federalTax === 'AMT') spread += 28;
  if (deal.bankQualified) spread -= 3;
  if (deal.insurer !== null) {
    // Insurance caps the spread near a AA credit, but the underlying rating
    // is still carried separately - that is what an analyst actually looks at.
    spread = Math.min(spread, 20 + 15);
  }
  return Math.round(spread);
}

export interface MuniDealOptions {
  asOf: DateInt;
  seed: number;
  startSecurityId: number;
  /** AAA scale yield at a tenor, in percent. */
  scaleYield: (tenorYears: number) => number;
  /** Deals to build. */
  dealCount?: number;
}

function insurerFor(ratingIndex: number, rng: Rng): MuniInsurer {
  if (ratingIndex <= 1) return null;
  if (rng() > 0.22) return null;
  return pickWeighted(rng, ['AGM', 'BAM', 'AGC'] as const, [45, 35, 20]);
}

/** Build serial deals and the securities inside them. */
export function buildMuniDeals(options: MuniDealOptions): { deals: MuniDeal[]; securities: Security[] } {
  const dealCount = options.dealCount ?? 90;
  const deals: MuniDeal[] = [];
  const securities: Security[] = [];
  let securityId = options.startSecurityId;
  const usedPrefixes = new Set<string>();

  for (let d = 0; d < dealCount; d++) {
    const rng = createRng(deriveSeed(options.seed, 'muniDeal', d));
    const obligor = OBLIGORS[d % OBLIGORS.length] as (typeof OBLIGORS)[number];
    const [obligorName, state, purpose, security, ratingIndex] = obligor;

    const series = String.fromCharCode(65 + (Math.floor(d / OBLIGORS.length) % 26));
    const vintage = yearOf(options.asOf) - uniformInt(rng, 0, 6);
    const datedDate = toDateInt(vintage, uniformInt(rng, 1, 12), 1);
    const serialFrom = vintage + 1;
    const serialTo = vintage + uniformInt(rng, 15, 22);
    const termYears = [vintage + 30, vintage + 35].filter(() => rng() < 0.55);
    const federalTax: FederalTaxStatus =
      purpose === 'Airport' && rng() < 0.5 ? 'AMT' : rng() < 0.12 ? 'Taxable' : 'TaxExempt';
    const parAmountUsd = uniformInt(rng, 3, 320) * 5_000_000;

    let prefix = '';
    for (let attempt = 0; attempt < 512; attempt++) {
      const candidate = `${String(100000 + ((d * 7919 + attempt * 13) % 899999)).slice(0, 5)}D`;
      if (!usedPrefixes.has(candidate)) {
        usedPrefixes.add(candidate);
        prefix = candidate;
        break;
      }
    }

    const deal: MuniDeal = {
      dealId: `${obligorName} ${vintage} Series ${series}`,
      obligorName,
      state,
      purpose,
      security,
      cusipPrefix: prefix,
      parAmountUsd,
      datedDate,
      serialFrom,
      serialTo,
      termYears,
      parCallDate: serialTo - vintage >= 11 ? addYears(datedDate, 10) : null,
      federalTax,
      bankQualified: parAmountUsd <= 10_000_000 && rng() < 0.6,
      insurer: insurerFor(ratingIndex, rng),
      underlyingRatingIndex: ratingIndex,
      competitiveOrNegotiated: rng() < 0.45 ? 'Competitive' : 'Negotiated',
    };
    deals.push(deal);

    const maturityYears = [
      ...Array.from({ length: deal.serialTo - deal.serialFrom + 1 }, (_, i) => deal.serialFrom + i),
      ...deal.termYears,
    ];
    const spreadBp = muniSpreadToScaleBp(deal, ratingIndex);

    // Issue codes advance alphabetically by maturity, so a deal reads as a run.
    let codeIndex = 0;
    for (const maturityYear of maturityYears) {
      const maturityDate = toDateInt(maturityYear, 8, 1);
      if (maturityDate <= options.asOf) {
        codeIndex += 1;
        continue;
      }
      const tenor = maturityYear - vintage;
      const scale = options.scaleYield(Math.max(1, maturityYear - yearOf(options.asOf)));
      const couponRate = muniCoupon(tenor, scale + spreadBp / 100, deal.federalTax);
      const stem = `${prefix}${issueCode(codeIndex++)}`;
      const cusip = completeCusip(stem);
      if (cusip === null) continue;

      const isTerm = deal.termYears.includes(maturityYear);
      const callSchedule: RedemptionOption[] =
        deal.parCallDate !== null && deal.parCallDate < maturityDate
          ? [{ date: deal.parCallDate, price: 100, type: 'Call' }]
          : [];

      securities.push({
        securityId: securityId++,
        cusip,
        isin: isinFromCusip(cusip) ?? '',
        assetClass: 'Muni',
        securityType: 'MuniBond',
        description: `${obligorName.toUpperCase()} ${couponRate.toFixed(3)}% ${formatIso(maturityDate)}`,
        issuerId: -(d + 1),
        issuerName: obligorName,
        sectorIndex: 13,
        currency: 'USD',
        issueDate: datedDate,
        datedDate,
        maturityDate,
        originalTermYears: tenor,
        couponRate,
        couponType: 'Fixed',
        frequency: 2,
        dayCount: '30/360',
        endOfMonth: false,
        // Serial maturities are sized to level out debt service, and always
        // round to the 5,000 denomination munis actually trade in.
        amountOutstandingUsd: Math.max(5_000, Math.round((parAmountUsd / maturityYears.length) / 5_000) * 5_000),
        quotationBasis: 'Yield',
        ratingIndex: deal.insurer === null ? ratingIndex : Math.min(ratingIndex, 1),
        seniority: 'SeniorUnsecured',
        liquidityTier: liquidityForMuni(parAmountUsd, isTerm),
        callable: callSchedule.length > 0,
        callSchedule,
        benchmarkTenor: Math.max(1, maturityYear - yearOf(options.asOf)),
        issueSpreadBp: spreadBp,
        onTheRunRank: null,
      });
    }
  }
  return { deals, securities };
}

/**
 * Serial maturities are small and rarely trade; term bonds are the liquid
 * part of a deal. Most of a muni book sits in the bottom two tiers, which is
 * why so much of it is quoted off an evaluated price rather than a trade.
 */
function liquidityForMuni(parAmountUsd: number, isTerm: boolean): LiquidityTier {
  if (isTerm && parAmountUsd > 500_000_000) return 'T3';
  if (isTerm) return 'T4';
  return parAmountUsd > 500_000_000 ? 'T4' : 'T5';
}

/** Every security of one deal, in maturity order — the serial run. */
export function dealSecurities(securities: readonly Security[], prefix: string): Security[] {
  return securities
    .filter((security) => security.cusip.startsWith(prefix))
    .sort((a, b) => a.maturityDate - b.maturityDate);
}
