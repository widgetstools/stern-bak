
import { describe, expect, it } from 'vitest';

import { isValidCusip } from '../core/identifiers.js';
import { nssDiscountCurve } from '../curves/discount.js';
import { AGENCY_ISSUERS, buildAgencyDebentures } from './agencyDebenture.js';

const curve = nssDiscountCurve({ b0: 4.95, b1: -0.85, b2: -1.6, b3: 1.4 });
const benchmarkYield = (_date: number, tenor: number): number => curve.parYield(tenor, 2);
const debentures = buildAgencyDebentures({
  asOf: 20260115, seed: 701, startSecurityId: 90_000, benchmarkYield,
});

describe('agency debentures', () => {
  it('builds paper for every GSE', () => {
    for (const agency of AGENCY_ISSUERS) {
      expect(debentures.some((d) => d.issuerName === agency.name)).toBe(true);
      expect(debentures.some((d) => d.cusip.startsWith(agency.cusipPrefix))).toBe(true);
    }
  });

  it('mints valid, unique CUSIPs on the real GSE prefixes', () => {
    const seen = new Set<string>();
    for (const debenture of debentures) {
      expect(isValidCusip(debenture.cusip)).toBe(true);
      expect(seen.has(debenture.cusip)).toBe(false);
      seen.add(debenture.cusip);
    }
  });

  it('sits between Treasuries and corporates on spread', () => {
    for (const debenture of debentures) {
      expect(debenture.issueSpreadBp).toBeGreaterThan(0);
      expect(debenture.issueSpreadBp).toBeLessThan(90);
    }
  });

  it('rates the sector AAA and marks agency seniority', () => {
    for (const debenture of debentures) {
      expect(debenture.ratingIndex).toBe(0);
      expect(debenture.seniority).toBe('Agency');
      expect(debenture.assetClass).toBe('Agency');
    }
  });

  it('makes about a third callable, which is where the sector convexity comes from', () => {
    const callable = debentures.filter((d) => d.callable);
    const share = callable.length / debentures.length;
    expect(share).toBeGreaterThan(0.15);
    expect(share).toBeLessThan(0.55);
    for (const debenture of callable) {
      expect(debenture.callSchedule.length).toBeGreaterThan(0);
      expect(debenture.description).toContain('CALLABLE');
    }
  });

  it('charges more spread for the call option', () => {
    const mean = (list: typeof debentures): number =>
      list.reduce((a, b) => a + b.issueSpreadBp, 0) / list.length;
    expect(mean(debentures.filter((d) => d.callable))).toBeGreaterThan(
      mean(debentures.filter((d) => !d.callable)),
    );
  });

  it('issues in round sizes and matures in the future', () => {
    for (const debenture of debentures) {
      expect(debenture.amountOutstandingUsd % 50_000_000).toBe(0);
      expect(debenture.maturityDate).toBeGreaterThan(20260115);
    }
  });

  it('sets coupons on the eighth grid', () => {
    for (const debenture of debentures) {
      expect(Number.isInteger(Math.round(debenture.couponRate * 8 * 1e6) / 1e6)).toBe(true);
    }
  });

  it('is deterministic', () => {
    const again = buildAgencyDebentures({
      asOf: 20260115, seed: 701, startSecurityId: 90_000, benchmarkYield,
    });
    expect(again.map((d) => d.cusip)).toEqual(debentures.map((d) => d.cusip));
  });
});
