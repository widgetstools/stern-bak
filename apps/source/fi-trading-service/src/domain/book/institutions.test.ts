import { describe, expect, it } from 'vitest';
import { SifmaCalendar } from '../core/sifmaCalendar.js';
import { buildBook, DEMO_SCALE, scaleBook } from './bookBuilder.js';
import {
  BENCHMARK_WEIGHTS, DEALER_DESKS, FUND_MANDATES, benchmarkWeight, dealerDeskFor,
  fundAssignment, mandatesFor, sectorAppetite, sleeveFor,
} from './institutions.js';

const book = buildBook({
  asOf: 20260907, calendar: new SifmaCalendar(), seed: 20260907, scale: scaleBook(DEMO_SCALE, 0.3),
});
const rows = book.positions;
const dealer = rows.filter((r) => r.bookType === 'Dealer');
const fund = rows.filter((r) => r.bookType === 'Fund');

describe('the two sides of the market', () => {
  it('builds a dealer book and a fund book from one universe', () => {
    expect(dealer.length).toBeGreaterThan(0);
    expect(fund.length).toBeGreaterThan(0);
    expect(dealer.length + fund.length).toBe(rows.length);
  });

  it('holds the SAME securities on both sides, which is what makes an RFQ possible', () => {
    const dealerIds = new Set(dealer.map((r) => r.securityId as number));
    const fundIds = new Set(fund.map((r) => r.securityId as number));
    const both = [...fundIds].filter((id) => dealerIds.has(id));
    expect(both.length).toBeGreaterThan(50);
  });

  it('gives every position a unique id across both books', () => {
    const ids = rows.map((r) => r.positionId as string);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('the dealer side', () => {
  it('specialises by product — no desk trades outside its own', () => {
    const byDesk = new Map<string, Set<string>>();
    for (const row of dealer) {
      const desk = row.desk as string;
      byDesk.set(desk, (byDesk.get(desk) ?? new Set()).add(row.assetClass as string));
    }
    // Rates covers governments and agencies; Securitized covers the four
    // structured classes. Everything else is a single asset class.
    expect(byDesk.get('IG Credit')).toEqual(new Set(['CorpIG']));
    expect(byDesk.get('Munis')).toEqual(new Set(['Muni']));
    expect(byDesk.get('HY Credit')).toEqual(new Set(['CorpHY']));
    expect(byDesk.get('Rates')?.size).toBeLessThanOrEqual(2);
    expect(byDesk.get('Securitized')?.size).toBeLessThanOrEqual(4);
  });

  it('can be short what it has sold', () => {
    const shorts = dealer.filter((r) => (r.currentFace as number) < 0);
    expect(shorts.length).toBeGreaterThan(0);
    // A short CASH bond is a liability, so its market value is negative. A
    // swap is not: it marks to its UPFRONT, which can be either sign whichever
    // way round the position is — bought protection on a name trading wider
    // than its fixed coupon is worth money.
    for (const row of shorts.filter((r) => r.assetClass !== 'CDS')) {
      expect(row.marketValue as number).toBeLessThan(0);
    }
    expect(shorts.some((r) => r.assetClass === 'CDS')).toBe(true);
  });

  it('carries a signed risk vector, so a short hedges rather than doubles', () => {
    // Summing raw remainingFace gave a short a POSITIVE risk vector while its
    // row was negative, and the fast path then revalued it as a long.
    for (const [index, row] of rows.entries()) {
      const vector = book.riskVectors[index] as (typeof book.riskVectors)[number];
      expect(Math.sign(vector.currentFace)).toBe(Math.sign(row.currentFace as number));
    }
  });

  it('axes every inventory line, on the side that gets it flatter', () => {
    for (const row of dealer) {
      expect(row.axeSide).not.toBeNull();
      // Long inventory is offered; a short is bid for.
      expect(row.axeSide).toBe((row.currentFace as number) > 0 ? 'Offer' : 'Bid');
      expect(row.axeSizeUsd as number).toBeGreaterThan(0);
    }
  });

  it('ages inventory, because capital is stuck in it', () => {
    for (const row of dealer) expect(row.inventoryAgeDays as number).toBeGreaterThanOrEqual(0);
    expect(dealer.some((r) => (r.inventoryAgeDays as number) > 100)).toBe(true);
  });

  it('runs no benchmark, and no weights — it is trying to be flat', () => {
    for (const row of dealer) {
      expect(row.benchmark).toBeNull();
      expect(row.portfolioWeightPct).toBeNull();
      expect(row.benchmarkWeightPct).toBeNull();
      expect(row.activeWeightPct).toBeNull();
    }
  });
});

describe('the fund side', () => {
  it('holds across sectors — one mandate, every sleeve', () => {
    const core = fund.filter((r) => r.portfolio === 'Core Plus Bond');
    const sleeves = new Set(core.map((r) => r.desk as string));
    expect(sleeves.size).toBeGreaterThanOrEqual(4);
  });

  it('keeps a tax-exempt mandate in munis, which is its whole reason to exist', () => {
    const tax = fund.filter((r) => r.portfolio === 'Tax-Exempt Income');
    expect(tax.length).toBeGreaterThan(0);
    for (const row of tax) expect(row.assetClass).toBe('Muni');
  });

  it('weights each mandate to 100%', () => {
    for (const mandate of FUND_MANDATES) {
      const held = fund.filter((r) => r.portfolio === mandate.portfolio);
      if (held.length === 0) continue;
      const total = held.reduce((sum, r) => sum + (r.portfolioWeightPct as number), 0);
      expect(total).toBeCloseTo(100, 1);
    }
  });

  it('sums benchmark weights over a sleeve to the index weight', () => {
    // The index is 42.5% government, not 42.5% per government bond. Subtracting
    // the whole sleeve weight on every row put Core Plus 7,541% underweight.
    const core = fund.filter((r) => r.portfolio === 'Core Plus Bond');
    const govt = core.filter((r) => r.desk === 'Government');
    const total = govt.reduce((sum, r) => sum + (r.benchmarkWeightPct as number), 0);
    expect(total).toBeCloseTo(BENCHMARK_WEIGHTS['Bloomberg US Aggregate']?.Government as number, 1);
  });

  it('makes active weight the difference, sleeve by sleeve', () => {
    for (const row of fund) {
      expect(row.activeWeightPct as number).toBeCloseTo(
        (row.portfolioWeightPct as number) - (row.benchmarkWeightPct as number), 3,
      );
    }
  });

  it('runs no axe and no inventory age — those are a dealer\'s concerns', () => {
    for (const row of fund) {
      expect(row.axeSide).toBeNull();
      expect(row.axeSizeUsd).toBeNull();
      expect(row.inventoryAgeDays).toBeNull();
      expect(row.benchmark).not.toBeNull();
    }
  });

  it('is long only', () => {
    for (const row of fund) expect(row.currentFace as number).toBeGreaterThan(0);
  });
});

describe('mandate eligibility and appetite', () => {
  it('lets only a muni fund hold munis, and core hold everything', () => {
    expect(mandatesFor('Muni').map((m) => m.portfolio)).toContain('Tax-Exempt Income');
    expect(mandatesFor('Rates').map((m) => m.portfolio)).toEqual(['Core Plus Bond']);
    expect(mandatesFor('CorpHY').map((m) => m.portfolio)).toContain('Credit Opportunities');
  });

  it('tracks appetite to the benchmark, so eligibility is not appetite', () => {
    const [core] = FUND_MANDATES as [(typeof FUND_MANDATES)[number]];
    // Core Plus MAY hold a muni; its index holds 0.4% of them, so it should
    // want far fewer than it wants governments.
    expect(sectorAppetite(core, 'Municipal')).toBeLessThan(sectorAppetite(core, 'Government'));
    expect(sectorAppetite(core, 'Government')).toBeGreaterThan(0.5);
    expect(sectorAppetite(core, 'Municipal')).toBeLessThan(0.15);
  });

  it('never returns an appetite outside zero to one', () => {
    for (const mandate of FUND_MANDATES) {
      for (const sleeve of ['Government', 'Investment Grade', 'High Yield', 'Municipal', 'Securitized', 'Derivatives']) {
        const appetite = sectorAppetite(mandate, sleeve);
        expect(appetite).toBeGreaterThan(0);
        expect(appetite).toBeLessThanOrEqual(0.9);
      }
    }
  });
});

describe('sleeves and desks', () => {
  it('maps every asset class to a sleeve and a desk', () => {
    for (const assetClass of ['Rates', 'Agency', 'CorpIG', 'CorpHY', 'Muni', 'CDS', 'CMBS', 'ABS', 'CLO', 'AgencyMBS'] as const) {
      expect(sleeveFor(assetClass).length).toBeGreaterThan(0);
    }
    for (const security of book.securities.slice(0, 200)) {
      expect(DEALER_DESKS).toContainEqual(dealerDeskFor(security));
    }
  });

  it('gives a fund assignment the sleeve as its desk', () => {
    const [core] = FUND_MANDATES as [(typeof FUND_MANDATES)[number]];
    expect(fundAssignment(core, 'CorpHY').desk).toBe('High Yield');
    expect(fundAssignment(core, 'CorpHY').bookType).toBe('Fund');
  });

  it('returns zero benchmark weight for a sleeve the index does not hold', () => {
    expect(benchmarkWeight('Bloomberg US Aggregate', 'High Yield')).toBe(0);
    expect(benchmarkWeight(null, 'Government')).toBe(0);
    expect(benchmarkWeight('Nonexistent Index', 'Government')).toBe(0);
  });
});
