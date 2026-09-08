import { describe, expect, it } from 'vitest';
import { SifmaCalendar } from '../domain/core/sifmaCalendar.js';
import { nssDiscountCurve } from '../domain/curves/discount.js';
import { buildBook, DEMO_SCALE, scaleBook } from '../domain/book/bookBuilder.js';
import { buildHedgeUniverse, executionCost, type HedgeCandidate } from './hedgeUniverse.js';

const calendar = new SifmaCalendar();
const book = buildBook({
  asOf: 20260907, calendar, seed: 20260907, scale: scaleBook(DEMO_SCALE, 0.3),
});
const universe = buildHedgeUniverse({
  securities: book.securities,
  spreadBpFor: book.spreadFor,
  valuation: {
    asOf: 20260907, calendar, curve: nssDiscountCurve(book.state.betas), mortgage: book.state.mortgage,
  },
});

describe('buildHedgeUniverse', () => {
  it('offers Treasuries, single-name CDS and credit indices', () => {
    const kinds = new Set(universe.map((candidate) => candidate.instrumentKind));
    expect(kinds).toContain('Treasury');
    expect(kinds).toContain('CDS');
    expect(kinds).toContain('CDX');
  });

  it('comes from the security master, not from what the book happens to hold', () => {
    // Asserting that one PARTICULAR instrument is unheld makes the test an RNG
    // accident. The property is that the universe is drawn from the master, so
    // it must contain candidates the book does not own.
    const held = new Set(book.positions.map((row) => row.securityId as number));
    const unheld = universe.filter((candidate) => !held.has(candidate.securityId));
    expect(unheld.length).toBeGreaterThan(0);
    // And the indices, the most useful credit hedge there is, are offered
    // whether or not the book happens to own one.
    expect(universe.some((candidate) => candidate.instrumentKind === 'CDX')).toBe(true);
  });

  it('excludes anything a desk could not trade in size', () => {
    for (const candidate of universe) {
      expect(['Rates', 'CDS']).toContain(candidate.assetClass);
    }
    // Off-the-run issues and bills are not hedge instruments.
    const master = new Map(book.securities.map((s) => [s.securityId, s]));
    for (const candidate of universe) {
      const security = master.get(candidate.securityId);
      if (security?.assetClass !== 'Rates') continue;
      expect(security.securityType).not.toBe('TBill');
      expect(security.onTheRunRank).toBeLessThanOrEqual(1);
    }
  });

  it('makes a long-duration Treasury more level-sensitive than a short one', () => {
    const treasuries = universe
      .filter((candidate) => candidate.instrumentKind === 'Treasury')
      .sort((a, b) => a.benchmarkTenor - b.benchmarkTenor);
    const shortest = treasuries[0] as HedgeCandidate;
    const longest = treasuries[treasuries.length - 1] as HedgeCandidate;
    expect(Math.abs(longest.gradient[0])).toBeGreaterThan(Math.abs(shortest.gradient[0]));
  });

  it('gives credit sensitivity to swaps and none to Treasuries', () => {
    for (const candidate of universe) {
      if (candidate.instrumentKind === 'Treasury') expect(candidate.gradient[4]).toBe(-0);
      else expect(Math.abs(candidate.gradient[4])).toBeGreaterThan(0);
    }
  });

  it('makes a long book lose on a rate rise — every gradient is signed one way', () => {
    for (const candidate of universe) {
      if (candidate.instrumentKind !== 'Treasury') continue;
      expect(candidate.gradient[0]).toBeLessThan(0);
    }
  });

  it('quotes a wider market on a single name than on an index', () => {
    const index = universe.find((c) => c.instrumentKind === 'CDX') as HedgeCandidate;
    const single = universe.find((c) => c.instrumentKind === 'CDS') as HedgeCandidate;
    expect(index.liquidityTier).toBe('T1');
    expect(single.halfSpreadPoints).toBeGreaterThanOrEqual(index.halfSpreadPoints);
  });

  it('is sorted by tenor, so a package reads like a curve', () => {
    for (let i = 1; i < universe.length; i++) {
      expect(universe[i]?.benchmarkTenor).toBeGreaterThanOrEqual(
        universe[i - 1]?.benchmarkTenor as number,
      );
    }
  });

  it('prices carry off the coupon', () => {
    for (const candidate of universe) {
      expect(candidate.carryPerMm).toBeGreaterThanOrEqual(0);
      expect(candidate.price).toBeGreaterThan(0);
    }
  });
});

describe('executionCost', () => {
  it('is the half-spread on the notional, and never negative', () => {
    const candidate = universe[0] as HedgeCandidate;
    expect(executionCost(candidate, 100)).toBeCloseTo(
      (100 * 1e6 * candidate.halfSpreadPoints) / 100, 6,
    );
    expect(executionCost(candidate, -100)).toBe(executionCost(candidate, 100));
    expect(executionCost(candidate, 0)).toBe(0);
  });
});
