/**
 * Structured product deals: conduit CMBS, agency multifamily, and the
 * shared tranche machinery.
 *
 * The rule that governs everything here: **credit support is DERIVED, never
 * stamped on.** A tranche's attachment point is the cumulative balance of
 * everything junior to it, divided by the deal size. Generating a plausible
 * looking support percentage alongside a plausible looking balance produces a
 * capital stack whose numbers do not add up, which is the first thing anyone
 * who works in structured credit checks.
 *
 * The invariants are asserted for every deal:
 *   - class balances sum to the deal size EXACTLY
 *   - creditSupport(k) = 1 - cumulative(k) / dealSize
 *   - thicknesses sum to 1
 *   - the interest-only notional equals the sum of the classes it references
 *
 * The senior classes are a single credit block: A-1 through A-4 pay
 * sequentially but share one attachment point, so they all show the same
 * ~30% support. Only below A-S does support start stepping down.
 */

import { addYears, formatIso, toDateInt, yearOf, type DateInt } from '../core/dateInt.js';
import { completeCusip, isinFromCusip, issueCode } from '../core/identifiers.js';
import { createRng, deriveSeed, pickWeighted, uniformInt, type Rng } from '../core/rng.js';
import type { LiquidityTier, Security, Seniority } from './types.js';

export type TrancheKind = 'senior' | 'subordinate' | 'io' | 'retention';

export interface Tranche {
  trancheId: string;
  originalBalanceUsd: number;
  /** Cumulative fraction of the deal junior to this class. */
  attachmentPct: number;
  detachmentPct: number;
  /** Equal to `attachmentPct`. Named separately because desks say both. */
  creditSupportPct: number;
  kind: TrancheKind;
  ratingIndex: number;
  couponType: 'Fixed' | 'WAC' | 'Floating';
  /** Interest-only classes reference other classes rather than owning balance. */
  notionalOf?: readonly string[];
  walYears: number;
}

/** Thickness and kind of each class in a post-crisis conduit stack. */
const CONDUIT_STACK: readonly (readonly [string, number, TrancheKind, number])[] = [
  ['A-1', 0.03556, 'senior', 0],
  ['A-2', 0.09444, 'senior', 0],
  ['A-SB', 0.05333, 'senior', 0],
  ['A-3', 0.2, 'senior', 0],
  ['A-4', 0.31667, 'senior', 0],
  ['A-S', 0.075, 'subordinate', 1],
  ['B', 0.05, 'subordinate', 1],
  ['C', 0.03625, 'subordinate', 2],
  ['D', 0.03375, 'subordinate', 3],
  ['E', 0.0225, 'subordinate', 3],
  ['F', 0.02, 'subordinate', 4],
  ['G', 0.0175, 'subordinate', 5],
  ['HRR', 0.045, 'retention', 7],
];

const CONDUIT_WAL: Readonly<Record<string, number>> = {
  'A-1': 2.6, 'A-2': 4.8, 'A-SB': 7.2, 'A-3': 9.5, 'A-4': 9.8,
  'A-S': 9.9, B: 9.9, C: 9.9, D: 9.9, E: 9.9, F: 9.9, G: 9.9, HRR: 9.9,
};

/**
 * Build a conduit capital stack.
 *
 * Balances round to the thousand — deals are sized in round numbers — and the
 * rounding residual is absorbed by the retention class, so the total is exact
 * rather than off by a few hundred dollars.
 */
export function buildConduitStack(dealSizeUsd: number): Tranche[] {
  const seniorThickness = CONDUIT_STACK.filter(([, , kind]) => kind === 'senior').reduce(
    (sum, [, thickness]) => sum + thickness,
    0,
  );

  const tranches: Tranche[] = [];
  let cumulativeBalance = 0;
  for (let i = 0; i < CONDUIT_STACK.length; i++) {
    const [trancheId, thickness, kind, ratingIndex] = CONDUIT_STACK[i] as readonly [string, number, TrancheKind, number];
    const isLast = i === CONDUIT_STACK.length - 1;
    // Round DOWN, not to nearest: the residual is absorbed by the retention
    // class, and rounding to nearest can push it a hair under its floor.
    const balance = isLast
      ? dealSizeUsd - cumulativeBalance
      : Math.floor((dealSizeUsd * thickness) / 1000) * 1000;
    cumulativeBalance += balance;

    const attachment = kind === 'senior' ? 1 - seniorThickness : 1 - cumulativeBalance / dealSizeUsd;
    tranches.push({
      trancheId,
      originalBalanceUsd: balance,
      attachmentPct: attachment,
      detachmentPct: attachment + balance / dealSizeUsd,
      creditSupportPct: attachment,
      kind,
      ratingIndex,
      couponType: kind === 'senior' ? 'Fixed' : 'WAC',
      walYears: CONDUIT_WAL[trancheId] ?? 9.9,
    });
  }

  // Interest-only strips carry notional, not balance. X-A references the
  // senior block, X-B the mezzanine.
  const seniorIds = CONDUIT_STACK.filter(([, , kind]) => kind === 'senior').map(([id]) => id);
  const mezzIds = ['A-S', 'B', 'C'];
  tranches.push(ioTranche('X-A', tranches, seniorIds, dealSizeUsd, 0));
  tranches.push(ioTranche('X-B', tranches, mezzIds, dealSizeUsd, 1));
  return tranches;
}

function ioTranche(
  trancheId: string,
  tranches: readonly Tranche[],
  referenced: readonly string[],
  dealSizeUsd: number,
  ratingIndex: number,
): Tranche {
  const notional = tranches
    .filter((tranche) => referenced.includes(tranche.trancheId))
    .reduce((sum, tranche) => sum + tranche.originalBalanceUsd, 0);
  return {
    trancheId,
    originalBalanceUsd: notional,
    attachmentPct: 0,
    detachmentPct: 0,
    creditSupportPct: 0,
    kind: 'io',
    ratingIndex,
    couponType: 'WAC',
    notionalOf: referenced,
    walYears: 6.5,
  };
}

export interface StackProblem {
  check: string;
  detail: string;
}

/** Every capital-stack invariant, checked. Returns the failures. */
export function stackProblems(tranches: readonly Tranche[], dealSizeUsd: number): StackProblem[] {
  const problems: StackProblem[] = [];
  const funded = tranches.filter((tranche) => tranche.kind !== 'io');

  const total = funded.reduce((sum, tranche) => sum + tranche.originalBalanceUsd, 0);
  if (total !== dealSizeUsd) {
    problems.push({ check: 'balances sum to deal size', detail: `${total} vs ${dealSizeUsd}` });
  }

  const thickness = funded.reduce((sum, tranche) => sum + tranche.originalBalanceUsd / dealSizeUsd, 0);
  if (Math.abs(thickness - 1) > 1e-9) {
    problems.push({ check: 'thicknesses sum to one', detail: String(thickness) });
  }

  let cumulative = 0;
  for (const tranche of funded) {
    cumulative += tranche.originalBalanceUsd;
    if (tranche.kind === 'senior') continue;
    const expected = 1 - cumulative / dealSizeUsd;
    if (Math.abs(tranche.creditSupportPct - expected) > 1e-9) {
      problems.push({
        check: `credit support derived for ${tranche.trancheId}`,
        detail: `${tranche.creditSupportPct} vs ${expected}`,
      });
    }
  }

  for (const io of tranches.filter((tranche) => tranche.kind === 'io')) {
    const referenced = io.notionalOf ?? [];
    const expected = funded
      .filter((tranche) => referenced.includes(tranche.trancheId))
      .reduce((sum, tranche) => sum + tranche.originalBalanceUsd, 0);
    if (io.originalBalanceUsd !== expected) {
      problems.push({ check: `IO notional for ${io.trancheId}`, detail: `${io.originalBalanceUsd} vs ${expected}` });
    }
  }

  const retention = funded.find((tranche) => tranche.kind === 'retention');
  if (retention === undefined || retention.originalBalanceUsd / dealSizeUsd < 0.045) {
    problems.push({ check: 'risk retention piece present', detail: 'missing or under 4.5% of par' });
  }
  return problems;
}

export type PropertyType = 'Office' | 'Retail' | 'Multifamily' | 'Industrial' | 'Hotel' | 'Mixed' | 'SelfStorage';

export interface CmbsDeal {
  dealId: string;
  shelf: string;
  vintage: number;
  dealSizeUsd: number;
  loanCount: number;
  top10ConcentrationPct: number;
  propertyMix: Readonly<Record<PropertyType, number>>;
  weightedAverageDscr: number;
  weightedAverageLtv: number;
  weightedAverageDebtYield: number;
  weightedAverageCoupon: number;
  masterServicer: string;
  specialServicer: string;
  bPieceBuyer: string;
  delinquent30Pct: number;
  delinquent60PlusPct: number;
  watchlistPct: number;
  tranches: Tranche[];
}

const CONDUIT_SHELVES = ['BMARK', 'BANK', 'GSMS', 'JPMCC', 'WFCM', 'MSC', 'CGCMT'] as const;
const MASTER_SERVICERS = ['Midland Loan Services', 'Wells Fargo Commercial Mortgage', 'KeyBank Real Estate'] as const;
const SPECIAL_SERVICERS = ['Rialto Capital', 'LNR Partners', 'Argentic Services', 'Midland Loan Services'] as const;
const B_PIECE_BUYERS = ['KKR Real Estate', 'Rialto Capital', 'Eightfold Real Estate', 'Prime Finance'] as const;

/**
 * Office-heavy vintages carry visibly worse credit.
 *
 * The correlation between vintage, property mix, delinquency and the price of
 * the mezzanine is worth more realism than a hundred independently random
 * fields: a 2019 office-heavy deal SHOULD have a distressed BBB-.
 */
function distressFactor(vintage: number, officeShare: number, asOfYear: number): number {
  const seasoning = Math.max(0, Math.min(1, (asOfYear - vintage) / 6));
  return seasoning * Math.max(0, officeShare - 0.15) * 6;
}

export interface CmbsOptions {
  asOf: DateInt;
  seed: number;
  startSecurityId: number;
  dealCount?: number;
}

export function buildCmbsDeals(options: CmbsOptions): { deals: CmbsDeal[]; securities: Security[] } {
  const dealCount = options.dealCount ?? 24;
  const asOfYear = yearOf(options.asOf);
  const deals: CmbsDeal[] = [];
  const securities: Security[] = [];
  let securityId = options.startSecurityId;

  for (let d = 0; d < dealCount; d++) {
    const rng = createRng(deriveSeed(options.seed, 'cmbs', d));
    const shelf = CONDUIT_SHELVES[d % CONDUIT_SHELVES.length] as string;
    const vintage = asOfYear - uniformInt(rng, 0, 5);
    const dealSizeUsd = uniformInt(rng, 550, 1400) * 1_000_000;
    const officeShare = 0.12 + rng() * 0.28;

    // The non-office sectors share whatever office leaves, in fixed
    // proportion, so the mix sums to one at any office concentration.
    const propertyMix = buildPropertyMix(officeShare);
    const distress = distressFactor(vintage, officeShare, asOfYear);
    const tranches = buildConduitStack(dealSizeUsd);

    const deal: CmbsDeal = {
      dealId: `${shelf} ${vintage}-C${uniformInt(rng, 1, 9)}`,
      shelf,
      vintage,
      dealSizeUsd,
      loanCount: uniformInt(rng, 38, 82),
      top10ConcentrationPct: Number((45 + rng() * 17).toFixed(1)),
      propertyMix,
      weightedAverageDscr: Number((1.6 + rng() * 0.55).toFixed(2)),
      weightedAverageLtv: Number((52 + rng() * 10).toFixed(1)),
      weightedAverageDebtYield: Number((10.4 + rng() * 2.4).toFixed(2)),
      weightedAverageCoupon: Number((5.6 + rng() * 1.5).toFixed(3)),
      masterServicer: MASTER_SERVICERS[d % MASTER_SERVICERS.length] as string,
      specialServicer: SPECIAL_SERVICERS[d % SPECIAL_SERVICERS.length] as string,
      bPieceBuyer: B_PIECE_BUYERS[d % B_PIECE_BUYERS.length] as string,
      delinquent30Pct: Number((distress * 1.1).toFixed(2)),
      delinquent60PlusPct: Number((distress * 2.6).toFixed(2)),
      watchlistPct: Number((4 + distress * 7).toFixed(2)),
      tranches,
    };
    deals.push(deal);

    const prefix = `${String(10000 + d * 7).slice(0, 5)}A`;
    const usedStems = new Set<string>();
    let codeIndex = 0;
    for (const tranche of tranches) {
      const stem = `${prefix}${issueCode(codeIndex++)}`;
      if (usedStems.has(stem)) continue;
      usedStems.add(stem);
      const cusip = completeCusip(stem);
      if (cusip === null) continue;

      const maturityDate = toDateInt(vintage + 10, 6, 15);
      if (maturityDate <= options.asOf) continue;
      const rating = Math.min(7, tranche.ratingIndex + Math.round(distress * 2.2));

      securities.push({
        securityId: securityId++,
        cusip,
        isin: isinFromCusip(cusip) ?? '',
        assetClass: 'CMBS',
        securityType: 'CmbsTranche',
        description: `${deal.dealId} ${tranche.trancheId}`,
        issuerId: -(1000 + d),
        issuerName: deal.dealId,
        sectorIndex: 10,
        currency: 'USD',
        issueDate: toDateInt(vintage, 6, 15),
        datedDate: toDateInt(vintage, 6, 15),
        maturityDate,
        originalTermYears: 10,
        couponRate: Number((deal.weightedAverageCoupon - 0.35 + tranche.ratingIndex * 0.42).toFixed(3)),
        couponType: 'Fixed',
        frequency: 12,
        dayCount: '30/360',
        endOfMonth: false,
        amountOutstandingUsd: tranche.originalBalanceUsd,
        quotationBasis: tranche.kind === 'senior' ? 'Spread' : 'Decimal',
        ratingIndex: rating,
        seniority: seniorityFor(tranche),
        liquidityTier: liquidityFor(tranche),
        callable: false,
        callSchedule: [],
        benchmarkTenor: tranche.walYears,
        issueSpreadBp: spreadFor(tranche, distress),
        onTheRunRank: null,
      });
    }
  }
  return { deals, securities };
}

/** Relative weights of the non-office property types. */
const NON_OFFICE_WEIGHTS: readonly (readonly [PropertyType, number])[] = [
  ['Retail', 0.24], ['Multifamily', 0.18], ['Industrial', 0.14],
  ['Hotel', 0.11], ['Mixed', 0.06], ['SelfStorage', 0.05],
];

export function buildPropertyMix(officeShare: number): Record<PropertyType, number> {
  const remainder = 1 - officeShare;
  const weightTotal = NON_OFFICE_WEIGHTS.reduce((sum, [, weight]) => sum + weight, 0);
  const mix = { Office: officeShare } as Record<PropertyType, number>;
  for (const [type, weight] of NON_OFFICE_WEIGHTS) {
    mix[type] = (weight / weightTotal) * remainder;
  }
  return mix;
}

function seniorityFor(tranche: Tranche): Seniority {
  if (tranche.kind === 'senior') return 'Senior';
  if (tranche.kind === 'retention') return 'Equity';
  return tranche.ratingIndex <= 3 ? 'Mezzanine' : 'Junior';
}

function liquidityFor(tranche: Tranche): LiquidityTier {
  if (tranche.kind === 'senior') return 'T3';
  if (tranche.kind === 'io') return 'T4';
  return tranche.ratingIndex <= 3 ? 'T4' : 'T5';
}

/**
 * Spread over the curve, widening steeply down the stack and steeply with
 * distress. An office-heavy seasoned deal's BBB- prints 850 to 1100 over.
 */
function spreadFor(tranche: Tranche, distress: number): number {
  const base = [88, 135, 210, 340, 620, 980, 1500, 2500][tranche.ratingIndex] ?? 300;
  return Math.round(base * (1 + distress * 1.6));
}

/**
 * CMBS DOES NOT PREPAY.
 *
 * Conduit loans are locked out and then defeased or subject to yield
 * maintenance, so the cashflows are effectively fixed and the bonds are
 * POSITIVELY convex — the opposite of an agency pass-through. That contrast is
 * visible in a single convexity column and is completely absent from a
 * generator that treats all securitised product the same way.
 */
export const CMBS_CPY = 0;

/** Every tranche of one deal, senior first. */
export function dealTranches(securities: readonly Security[], dealId: string): Security[] {
  return securities.filter((security) => security.issuerName === dealId);
}
