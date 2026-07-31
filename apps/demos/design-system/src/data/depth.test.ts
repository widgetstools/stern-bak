import { describe, it, expect } from 'vitest';
import { buildDepth } from './depth';
import { makeRng, DEALERS } from './seeds';
import type { Instrument, Quote } from './types';

const mockInstrument: Instrument = {
  id: 'i01',
  cusip: '912828Z78',
  ticker: 'T 2.5 02/45',
  description: 'US Treasury 2.5% 2045',
  coupon: 2.5,
  maturity: '2045-02-15',
  rating: 'AAA',
  sector: 'Government',
  currency: 'USD',
  ratingClass: 'aaa',
  ytw: 2.52,
  gSpd: 5,
  cvx: 19.8,
  seniority: 'Senior',
  axes: 'GS MS JPM',
};

const mockQuote: Quote = {
  id: 'i01',
  bid: 99.875,
  mid: 100.0,
  ask: 100.125,
  last: 100.0,
  ytm: 2.52,
  oas: 5,
  dv01: 8.5,
  changePct: 0.02,
  dir: 'flat',
};

describe('buildDepth', () => {
  it('returns asks and bids arrays each with 12 levels', () => {
    const rng = makeRng(42);
    const result = buildDepth(mockQuote, mockInstrument, rng);
    expect(result.asks).toHaveLength(12);
    expect(result.bids).toHaveLength(12);
  });

  it('asks are in strictly descending price order (highest first, closest to mid last)', () => {
    const rng = makeRng(42);
    const result = buildDepth(mockQuote, mockInstrument, rng);
    for (let i = 0; i < result.asks.length - 1; i++) {
      expect(result.asks[i].price).toBeGreaterThan(result.asks[i + 1].price);
    }
  });

  it('bids are in strictly descending price order (highest bid first = closest to mid)', () => {
    const rng = makeRng(42);
    const result = buildDepth(mockQuote, mockInstrument, rng);
    for (let i = 0; i < result.bids.length - 1; i++) {
      expect(result.bids[i].price).toBeGreaterThan(result.bids[i + 1].price);
    }
  });

  it('all cumPct values are in [0, 100]', () => {
    const rng = makeRng(42);
    const result = buildDepth(mockQuote, mockInstrument, rng);
    for (const level of [...result.asks, ...result.bids]) {
      expect(level.cumPct).toBeGreaterThanOrEqual(0);
      expect(level.cumPct).toBeLessThanOrEqual(100);
    }
  });

  it('all levels have dealer from DEALERS list', () => {
    const rng = makeRng(42);
    const result = buildDepth(mockQuote, mockInstrument, rng);
    for (const level of [...result.asks, ...result.bids]) {
      expect(DEALERS).toContain(level.dealer);
    }
  });

  it("all levels have type in ['STREAM','IND','RFQ']", () => {
    const rng = makeRng(42);
    const result = buildDepth(mockQuote, mockInstrument, rng);
    const validTypes = ['STREAM', 'IND', 'RFQ'];
    for (const level of [...result.asks, ...result.bids]) {
      expect(validTypes).toContain(level.type);
    }
  });

  it('returns a midRow with mid, spread, midYield, zSpread fields', () => {
    const rng = makeRng(42);
    const result = buildDepth(mockQuote, mockInstrument, rng);
    expect(result.midRow).toBeDefined();
    expect(typeof result.midRow.mid).toBe('number');
    expect(typeof result.midRow.spread).toBe('number');
    expect(typeof result.midRow.midYield).toBe('number');
    expect(typeof result.midRow.zSpread).toBe('number');
  });

  it('midRow has correct values from quote and instrument', () => {
    const rng = makeRng(42);
    const result = buildDepth(mockQuote, mockInstrument, rng);
    expect(result.midRow.mid).toBeCloseTo(mockQuote.mid, 3);
    expect(result.midRow.spread).toBeCloseTo(mockQuote.ask - mockQuote.bid, 5);
    expect(result.midRow.midYield).toBeCloseTo(mockQuote.ytm, 3);
    expect(result.midRow.zSpread).toBeCloseTo(mockInstrument.gSpd, 3);
  });

  it('results are deterministic (same rng seed → same results)', () => {
    const result1 = buildDepth(mockQuote, mockInstrument, makeRng(12345));
    const result2 = buildDepth(mockQuote, mockInstrument, makeRng(12345));
    expect(result1.asks.map((l) => l.price)).toEqual(result2.asks.map((l) => l.price));
    expect(result1.bids.map((l) => l.price)).toEqual(result2.bids.map((l) => l.price));
    expect(result1.asks.map((l) => l.dealer)).toEqual(result2.asks.map((l) => l.dealer));
    expect(result1.bids.map((l) => l.faceMM)).toEqual(result2.bids.map((l) => l.faceMM));
  });

  it('all asks are priced above quote.ask', () => {
    const rng = makeRng(42);
    const result = buildDepth(mockQuote, mockInstrument, rng);
    for (const level of result.asks) {
      expect(level.price).toBeGreaterThan(mockQuote.ask - 0.001);
    }
  });

  it('all bids are priced below quote.bid', () => {
    const rng = makeRng(42);
    const result = buildDepth(mockQuote, mockInstrument, rng);
    for (const level of result.bids) {
      expect(level.price).toBeLessThan(mockQuote.bid + 0.001);
    }
  });
});
