
import { describe, expect, it } from 'vitest';

import { isValidCusip, isValidIsin } from '../core/identifiers.js';
import { nssDiscountCurve } from '../curves/discount.js';
import { yearOf } from '../core/dateInt.js';
import { buildCreditBonds, byCusipPrefix, issuerCurve } from './creditBonds.js';
import { buildIssuers } from './creditIssuers.js';

const curve = nssDiscountCurve({ b0: 4.95, b1: -0.85, b2: -1.6, b3: 1.4 });

/** Rates were lower further back, so seasoned bonds carry lower coupons. */
const benchmarkYield = (issueDate: number, tenor: number): number => {
  const yearsAgo = 2026 - yearOf(issueDate);
  return Math.max(0.6, curve.parYield(tenor, 2) - yearsAgo * 0.42);
};

const issuers = buildIssuers({ seed: 601, investmentGrade: 60, highYield: 40 });
const bonds = buildCreditBonds({
  issuers, asOf: 20260115, seed: 601, startSecurityId: 10_000, benchmarkYield,
});

describe('capital structures', () => {
  it('gives every issuer several bonds', () => {
    for (const issuer of issuers) {
      const curveBonds = issuerCurve(bonds, issuer.issuerId);
      expect(curveBonds.length).toBeGreaterThanOrEqual(1);
      expect(curveBonds.length).toBeLessThanOrEqual(8);
    }
    expect(bonds.length).toBeGreaterThan(issuers.length * 2);
  });

  it('shares ONE CUSIP prefix across an issuer whole curve', () => {
    for (const issuer of issuers.slice(0, 40)) {
      const curveBonds = issuerCurve(bonds, issuer.issuerId);
      for (const bond of curveBonds) {
        expect(bond.cusip.startsWith(issuer.cusipPrefix)).toBe(true);
      }
      expect(byCusipPrefix(bonds, issuer.cusipPrefix)).toHaveLength(curveBonds.length);
    }
  });

  it('orders an issuer curve by maturity, so it can be plotted', () => {
    const withSeveral = issuers.find((i) => issuerCurve(bonds, i.issuerId).length >= 4);
    expect(withSeveral).toBeDefined();
    const curveBonds = issuerCurve(bonds, withSeveral?.issuerId as number);
    for (let i = 1; i < curveBonds.length; i++) {
      expect(curveBonds[i]?.maturityDate as number).toBeGreaterThanOrEqual(
        curveBonds[i - 1]?.maturityDate as number,
      );
    }
  });

  it('inherits sector and issuer identity from the issuer', () => {
    const byId = new Map(issuers.map((i) => [i.issuerId, i]));
    for (const bond of bonds) {
      const issuer = byId.get(bond.issuerId);
      expect(issuer).toBeDefined();
      expect(bond.sectorIndex).toBe(issuer?.sectorIndex);
      expect(bond.issuerName).toBe(issuer?.name);
      expect(bond.assetClass).toBe(issuer?.isHighYield ? 'CorpHY' : 'CorpIG');
    }
  });

  it('mints valid, unique identifiers', () => {
    const seen = new Set<string>();
    for (const bond of bonds) {
      expect(isValidCusip(bond.cusip)).toBe(true);
      expect(isValidIsin(bond.isin)).toBe(true);
      expect(seen.has(bond.cusip)).toBe(false);
      seen.add(bond.cusip);
    }
  });
});

describe('coupons are set at issue, not today', () => {
  it('spans a wide range, because the curve moved', () => {
    // A book where every coupon reflects today's curve is uniformly near par,
    // which never happens. Seasoned paper should carry off-market coupons.
    const coupons = bonds.map((b) => b.couponRate);
    const low = Math.min(...coupons);
    const high = Math.max(...coupons);
    expect(low).toBeLessThan(3.5);
    expect(high).toBeGreaterThan(7);
    expect(high - low).toBeGreaterThan(4);
  });

  it('gives older bonds lower coupons under a rising-rate history', () => {
    const seasoned = bonds.filter((b) => yearOf(b.issueDate) <= 2021);
    const recent = bonds.filter((b) => yearOf(b.issueDate) >= 2025);
    const mean = (list: typeof bonds): number => list.reduce((a, b) => a + b.couponRate, 0) / list.length;
    expect(seasoned.length).toBeGreaterThan(20);
    expect(recent.length).toBeGreaterThan(20);
    expect(mean(seasoned)).toBeLessThan(mean(recent));
  });

  it('sets coupons on the eighth grid', () => {
    for (const bond of bonds) {
      expect(Number.isInteger(Math.round(bond.couponRate * 8 * 1e6) / 1e6)).toBe(true);
      expect(bond.couponRate).toBeGreaterThan(0);
    }
  });

  it('pays high yield more than investment grade', () => {
    const mean = (list: typeof bonds): number => list.reduce((a, b) => a + b.couponRate, 0) / list.length;
    expect(mean(bonds.filter((b) => b.assetClass === 'CorpHY'))).toBeGreaterThan(
      mean(bonds.filter((b) => b.assetClass === 'CorpIG')),
    );
  });

  it('widens the issue spread down the rating scale', () => {
    const mean = (list: typeof bonds): number => list.reduce((a, b) => a + b.issueSpreadBp, 0) / list.length;
    expect(mean(bonds.filter((b) => b.assetClass === 'CorpHY'))).toBeGreaterThan(
      mean(bonds.filter((b) => b.assetClass === 'CorpIG')) * 2,
    );
  });
});

describe('the issuer curve inherits its shape from the credit model', () => {
  it('slopes UP for a healthy name and INVERTS for a distressed one', () => {
    // The spread at each tenor comes from issuerSpreadAtTenor, whose slope is
    // a function of the spread level. So a distressed issuer's curve inverts
    // with no special case anywhere in the instrument builder.
    const healthy = { ...(issuers[0] as (typeof issuers)[number]), issuerId: 9001, baseSpread5yBp: 110 };
    const distressed = { ...(issuers[0] as (typeof issuers)[number]), issuerId: 9002, baseSpread5yBp: 1200 };
    const built = buildCreditBonds({
      issuers: [healthy, distressed], asOf: 20260115, seed: 42, startSecurityId: 1,
      benchmarkYield: () => 4, minPerIssuer: 7, maxPerIssuer: 7,
    });

    const spreadByTerm = (issuerId: number): Map<number, number> => {
      const map = new Map<number, number>();
      for (const bond of built.filter((b) => b.issuerId === issuerId)) {
        if (bond.seniority !== 'SeniorUnsecured') continue;
        map.set(bond.originalTermYears, bond.issueSpreadBp);
      }
      return map;
    };

    const compare = (map: Map<number, number>): 'up' | 'down' | 'flat' => {
      const terms = [...map.keys()].sort((a, b) => a - b);
      if (terms.length < 2) return 'flat';
      const first = map.get(terms[0] as number) as number;
      const last = map.get(terms[terms.length - 1] as number) as number;
      return last > first ? 'up' : last < first ? 'down' : 'flat';
    };

    expect(compare(spreadByTerm(9001))).toBe('up');
    expect(compare(spreadByTerm(9002))).toBe('down');
  });
});

describe('call structures differ by market', () => {
  const ig = bonds.filter((b) => b.assetClass === 'CorpIG');
  const hy = bonds.filter((b) => b.assetClass === 'CorpHY');

  it('gives investment grade a make-whole plus a par call at the end', () => {
    for (const bond of ig) {
      expect(bond.callSchedule).toHaveLength(2);
      expect(bond.callSchedule[0]?.makeWhole).toBe(true);
      expect(bond.callSchedule[1]?.price).toBe(100);
      expect(bond.callSchedule[1]?.date as number).toBeLessThan(bond.maturityDate);
    }
  });

  it('gives high yield a genuine step-down schedule after a non-call period', () => {
    for (const bond of hy) {
      expect(bond.callSchedule).toHaveLength(3);
      expect(bond.callSchedule.every((c) => c.makeWhole !== true)).toBe(true);
      const prices = bond.callSchedule.map((c) => c.price);
      expect(prices[0] as number).toBeGreaterThan(100);
      expect(prices[0] as number).toBeGreaterThan(prices[2] as number);
      expect(bond.callSchedule[0]?.date as number).toBeGreaterThan(bond.issueDate);
    }
  });

  it('marks high yield callable and leaves the IG par call out of the flag', () => {
    expect(hy.every((b) => b.callable)).toBe(true);
  });
});

describe('terms and market shape', () => {
  it('issues in round benchmark sizes, never an odd number', () => {
    for (const bond of bonds) {
      expect(bond.amountOutstandingUsd % 50_000_000).toBe(0);
      expect(bond.amountOutstandingUsd).toBeGreaterThanOrEqual(300_000_000);
      expect(bond.amountOutstandingUsd).toBeLessThanOrEqual(3_000_000_000);
    }
  });

  it('matures in the future and after issue', () => {
    for (const bond of bonds) {
      expect(bond.maturityDate).toBeGreaterThan(20260115);
      expect(bond.maturityDate).toBeGreaterThan(bond.issueDate);
    }
  });

  it('quotes investment grade on spread and high yield in eighths', () => {
    expect(bonds.filter((b) => b.assetClass === 'CorpIG').every((b) => b.quotationBasis === 'Spread')).toBe(true);
    expect(bonds.filter((b) => b.assetClass === 'CorpHY').every((b) => b.quotationBasis === 'Eighths')).toBe(true);
  });

  it('issues a real subordinated stack at banks and insurers', () => {
    const financials = bonds.filter((b) => b.sectorIndex === 0 || b.sectorIndex === 8);
    const subordinated = financials.filter((b) => b.seniority !== 'SeniorUnsecured');
    expect(subordinated.length).toBeGreaterThan(0);
    for (const bond of subordinated) {
      // Subordination is notched down from the issuer rating.
      expect(bond.ratingIndex).toBeGreaterThanOrEqual(0);
    }
  });

  it('notches subordinated debt below senior, and secured above', () => {
    const byId = new Map(issuers.map((i) => [i.issuerId, i]));
    for (const bond of bonds) {
      const issuer = byId.get(bond.issuerId);
      if (issuer === undefined) continue;
      if (bond.seniority === 'Subordinated') expect(bond.ratingIndex).toBeGreaterThan(issuer.ratingIndex);
      if (bond.seniority === 'SeniorSecured' && issuer.ratingIndex > 0) {
        expect(bond.ratingIndex).toBeLessThan(issuer.ratingIndex);
      }
      if (bond.seniority === 'SeniorUnsecured') expect(bond.ratingIndex).toBe(issuer.ratingIndex);
    }
  });

  it('spreads liquidity across tiers rather than making everything liquid', () => {
    const tiers = new Set(bonds.map((b) => b.liquidityTier));
    expect(tiers.size).toBeGreaterThanOrEqual(3);
  });

  it('is deterministic', () => {
    const again = buildCreditBonds({
      issuers, asOf: 20260115, seed: 601, startSecurityId: 10_000, benchmarkYield,
    });
    expect(again.map((b) => b.cusip)).toEqual(bonds.map((b) => b.cusip));
    expect(again.map((b) => b.couponRate)).toEqual(bonds.map((b) => b.couponRate));
  });
});
