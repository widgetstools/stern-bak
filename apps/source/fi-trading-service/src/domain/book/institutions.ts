/**
 * Who owns the position — a dealer warehousing inventory, or a fund holding it.
 *
 * The two are not the same business and the data says so. A dealer's book turns
 * over in days, can be short whatever it has sold, and is judged on spread
 * capture and how much balance sheet it consumes; aged inventory is a problem
 * because capital is stuck in it. A fund's book is held for months against a
 * benchmark, is judged on total return relative to that benchmark, and cares
 * about sector weights and mandate constraints, not about how long a bond has
 * been on the sheet.
 *
 * Modelling both, facing each other, is what makes trade capture mean
 * something: a fund enquires, a dealer prices it off its own axe and inventory,
 * and the fill moves both books. Trades that appear from nowhere teach nothing.
 *
 * It is also why "who has a blotter with every product in it" has two answers.
 * A dealer floor has none — traders specialise, and a rates trader never sees a
 * muni. A multi-sector fund PM has exactly one, because allocating across
 * sectors IS the job.
 */

import type { AssetClass, Security } from '../instruments/types.js';

export type BookType = 'Dealer' | 'Fund';

export interface DeskAssignment {
  bookType: BookType;
  /** Dealer: the trading desk. Fund: the sector sleeve within the mandate. */
  desk: string;
  book: string;
  /** Dealer: the trader. Fund: the portfolio manager. */
  trader: string;
  /** Dealer: the inventory book's own name. Fund: the mandate. */
  portfolio: string;
  strategy: string;
  accountId: string;
  /** Fund only. A dealer runs no benchmark — it is trying to be flat. */
  benchmark: string | null;
}

/**
 * Dealer desks. One product each, which is how a floor is actually organised.
 *
 * Rates covers governments AND agencies — one desk, because they trade off the
 * same curve. Securitized covers CMBS, pass-throughs, ABS and CLOs together,
 * which is likewise one desk rather than four.
 */
export const DEALER_DESKS: readonly DeskAssignment[] = [
  { bookType: 'Dealer', desk: 'Rates', book: 'GOVT-01', trader: 'T. Wong', portfolio: 'Govt Trading', strategy: 'Market Making', accountId: 'DLR-001', benchmark: null },
  { bookType: 'Dealer', desk: 'IG Credit', book: 'CRED-01', trader: 'A. Perez', portfolio: 'IG Trading', strategy: 'Market Making', accountId: 'DLR-002', benchmark: null },
  { bookType: 'Dealer', desk: 'HY Credit', book: 'CRED-02', trader: 'C. Lindqvist', portfolio: 'HY Trading', strategy: 'Market Making', accountId: 'DLR-003', benchmark: null },
  { bookType: 'Dealer', desk: 'Munis', book: 'MUNI-01', trader: 'D. Sharma', portfolio: 'Muni Trading', strategy: 'Market Making', accountId: 'DLR-004', benchmark: null },
  { bookType: 'Dealer', desk: 'Securitized', book: 'SPG-01', trader: 'E. Rossi', portfolio: 'SPG Trading', strategy: 'Market Making', accountId: 'DLR-005', benchmark: null },
  { bookType: 'Dealer', desk: 'Credit Derivatives', book: 'CRED-03', trader: 'M. Okafor', portfolio: 'Flow CDS', strategy: 'Market Making', accountId: 'DLR-006', benchmark: null },
];

/**
 * Fund mandates. Each holds ACROSS products, which is the whole point.
 *
 * `desk` carries the sector sleeve so a PM can still group by product, but the
 * mandate is the book: one PM, one benchmark, every sector.
 */
export const FUND_MANDATES: readonly Omit<DeskAssignment, 'desk'>[] = [
  { bookType: 'Fund', book: 'FUND-CORE', trader: 'R. Adeyemi', portfolio: 'Core Plus Bond', strategy: 'Total Return', accountId: 'ACCT-1001', benchmark: 'Bloomberg US Aggregate' },
  { bookType: 'Fund', book: 'FUND-TAX', trader: 'J. Bergström', portfolio: 'Tax-Exempt Income', strategy: 'Income', accountId: 'ACCT-1002', benchmark: 'Bloomberg Municipal' },
  { bookType: 'Fund', book: 'FUND-CRD', trader: 'S. Nakamura', portfolio: 'Credit Opportunities', strategy: 'Total Return', accountId: 'ACCT-1003', benchmark: 'Bloomberg US Corporate' },
];

/** The sector sleeve a fund PM groups a holding under. */
export function sleeveFor(assetClass: AssetClass): string {
  switch (assetClass) {
    case 'Rates': case 'Agency': return 'Government';
    case 'CorpIG': return 'Investment Grade';
    case 'CorpHY': return 'High Yield';
    case 'Muni': return 'Municipal';
    case 'CDS': return 'Derivatives';
    default: return 'Securitized';
  }
}

/** The dealer desk that warehouses a given product. */
export function dealerDeskFor(security: Security): DeskAssignment {
  switch (security.assetClass) {
    case 'Rates': case 'Agency': return DEALER_DESKS[0] as DeskAssignment;
    case 'CorpIG': return DEALER_DESKS[1] as DeskAssignment;
    case 'CorpHY': return DEALER_DESKS[2] as DeskAssignment;
    case 'Muni': return DEALER_DESKS[3] as DeskAssignment;
    case 'CDS': return DEALER_DESKS[5] as DeskAssignment;
    default: return DEALER_DESKS[4] as DeskAssignment;
  }
}

/**
 * Which mandate would hold a given product.
 *
 * A tax-exempt fund holds munis and nothing else — that is its entire reason to
 * exist, and a taxable bond in it would be a mandate breach rather than a
 * choice. Core Plus holds everything. Credit Opportunities holds corporates and
 * structured credit but not governments except as a hedge.
 */
export function mandatesFor(assetClass: AssetClass): Omit<DeskAssignment, 'desk'>[] {
  const [core, tax, credit] = FUND_MANDATES as [
    Omit<DeskAssignment, 'desk'>, Omit<DeskAssignment, 'desk'>, Omit<DeskAssignment, 'desk'>,
  ];
  if (assetClass === 'Muni') return [tax, core];
  if (assetClass === 'Rates' || assetClass === 'Agency') return [core];
  return [core, credit];
}

/**
 * How much of a sleeve a mandate actually wants, as a share of what is offered.
 *
 * Eligibility is not appetite. A Core Plus fund MAY hold a muni and
 * occasionally does, but its benchmark holds 0.4% of them, so a fund holding a
 * fifth of its book in munis is not "core plus" — it is a different fund. This
 * keeps each mandate's shape near its own index instead of uniform across
 * everything it is permitted to touch.
 */
export function sectorAppetite(mandate: Omit<DeskAssignment, 'desk'>, sleeve: string): number {
  const index = BENCHMARK_WEIGHTS[mandate.benchmark ?? ''] ?? {};
  const target = index[sleeve] ?? 0;
  // A tilt away from the index is the manager's job, so appetite tracks the
  // benchmark with a floor: a sleeve the index ignores can still be held as an
  // active bet, just sparingly.
  return Math.min(0.9, 0.06 + (target / 100) * 1.6);
}

export function fundAssignment(
  mandate: Omit<DeskAssignment, 'desk'>, assetClass: AssetClass,
): DeskAssignment {
  return { ...mandate, desk: sleeveFor(assetClass) };
}

/**
 * Benchmark sector weights, as a percentage of the index.
 *
 * Roughly the Bloomberg US Aggregate's own composition — Treasuries around 40%,
 * securitized around a quarter, corporates around a quarter. A fund's ACTIVE
 * weight is measured against this, and active weight is the number a PM is
 * actually judged on: holding 8% high yield against an index that holds none is
 * the position, not the 8%.
 */
export const BENCHMARK_WEIGHTS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  'Bloomberg US Aggregate': {
    Government: 42.5, 'Investment Grade': 24.0, Securitized: 27.5,
    Municipal: 0.4, 'High Yield': 0, Derivatives: 0,
  },
  'Bloomberg Municipal': {
    Municipal: 98.0, Government: 1.5, 'Investment Grade': 0.5,
    Securitized: 0, 'High Yield': 0, Derivatives: 0,
  },
  'Bloomberg US Corporate': {
    'Investment Grade': 88.0, 'High Yield': 6.0, Government: 3.0,
    Securitized: 2.0, Municipal: 0, Derivatives: 1.0,
  },
};

/** The index weight of a sleeve, or zero when the index does not hold it. */
export function benchmarkWeight(benchmark: string | null, sleeve: string): number {
  if (benchmark === null) return 0;
  return BENCHMARK_WEIGHTS[benchmark]?.[sleeve] ?? 0;
}
