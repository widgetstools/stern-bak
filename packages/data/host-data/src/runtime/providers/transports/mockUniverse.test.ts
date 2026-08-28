/**
 * Universe growth contract.
 *
 * Positions key on CUSIP, so a feed asking for 2 000 rows needs 2 000
 * distinct securities — not the 50 archetypes cycled forty times. Growth
 * has to be deterministic (the same entries across reloads and however
 * the growth was batched), append-only (a trades feed holding earlier
 * entries must still join), and bounded (the issue-code scan must
 * terminate).
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  CORE_UNIVERSE_SIZE,
  MAX_UNIVERSE_SIZE,
  __resetMockUniverse,
  findByCusip,
  getUniverse,
  type UniverseEntry,
} from './mockUniverse.js';

const CUSIP = /^[0-9A-Z]{9}$/;
const distinct = (entries: ReadonlyArray<UniverseEntry>, key: keyof UniverseEntry) =>
  new Set(entries.map((e) => e[key])).size;

beforeEach(() => {
  __resetMockUniverse();
});

describe('core universe', () => {
  it('is the 50 hand-written archetypes, each with a unique CUSIP', () => {
    const u = getUniverse();
    expect(CORE_UNIVERSE_SIZE).toBe(50);
    expect(u).toHaveLength(CORE_UNIVERSE_SIZE);
    expect(distinct(u, 'cusip')).toBe(CORE_UNIVERSE_SIZE);
  });

  it('never shrinks below the core, whatever minSize says', () => {
    expect(getUniverse(0)).toHaveLength(CORE_UNIVERSE_SIZE);
    expect(getUniverse(-5)).toHaveLength(CORE_UNIVERSE_SIZE);
    expect(getUniverse(Number.NaN)).toHaveLength(CORE_UNIVERSE_SIZE);
  });
});

describe('growth', () => {
  it('grows to 2 000 securities unique by every identifier', () => {
    const u = getUniverse(2000);
    expect(u).toHaveLength(2000);
    for (const key of ['cusip', 'isin', 'sedol', 'figi', 'internalId'] as const) {
      expect(distinct(u, key), key).toBe(2000);
    }
    for (const e of u) expect(e.cusip).toMatch(CUSIP);
  });

  it('keeps the archetypes first and unchanged', () => {
    const core = getUniverse().map((e) => e.cusip);
    const grown = getUniverse(500);
    expect(grown.slice(0, CORE_UNIVERSE_SIZE).map((e) => e.cusip)).toEqual(core);
  });

  it('is append-only: growth hands out a new array whose earlier entries are the same objects', () => {
    const small = getUniverse(120);
    const large = getUniverse(400);
    expect(large).not.toBe(small);
    for (let i = 0; i < small.length; i++) expect(large[i]).toBe(small[i]);
  });

  it('does not shrink or rebuild when asked for less than it holds', () => {
    const large = getUniverse(400);
    expect(getUniverse(100)).toBe(large);
    expect(getUniverse()).toBe(large);
  });

  it('is deterministic across resets and independent of how growth was batched', () => {
    const inOneGo = getUniverse(600).map((e) => e.cusip);
    __resetMockUniverse();
    getUniverse(75);
    getUniverse(310);
    const inSteps = getUniverse(600).map((e) => e.cusip);
    expect(inSteps).toEqual(inOneGo);
  });

  it('caps at MAX_UNIVERSE_SIZE and stays unique all the way up', () => {
    const u = getUniverse(MAX_UNIVERSE_SIZE + 500);
    expect(u).toHaveLength(MAX_UNIVERSE_SIZE);
    expect(distinct(u, 'cusip')).toBe(MAX_UNIVERSE_SIZE);
  });
});

describe('variants', () => {
  it('are other bonds of the archetype issuer: same prefix, issuer and asset class, new CUSIP', () => {
    const u = getUniverse(300);
    for (let i = CORE_UNIVERSE_SIZE; i < u.length; i++) {
      const base = u[i % CORE_UNIVERSE_SIZE];
      const v = u[i];
      expect(v.cusip.slice(0, 6)).toBe(base.cusip.slice(0, 6));
      expect(v.cusip).not.toBe(base.cusip);
      expect(v.issuerName).toBe(base.issuerName);
      expect(v.assetClass).toBe(base.assetClass);
      expect(v.securityType).toBe(base.securityType);
    }
  });

  it('vary coupon, tenor and pricing within plausible bounds', () => {
    const u = getUniverse(300);
    for (const v of u.slice(CORE_UNIVERSE_SIZE)) {
      expect(v.couponRate).toBeGreaterThanOrEqual(0);
      expect(v.originalMaturityYears).toBeGreaterThan(0);
      expect(v.anchorPrice).toBeGreaterThanOrEqual(40);
      expect(v.anchorPrice).toBeLessThanOrEqual(140);
      expect(v.anchorSpreadBps).toBeGreaterThanOrEqual(0);
      expect(new Date(v.maturityDate).getTime()).toBeGreaterThan(Date.now());
    }
    // Not relabelled copies: one issuer shows several coupons and tenors.
    const apple = u.filter((e) => e.ticker === 'AAPL');
    expect(apple.length).toBeGreaterThan(1);
    expect(new Set(apple.map((e) => e.couponRate)).size).toBeGreaterThan(1);
    expect(new Set(apple.map((e) => e.originalMaturityYears)).size).toBeGreaterThan(1);
  });

  it('keep Treasuries on their instrument’s tenor ladder', () => {
    for (const e of getUniverse(500)) {
      if (e.securityType === 'TNote') expect([2, 3, 5, 7, 10]).toContain(e.originalMaturityYears);
      if (e.securityType === 'TBond') expect([20, 30]).toContain(e.originalMaturityYears);
      if (e.securityType === 'TBill') expect(e.originalMaturityYears).toBeLessThan(1);
      if (e.assetClass === 'Rates') expect(e.anchorSpreadBps).toBe(0);
    }
  });

  it('keep the MBS / securitised leaves of their archetype', () => {
    const u = getUniverse(300);
    for (let i = CORE_UNIVERSE_SIZE; i < u.length; i++) {
      const base = u[i % CORE_UNIVERSE_SIZE];
      const v = u[i];
      expect(v.agency).toBe(base.agency);
      expect(v.mbsType).toBe(base.mbsType);
      expect(v.trancheId === null).toBe(base.trancheId === null);
      expect(v.state).toBe(base.state);
    }
  });
});

describe('findByCusip', () => {
  it('resolves core and grown entries and misses unknown ones', () => {
    const u = getUniverse(200);
    expect(findByCusip(u[0].cusip)).toBe(u[0]);
    expect(findByCusip(u[199].cusip)).toBe(u[199]);
    expect(findByCusip('NOPE00000')).toBeUndefined();
  });

  it('sees entries added after the index was built', () => {
    const first = getUniverse()[0];
    expect(findByCusip(first.cusip)).toBe(first);
    const grown = getUniverse(120);
    expect(findByCusip(grown[119].cusip)).toBe(grown[119]);
  });
});
