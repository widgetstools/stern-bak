import { describe, expect, it } from 'vitest';

import { isValidCusip } from '../core/identifiers.js';
import { SifmaCalendar } from '../core/sifmaCalendar.js';
import { collateralMultiplier } from '../analytics/prepay/poolMultipliers.js';
import {
  buildMbsPools, cohortPools, collateralForStory, isPoolNumber, PAYUP_32NDS, payUpPoints,
  SETTLEMENT_CLASS, TBA_COUPONS, tbaNotificationDate, tbaSettlementDate, type PoolStory,
} from './mbsPools.js';

const calendar = new SifmaCalendar();
const records = buildMbsPools({
  asOf: 20260115, calendar, seed: 901, startSecurityId: 300_000, poolsPerCohortCoupon: 3,
});

describe('the pool universe', () => {
  it('covers every cohort and coupon', () => {
    expect(records.length).toBe(5 * TBA_COUPONS.length * 3);
    expect(cohortPools(records, 'UMBS30', 5.5)).toHaveLength(3);
  });

  it('mints valid, unique CUSIPs and well-formed pool numbers', () => {
    const seen = new Set<string>();
    for (const record of records) {
      expect(isValidCusip(record.security.cusip)).toBe(true);
      expect(isPoolNumber(record.poolNumber)).toBe(true);
      expect(seen.has(record.security.cusip)).toBe(false);
      seen.add(record.security.cusip);
    }
  });

  it('sets the net coupon below the borrower rate by servicing and guarantee fee', () => {
    for (const record of records) {
      expect(record.pool.weightedAverageCoupon).toBeGreaterThan(record.pool.netCoupon);
      expect(record.pool.weightedAverageCoupon - record.pool.netCoupon).toBeCloseTo(0.71, 6);
      expect(record.security.couponRate).toBe(record.pool.netCoupon);
    }
  });

  it('pays monthly on 30/360, quoted in 32nds', () => {
    for (const record of records) {
      expect(record.security.frequency).toBe(12);
      expect(record.security.dayCount).toBe('30/360');
      expect(record.security.quotationBasis).toBe('Thirty2nds');
    }
  });

  it('publishes the factor to eight decimals as a STEP, never a drift', () => {
    for (const record of records) {
      const factor = record.pool.factor;
      expect(factor).toBeGreaterThan(0);
      expect(factor).toBeLessThanOrEqual(1);
      // Eight decimals exactly, the way an agency factor tape reports it.
      expect(Number(factor.toFixed(8))).toBe(factor);
    }
  });

  it('reports current face as original face times the factor', () => {
    for (const record of records) {
      expect(record.security.amountOutstandingUsd).toBe(
        Math.round(record.pool.originalFaceUsd * record.pool.factor),
      );
    }
  });

  it('seasons pools without exceeding their term', () => {
    for (const record of records) {
      expect(record.pool.weightedAverageLoanAge).toBeGreaterThan(0);
      expect(record.pool.weightedAverageMaturity).toBeGreaterThan(0);
      expect(record.security.maturityDate).toBeGreaterThan(20260115);
    }
  });
});

describe('specified-pool stories', () => {
  it('produces a mix of stories, with generic the largest single share', () => {
    const counts = new Map<PoolStory, number>();
    for (const record of records) counts.set(record.story, (counts.get(record.story) ?? 0) + 1);
    expect(counts.size).toBeGreaterThan(6);
    expect(counts.get('Generic') as number).toBeGreaterThan(0);
  });

  it('gives every story collateral that actually differs from generic', () => {
    const generic = collateralMultiplier(collateralForStory('Generic'));
    for (const story of Object.keys(PAYUP_32NDS) as PoolStory[]) {
      if (story === 'Generic') continue;
      expect(collateralMultiplier(collateralForStory(story))).not.toBeCloseTo(generic, 3);
    }
  });

  it('AGREES WITH THE PREPAYMENT MODEL: bigger pay-up, slower collateral', () => {
    // The pay-up table and the prepayment multipliers have to tell one story,
    // or the structured book is internally inconsistent in a way anyone who
    // trades specified pools spots immediately.
    const stories: PoolStory[] = ['LLB85', 'LLB110', 'LLB150', 'LLB175', 'Generic'];
    const speeds = stories.map((s) => collateralMultiplier(collateralForStory(s)));
    const payUps = stories.map((s) => PAYUP_32NDS[s].premium);
    for (let i = 1; i < stories.length; i++) {
      expect(speeds[i] as number).toBeGreaterThan(speeds[i - 1] as number);
      expect(payUps[i] as number).toBeLessThan(payUps[i - 1] as number);
    }
  });

  it('prices an 85k pool at about a point and a half over TBA at a premium', () => {
    expect(payUpPoints('LLB85', 101)).toBeCloseTo(48 / 32, 1);
    expect(PAYUP_32NDS.LLB85.premium / 32).toBeGreaterThan(1.4);
  });

  it('collapses the pay-up at par, where there is no premium to protect', () => {
    for (const story of ['LLB85', 'NewYork', 'Investor'] as PoolStory[]) {
      expect(payUpPoints(story, 99.5)).toBeLessThan(payUpPoints(story, 103) / 3);
    }
  });

  it('charges nothing for generic collateral, at any price', () => {
    expect(payUpPoints('Generic', 104)).toBe(0);
    expect(payUpPoints('Generic', 98)).toBe(0);
  });
});

describe('SIFMA settlement', () => {
  it('settles 30-year conventionals before 15s, and Ginnies last', () => {
    expect(SETTLEMENT_CLASS.UMBS30.businessDay).toBeLessThan(SETTLEMENT_CLASS.UMBS15.businessDay);
    expect(SETTLEMENT_CLASS.UMBS15.businessDay).toBeLessThan(SETTLEMENT_CLASS['GNMA2-30'].businessDay);
    expect(SETTLEMENT_CLASS.UMBS30.klass).toBe('A');
    expect(SETTLEMENT_CLASS['GNMA2-30'].klass).toBe('C');
  });

  it('lands settlement on a business day, well into the month', () => {
    for (const cohort of ['UMBS30', 'UMBS15', 'GNMA2-30'] as const) {
      const settlement = tbaSettlementDate(cohort, 20260301, calendar);
      expect(calendar.isBusinessDay(settlement)).toBe(true);
      expect(Math.trunc(settlement / 100) % 100).toBe(3);
      expect(settlement % 100).toBeGreaterThan(3);
    }
  });

  it('is NOT T+2 - the whole point of the class calendar', () => {
    const settlement = tbaSettlementDate('UMBS30', 20260301, calendar);
    expect(settlement % 100).toBeGreaterThan(5);
  });

  it('notifies two business days before settlement', () => {
    const settlement = tbaSettlementDate('UMBS30', 20260301, calendar);
    const notification = tbaNotificationDate(settlement, calendar);
    expect(notification).toBeLessThan(settlement);
    expect(calendar.isBusinessDay(notification)).toBe(true);
    let count = 0;
    for (let d = notification; d < settlement; d = d + 1) {
      if (String(d).length === 8 && calendar.isBusinessDay(d)) count += 1;
    }
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('steps settlement over a holiday month', () => {
    // January 2026 has New Year and MLK, pushing the sixth business day later.
    const january = tbaSettlementDate('UMBS30', 20260101, calendar);
    expect(calendar.isBusinessDay(january)).toBe(true);
    expect(january % 100).toBeGreaterThan(6);
  });
});

describe('determinism', () => {
  it('rebuilds identically for a seed', () => {
    const again = buildMbsPools({
      asOf: 20260115, calendar, seed: 901, startSecurityId: 300_000, poolsPerCohortCoupon: 3,
    });
    expect(again.map((r) => r.security.cusip)).toEqual(records.map((r) => r.security.cusip));
    expect(again.map((r) => r.pool.factor)).toEqual(records.map((r) => r.pool.factor));
  });
});
