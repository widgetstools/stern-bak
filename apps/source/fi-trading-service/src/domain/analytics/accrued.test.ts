
import { describe, expect, it } from 'vitest';

import { SifmaCalendar } from '../core/sifmaCalendar.js';
import { accruedInterest, accrualFraction, cdsAccrued, isCouponDate, mbsAccrued, monthEndOf } from './accrued.js';
import { buildSchedule } from './schedule.js';

const calendar = new SifmaCalendar();
const schedule = buildSchedule({ effective: 20260115, maturity: 20360115, frequency: 2, calendar });
const bond = { schedule, couponRate: 5, frequency: 2, dayCount: '30/360' as const };

describe('accruedInterest', () => {
  it('is zero on the dated date and on every coupon date', () => {
    expect(accruedInterest(bond, 20260115)).toBeCloseTo(0, 12);
    expect(accruedInterest(bond, 20260715)).toBeCloseTo(0, 12);
    expect(accruedInterest(bond, 20270115)).toBeCloseTo(0, 12);
  });

  it('reaches a full period of interest just before the coupon', () => {
    // 30/360: 15 Jan to 14 Jul is 179 days of a 180-day period.
    expect(accruedInterest(bond, 20260714)).toBeCloseTo((5 * 179) / 360, 10);
  });

  it('accrues linearly through the period', () => {
    const quarter = accruedInterest(bond, 20260415);
    expect(quarter).toBeCloseTo(1.25, 10);
    expect(accruedInterest(bond, 20260315)).toBeCloseTo(5 / 6, 10);
  });

  it('resets hard on the coupon date - a sawtooth, not a drift', () => {
    const before = accruedInterest(bond, 20260714);
    const on = accruedInterest(bond, 20260715);
    const after = accruedInterest(bond, 20260716);
    expect(before).toBeGreaterThan(2.4);
    expect(on).toBe(0);
    expect(after).toBeLessThan(0.02);
  });

  it('scales with face', () => {
    expect(accruedInterest({ ...bond, face: 1_000_000 }, 20260415)).toBeCloseTo(12_500, 6);
  });

  it('is zero outside the schedule', () => {
    expect(accruedInterest(bond, 20200101)).toBe(0);
    expect(accruedInterest(bond, 20400101)).toBe(0);
  });

  it('differs between day-count conventions on the same dates', () => {
    // 15 Jan to 14 Jul is 179 days on 30/360 but 180 actual days, so the two
    // conventions genuinely disagree - which is the point of carrying both.
    const thirty = accruedInterest(bond, 20260714);
    const act360 = accruedInterest({ ...bond, dayCount: 'ACT/360' }, 20260714);
    expect(thirty).toBeCloseTo((5 * 179) / 360, 10);
    expect(act360).toBeCloseTo((5 * 180) / 360, 10);
    expect(act360).not.toBeCloseTo(thirty, 6);
  });
});

describe('accrualFraction', () => {
  it('runs from 0 to 1 across a period', () => {
    expect(accrualFraction(bond, 20260115)).toBeCloseTo(0, 12);
    expect(accrualFraction(bond, 20260415)).toBeCloseTo(0.5, 10);
    expect(accrualFraction(bond, 20260714)).toBeCloseTo(179 / 180, 10);
  });

  it('is zero outside the schedule', () => {
    expect(accrualFraction(bond, 20200101)).toBe(0);
  });
});

describe('mbsAccrued', () => {
  it('accrues from the first of the month, not the last payment date', () => {
    // Settling on the 16th gives exactly half a month of interest.
    expect(mbsAccrued(5.5, 1_000_000, 20260316)).toBeCloseTo((5.5 / 100 / 12) * 1_000_000 * 0.5, 8);
  });

  it('is zero on the first of the month', () => {
    expect(mbsAccrued(5.5, 1_000_000, 20260301)).toBeCloseTo(0, 12);
  });

  it('caps the 31st at the 30th, as 30/360 requires', () => {
    expect(mbsAccrued(5.5, 1_000_000, 20260331)).toBeCloseTo(mbsAccrued(5.5, 1_000_000, 20260330), 12);
  });

  it('scales with the current face, which falls as the pool pays down', () => {
    expect(mbsAccrued(5.5, 500_000, 20260316)).toBeCloseTo(mbsAccrued(5.5, 1_000_000, 20260316) / 2, 10);
  });
});

describe('cdsAccrued', () => {
  it('accrues ACT/360 from the previous IMM date', () => {
    // 20 Dec 2025 to 20 Mar 2026 is 90 days.
    expect(cdsAccrued(100, 10_000_000, 20251220, 20260320)).toBeCloseTo((0.01 * 10_000_000 * 90) / 360, 6);
  });

  it('is zero on the roll date itself', () => {
    expect(cdsAccrued(100, 10_000_000, 20260320, 20260320)).toBeCloseTo(0, 12);
  });

  it('scales with the standard coupon', () => {
    const ig = cdsAccrued(100, 10_000_000, 20251220, 20260320);
    const hy = cdsAccrued(500, 10_000_000, 20251220, 20260320);
    expect(hy).toBeCloseTo(ig * 5, 6);
  });
});

describe('helpers', () => {
  it('identifies coupon dates', () => {
    expect(isCouponDate(schedule, 20260715)).toBe(true);
    expect(isCouponDate(schedule, 20260716)).toBe(false);
  });

  it('finds month ends, leap years included', () => {
    expect(monthEndOf(20260215)).toBe(20260228);
    expect(monthEndOf(20240201)).toBe(20240229);
    expect(monthEndOf(20261231)).toBe(20261231);
  });
});
