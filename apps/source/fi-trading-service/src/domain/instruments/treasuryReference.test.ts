import { describe, expect, it } from 'vitest';
import {
  buildTreasuriesFromReference, termYears, treasuryReference,
} from './treasuryReference.js';

const universe = buildTreasuriesFromReference({ asOf: 20260907, startSecurityId: 0 });

describe('the vendored auction snapshot', () => {
  it('is committed data, not a live fetch', () => {
    const reference = treasuryReference();
    expect(reference.licence).toContain('public domain');
    expect(reference.source).toContain('fiscaldata.treasury.gov');
    expect(reference.securities.length).toBeGreaterThan(4000);
    expect(reference.auctionRecords).toBeGreaterThan(reference.securities.length);
  });

  it('holds one record per security, with reopenings counted', () => {
    const cusips = treasuryReference().securities.map((s) => s.cusip);
    expect(new Set(cusips).size).toBe(cusips.length);
    // A reopening auctions an existing CUSIP again; keying on the auction
    // would have minted the same security several times.
    expect(treasuryReference().securities.some((s) => s.reopenings > 0)).toBe(true);
  });
});

describe('termYears', () => {
  it('reads the terms Treasury actually publishes', () => {
    expect(termYears('30-Year')).toBe(30);
    expect(termYears('10-Year')).toBe(10);
    expect(termYears('17-Week')).toBeCloseTo(17 / 52, 6);
    expect(termYears('4-Week')).toBeCloseTo(4 / 52, 6);
    // A reopening carries the term REMAINING at the time, not the original.
    expect(termYears('29-Year 11-Month')).toBeCloseTo(29 + 11 / 12, 6);
  });

  it('is zero for something it cannot parse, rather than NaN', () => {
    expect(termYears('')).toBe(0);
    expect(termYears('Cash Management')).toBe(0);
  });
});

describe('buildTreasuriesFromReference', () => {
  it('returns only securities outstanding on the as-of date', () => {
    for (const security of universe) {
      expect(security.issueDate).toBeLessThanOrEqual(20260907);
      expect(security.maturityDate).toBeGreaterThan(20260907);
    }
  });

  it('excludes when-issued securities — auctioned but not settled', () => {
    const settledLate = treasuryReference().securities.filter(
      (s) => s.auctionDate <= '2026-09-07' && s.issueDate > '2026-09-07',
    );
    expect(settledLate.length).toBeGreaterThan(0);
    const held = new Set(universe.map((s) => s.cusip));
    for (const record of settledLate) expect(held.has(record.cusip)).toBe(false);
  });

  it('gives every security a distinct, real CUSIP', () => {
    const cusips = universe.map((s) => s.cusip);
    expect(new Set(cusips).size).toBe(cusips.length);
    // The real prefixes: bills 912797/912796, notes 91282C, bonds 912810.
    expect(universe.some((s) => s.cusip.startsWith('912797'))).toBe(true);
    expect(universe.some((s) => s.cusip.startsWith('91282C'))).toBe(true);
    expect(universe.some((s) => s.cusip.startsWith('912810'))).toBe(true);
  });

  it('carries exactly one on-the-run issue per benchmark tenor', () => {
    const onTheRun = universe.filter((s) => s.onTheRunRank === 0);
    const tenors = onTheRun.map((s) => s.benchmarkTenor);
    expect(new Set(tenors).size).toBe(tenors.length);
    // The tenors a desk quotes: bills through the thirty-year.
    for (const tenor of [2, 3, 5, 7, 10, 30]) expect(tenors).toContain(tenor);
  });

  it('ranks by benchmark tenor, not by the raw term string', () => {
    // Reopenings are recorded with the term REMAINING — "29-Year 11-Month" —
    // so grouping on the string put an old bond alone in its own category
    // where it was trivially rank 0. A 6.25% coupon is a bond from 2000.
    const thirtyYear = universe.find((s) => s.benchmarkTenor === 30 && s.onTheRunRank === 0);
    expect(thirtyYear?.couponRate).toBeLessThan(6);
    expect(thirtyYear?.maturityDate).toBeGreaterThan(20500000);
  });

  it('makes the on-the-run issue the most liquid', () => {
    const onTheRun = universe.filter((s) => s.onTheRunRank === 0);
    expect(onTheRun.every((s) => s.liquidityTier === 'T1')).toBe(true);
    // Strips carry no rank of their own — they inherit their parent's — so
    // they are excluded rather than swept into the seasoned bucket.
    const seasoned = universe.filter((s) => (s.onTheRunRank ?? -1) > 2);
    expect(seasoned.length).toBeGreaterThan(0);
    expect(seasoned.every((s) => s.liquidityTier === 'T3')).toBe(true);
  });

  it('sizes an issue by its offering plus its reopenings', () => {
    const tenYear = universe.find((s) => s.benchmarkTenor === 10 && s.onTheRunRank === 0);
    // The current ten-year note is tens of billions, not hundreds.
    expect(tenYear?.amountOutstandingUsd).toBeGreaterThan(20e9);
    expect(tenYear?.amountOutstandingUsd).toBeLessThan(400e9);
  });

  it('sets the conventions each instrument actually trades on', () => {
    const bill = universe.find((s) => s.securityType === 'TBill');
    expect(bill?.dayCount).toBe('ACT/360');
    expect(bill?.quotationBasis).toBe('Yield');
    expect(bill?.couponRate).toBe(0);

    const note = universe.find((s) => s.securityType === 'TNote');
    expect(note?.dayCount).toBe('ACT/ACT');
    expect(note?.quotationBasis).toBe('Thirty2nds');
    expect(note?.couponRate).toBeGreaterThan(0);
    expect(note?.frequency).toBe(2);
  });

  it('mints one principal STRIP per corpus CUSIP, not per maturity', () => {
    const strips = universe.filter((s) => s.securityType === 'Strip');
    expect(strips.length).toBeGreaterThan(100);
    // A principal strip keeps its parent issue's identity, so several bonds
    // redeeming on one day give several distinct strips. Only the CUSIP has to
    // be unique; the maturity does not.
    expect(new Set(strips.map((s) => s.cusip)).size).toBe(strips.length);
    expect(new Set(strips.map((s) => s.maturityDate)).size).toBeLessThan(strips.length);
    expect(strips.every((s) => s.couponRate === 0 && s.couponType === 'Zero')).toBe(true);
  });

  it('carries no literal "null" strings out of the API', () => {
    // The endpoint returns the STRING "null" for an absent value, which is
    // truthy — `a || null` left it in four fields of the snapshot.
    for (const record of treasuryReference().securities) {
      for (const value of Object.values(record)) expect(value).not.toBe('null');
    }
    expect(universe.every((s) => s.cusip !== 'null' && s.description.indexOf('null') === -1)).toBe(true);
  });

  it('leaves STRIPS out when asked', () => {
    const bare = buildTreasuriesFromReference({ asOf: 20260907, includeStrips: false });
    expect(bare.some((s) => s.securityType === 'Strip')).toBe(false);
    expect(bare.length).toBeLessThan(universe.length);
  });

  it('keeps the most current issues when capped', () => {
    const small = buildTreasuriesFromReference({ asOf: 20260907, limit: 20, includeStrips: false });
    expect(small).toHaveLength(20);
    expect(small.filter((s) => s.onTheRunRank === 0).length).toBeGreaterThan(5);
  });

  it('shrinks as the as-of date moves back through the record', () => {
    const earlier = buildTreasuriesFromReference({ asOf: 20200907, includeStrips: false });
    const later = buildTreasuriesFromReference({ asOf: 20260907, includeStrips: false });
    expect(earlier.length).toBeGreaterThan(0);
    expect(earlier.map((s) => s.cusip)).not.toEqual(later.map((s) => s.cusip));
  });
});
