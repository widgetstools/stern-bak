import { describe, expect, it } from 'vitest';
import { isOnTheRun, yearsToMaturity, type Security } from './types.js';

function security(over: Partial<Security> = {}): Security {
  return {
    securityId: 1, cusip: '912828YZ7', isin: '', assetClass: 'Rates',
    securityType: 'TNote', description: 'US TREASURY NOTE', issuerId: 0,
    issuerName: 'UNITED STATES TREASURY', sectorIndex: 0, currency: 'USD',
    issueDate: 20260907, datedDate: 20260907, maturityDate: 20360907,
    originalTermYears: 10, couponRate: 4.25, couponType: 'Fixed', frequency: 2,
    dayCount: 'ACT/ACT', endOfMonth: false, amountOutstandingUsd: 40e9,
    quotationBasis: 'Thirty2nds', ratingIndex: 0, seniority: 'Treasury',
    liquidityTier: 'T1', callable: false, callSchedule: [], benchmarkTenor: 10,
    issueSpreadBp: 0, onTheRunRank: 0, ...over,
  };
}

describe('yearsToMaturity', () => {
  it('is the term at issue for a bond priced on its issue date', () => {
    expect(yearsToMaturity(security(), 20260907)).toBeCloseTo(10, 2);
  });

  it('counts down as the as-of date advances', () => {
    const s = security();
    expect(yearsToMaturity(s, 20310907)).toBeCloseTo(5, 2);
    expect(yearsToMaturity(s, 20310907)).toBeLessThan(yearsToMaturity(s, 20290907));
  });

  it('floors at zero rather than going negative past maturity', () => {
    expect(yearsToMaturity(security(), 20400101)).toBe(0);
  });
});

describe('isOnTheRun', () => {
  it('is true only for rank zero', () => {
    expect(isOnTheRun(security({ onTheRunRank: 0 }))).toBe(true);
    expect(isOnTheRun(security({ onTheRunRank: 1 }))).toBe(false);
  });

  it('is false for anything that is not auctioned', () => {
    expect(isOnTheRun(security({ onTheRunRank: null, assetClass: 'CorpIG' }))).toBe(false);
  });
});
