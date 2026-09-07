
import { describe, expect, it } from 'vitest';

import {
  CONVENTION_BY_INSTRUMENT, accrualDays, days30360US, days30E360, days30E360ISDA,
  yearFraction, yearFractionActActIcma, yearFractionActActIsda,
} from './dayCount.js';

describe('30/360 US', () => {
  it('applies the February end-of-month rule', () => {
    // The rule that separates it from every other convention: when the start
    // is the last day of February it counts as the 30th. Verified by hand.
    expect(days30360US(20260228, 20260831, true)).toBe(180);
    expect(days30360US(20260228, 20260831, false)).toBe(183);
    expect(days30360US(20240229, 20240831, true)).toBe(180);
    expect(days30360US(20240229, 20240831, false)).toBe(182);
  });

  it('maps a 31st onto the 30th on both legs', () => {
    expect(days30360US(20260131, 20260731)).toBe(180);
    expect(days30360US(20260130, 20260731)).toBe(180);
  });

  it('leaves a 31st end alone when the start is earlier than the 30th', () => {
    expect(days30360US(20260115, 20260731)).toBe(196);
  });

  it('gives a whole year for matching dates', () => {
    expect(days30360US(20260315, 20270315)).toBe(360);
  });
});

describe('30E/360 variants', () => {
  it('has no February rule, which is why a Eurobond accrues differently', () => {
    expect(days30E360(20260228, 20260831)).toBe(182);
    expect(days30360US(20260228, 20260831, true)).toBe(180);
  });

  it('maps both 31sts down', () => {
    expect(days30E360(20260131, 20260731)).toBe(180);
    expect(days30E360(20260115, 20260731)).toBe(195);
  });

  it('ISDA treats any month end as the 30th, except a February maturity', () => {
    expect(days30E360ISDA(20260228, 20260831, false)).toBe(180);
    expect(days30E360ISDA(20260831, 20270228, true)).toBe(178);
    expect(days30E360ISDA(20260831, 20270228, false)).toBe(180);
  });
});

describe('ACT/ACT', () => {
  it('gives exactly one for a calendar year', () => {
    expect(yearFractionActActIsda(20260101, 20270101)).toBeCloseTo(1, 12);
    expect(yearFractionActActIsda(20240101, 20250101)).toBeCloseTo(1, 12);
  });

  it('weights each year by its own length across a leap boundary', () => {
    // 1 Jul 2023 -> 1 Jul 2024: 184/365 in 2023 plus 182/366 in 2024.
    const expected = 184 / 365 + 182 / 366;
    expect(yearFractionActActIsda(20230701, 20240701)).toBeCloseTo(expected, 12);
  });

  it('is zero for an empty span', () => {
    expect(yearFractionActActIsda(20260315, 20260315)).toBe(0);
  });

  it('ICMA divides by the coupon period, annualised by frequency', () => {
    const context = { periodStart: 20260215, periodEnd: 20260815, frequency: 2 };
    expect(yearFractionActActIcma(20260215, 20260815, context)).toBeCloseTo(0.5, 12);
    expect(yearFractionActActIcma(20260215, 20260515, context)).toBeCloseTo(89 / (181 * 2), 12);
  });

  it('ICMA refuses to guess a period it was not given', () => {
    expect(() => yearFraction('ACT/ACT-ICMA', 20260101, 20260201)).toThrow(/coupon period/);
  });
});

describe('yearFraction', () => {
  it('divides by the right denominator per convention', () => {
    expect(yearFraction('ACT/360', 20260101, 20260131)).toBeCloseTo(30 / 360, 12);
    expect(yearFraction('ACT/365F', 20260101, 20260131)).toBeCloseTo(30 / 365, 12);
    expect(yearFraction('30/360', 20260101, 20260701)).toBeCloseTo(0.5, 12);
    expect(yearFraction('30E/360', 20260101, 20260701)).toBeCloseTo(0.5, 12);
    expect(yearFraction('30E/360-ISDA', 20260101, 20260701)).toBeCloseTo(0.5, 12);
    expect(yearFraction('ACT/ACT', 20260101, 20270101)).toBeCloseTo(1, 12);
  });

  it('shows why the money-market conventions are not interchangeable', () => {
    // 360 in the denominator makes ACT/360 the larger of the two.
    const act360 = yearFraction('ACT/360', 20260101, 20270101);
    const act365 = yearFraction('ACT/365F', 20260101, 20270101);
    expect(act360).toBeCloseTo(365 / 360, 12);
    expect(act360).toBeGreaterThan(act365);
  });
});

describe('accrualDays', () => {
  it('returns actual days for the ACT family and 30/360 days otherwise', () => {
    expect(accrualDays('ACT/360', 20260101, 20260131)).toBe(30);
    expect(accrualDays('ACT/ACT', 20260101, 20260131)).toBe(30);
    expect(accrualDays('30/360', 20260131, 20260731)).toBe(180);
    expect(accrualDays('30E/360', 20260131, 20260731)).toBe(180);
    expect(accrualDays('30E/360-ISDA', 20260131, 20260731)).toBe(180);
  });
});

describe('CONVENTION_BY_INSTRUMENT', () => {
  it('assigns the market convention, not one default for everything', () => {
    expect(CONVENTION_BY_INSTRUMENT.treasury).toBe('ACT/ACT');
    expect(CONVENTION_BY_INSTRUMENT.corporate).toBe('30/360');
    expect(CONVENTION_BY_INSTRUMENT.cdsPremium).toBe('ACT/360');
    expect(CONVENTION_BY_INSTRUMENT.eurobond).toBe('30E/360');
    expect(new Set(Object.values(CONVENTION_BY_INSTRUMENT)).size).toBeGreaterThan(1);
  });
});
