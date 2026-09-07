
import { describe, expect, it } from 'vitest';

import { SifmaCalendar } from '../core/sifmaCalendar.js';
import {
  buildSchedule, nextCouponDate, PAYMENT_DELAY_DAYS, periodContaining, periodMonths,
  previousCouponDate, remainingPeriods,
} from './schedule.js';

const calendar = new SifmaCalendar();

function semiannual(effective = 20260115, maturity = 20360115) {
  return buildSchedule({ effective, maturity, frequency: 2, calendar });
}

describe('buildSchedule', () => {
  it('generates the right number of periods', () => {
    expect(semiannual()).toHaveLength(20);
    expect(buildSchedule({ effective: 20260115, maturity: 20360115, frequency: 1, calendar })).toHaveLength(10);
    expect(buildSchedule({ effective: 20260115, maturity: 20360115, frequency: 4, calendar })).toHaveLength(40);
  });

  it('runs from the dated date to maturity with no gaps', () => {
    const schedule = semiannual();
    expect(schedule[0]?.accrualStart).toBe(20260115);
    expect(schedule[schedule.length - 1]?.accrualEnd).toBe(20360115);
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i]?.accrualStart).toBe(schedule[i - 1]?.accrualEnd);
    }
  });

  it('generates backwards, so the day of month follows maturity', () => {
    // A bond dated the 3rd but maturing on the 15th pays on the 15th.
    const schedule = buildSchedule({ effective: 20260103, maturity: 20310115, frequency: 2, calendar });
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i]?.accrualEnd as number % 100).toBe(15);
    }
  });

  it('puts a short stub at the front, where the market puts it', () => {
    const schedule = buildSchedule({ effective: 20260103, maturity: 20310115, frequency: 2, calendar });
    // Backward generation lands the boundaries on the 15th, so the stub is
    // the 12 days from the dated date to the first regular coupon date.
    expect(schedule[0]?.isStub).toBe(true);
    expect(schedule[0]?.accrualStart).toBe(20260103);
    expect(schedule[0]?.accrualEnd).toBe(20260115);
    expect(schedule[1]?.isStub).toBe(false);
    expect(schedule[1]?.accrualEnd).toBe(20260715);
  });

  it('has no stub when the dates align', () => {
    expect(semiannual().every((period) => !period.isStub)).toBe(true);
  });

  it('leaves accrual dates UNADJUSTED but adjusts payment dates', () => {
    // 15 August 2026 is a Saturday.
    const schedule = buildSchedule({ effective: 20260215, maturity: 20280215, frequency: 2, calendar });
    const august = schedule.find((period) => period.accrualEnd === 20260815);
    expect(august).toBeDefined();
    expect(august?.accrualEnd).toBe(20260815);
    expect(august?.paymentDate).toBe(20260817);
  });

  it('applies a payment delay, which is money on a mortgage', () => {
    const withDelay = buildSchedule({
      effective: 20260101, maturity: 20280101, frequency: 12, calendar,
      paymentDelayDays: PAYMENT_DELAY_DAYS.umbs30,
    });
    const first = withDelay[0];
    expect(first?.accrualEnd).toBe(20260201);
    expect(first?.paymentDate).toBe(20260225);
  });

  it('rolls month ends together when asked', () => {
    const schedule = buildSchedule({
      effective: 20260228, maturity: 20280229, frequency: 2, calendar, endOfMonth: true,
    });
    expect(schedule.map((p) => p.accrualEnd)).toContain(20260831);
    expect(schedule.map((p) => p.accrualEnd)).toContain(20270228);
  });

  it('refuses a maturity that does not follow the dated date', () => {
    expect(() => buildSchedule({ effective: 20260115, maturity: 20260115, frequency: 2, calendar })).toThrow(
      /must follow/,
    );
  });

  it('converts frequency to months', () => {
    expect([1, 2, 4, 12].map((f) => periodMonths(f as 1 | 2 | 4 | 12))).toEqual([12, 6, 3, 1]);
  });
});

describe('lookups', () => {
  const schedule = semiannual();

  it('finds the period containing a settlement date', () => {
    expect(periodContaining(schedule, 20260401)?.accrualEnd).toBe(20260715);
    expect(periodContaining(schedule, 20260115)?.accrualStart).toBe(20260115);
    // The end of a period belongs to the NEXT one, or accrued never resets.
    expect(periodContaining(schedule, 20260715)?.accrualStart).toBe(20260715);
    expect(periodContaining(schedule, 20250101)).toBeNull();
    expect(periodContaining(schedule, 20400101)).toBeNull();
  });

  it('lists what a buyer still receives', () => {
    expect(remainingPeriods(schedule, 20260115)).toHaveLength(20);
    expect(remainingPeriods(schedule, 20310115)).toHaveLength(10);
    expect(remainingPeriods(schedule, 20360115)).toHaveLength(0);
  });

  it('finds the surrounding coupon dates', () => {
    expect(nextCouponDate(schedule, 20260401)).toBe(20260715);
    expect(previousCouponDate(schedule, 20260401)).toBe(20260115);
    expect(previousCouponDate(schedule, 20270401)).toBe(20270115);
    expect(nextCouponDate(schedule, 20360115)).toBeNull();
  });
});
