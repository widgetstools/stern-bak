
import { describe, expect, it } from 'vitest';

import {
  addDays, addMonths, addYears, dayOf, dayOfWeek, daysInMonth, diffDays, easterSunday,
  endOfMonth, formatIso, fromSerial, isEndOfMonth, isLeapYear, isValidDateInt,
  lastWeekdayOfMonth, monthOf, nthWeekdayOfMonth, parseIsoDate, toDateInt, toSerial, yearOf,
} from './dateInt.js';

describe('encoding', () => {
  it('splits and joins YYYYMMDD', () => {
    const d = toDateInt(2026, 3, 15);
    expect(d).toBe(20260315);
    expect([yearOf(d), monthOf(d), dayOf(d)]).toEqual([2026, 3, 15]);
  });

  it('sorts chronologically as an integer, which is why this encoding was chosen', () => {
    const dates = [toDateInt(2026, 12, 1), toDateInt(2026, 2, 28), toDateInt(2025, 12, 31)];
    expect([...dates].sort((a, b) => a - b)).toEqual([20251231, 20260228, 20261201]);
  });

  it('round-trips ISO text and rejects impossible dates', () => {
    expect(parseIsoDate('2026-03-15')).toBe(20260315);
    expect(formatIso(20260315)).toBe('2026-03-15');
    expect(formatIso(parseIsoDate('2024-02-29') as number)).toBe('2024-02-29');
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(parseIsoDate('2026-13-01')).toBeNull();
    expect(parseIsoDate('20260315')).toBeNull();
  });

  it('validates', () => {
    expect(isValidDateInt(20260315)).toBe(true);
    expect(isValidDateInt(20260230)).toBe(false);
    expect(isValidDateInt(20240229)).toBe(true);
    expect(isValidDateInt(20260015)).toBe(false);
    expect(isValidDateInt(1.5)).toBe(false);
  });
});

describe('serial arithmetic', () => {
  it('anchors on the unix epoch', () => {
    expect(toSerial(19700101)).toBe(0);
    expect(fromSerial(0)).toBe(19700101);
  });

  it('round-trips across four centuries, leap rules included', () => {
    for (const date of [16000229, 19000228, 20000229, 20240229, 21000228, 25001231]) {
      expect(fromSerial(toSerial(date))).toBe(date);
    }
  });

  it('knows the day of week', () => {
    expect(dayOfWeek(19700101)).toBe(4); // Thursday
    expect(dayOfWeek(20260315)).toBe(0); // Sunday
    expect(dayOfWeek(20260704)).toBe(6); // Saturday - why July 4 2026 rolls back
  });

  it('adds days across month, year and leap boundaries', () => {
    expect(addDays(20260228, 1)).toBe(20260301);
    expect(addDays(20240228, 1)).toBe(20240229);
    expect(addDays(20261231, 1)).toBe(20270101);
    expect(addDays(20270101, -1)).toBe(20261231);
  });

  it('measures spans', () => {
    expect(diffDays(20260101, 20260201)).toBe(31);
    expect(diffDays(20260201, 20260101)).toBe(-31);
    expect(diffDays(20240101, 20250101)).toBe(366);
  });
});

describe('month ends', () => {
  it('knows leap years and month lengths', () => {
    expect([2024, 2000, 2400].map(isLeapYear)).toEqual([true, true, true]);
    expect([2026, 1900, 2100].map(isLeapYear)).toEqual([false, false, false]);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  it('finds and recognises month ends', () => {
    expect(endOfMonth(20260215)).toBe(20260228);
    expect(endOfMonth(20240201)).toBe(20240229);
    expect(isEndOfMonth(20260228)).toBe(true);
    expect(isEndOfMonth(20260227)).toBe(false);
  });

  it('clamps a day that does not exist in the target month', () => {
    expect(addMonths(20260131, 1)).toBe(20260228);
    expect(addMonths(20260131, 3)).toBe(20260430);
  });

  it('preserves the month end when asked, which is what schedules need', () => {
    // Without the flag a February 28 start would roll to the 28th; with it,
    // the bond keeps paying on the last day of the month.
    expect(addMonths(20260228, 6, false)).toBe(20260828);
    expect(addMonths(20260228, 6, true)).toBe(20260831);
    expect(addMonths(20260831, 3, true)).toBe(20261130);
  });

  it('adds years', () => {
    expect(addYears(20260315, 2)).toBe(20280315);
    expect(addYears(20240229, 1)).toBe(20250228);
  });
});

describe('weekday rules', () => {
  it('finds the nth weekday of a month', () => {
    expect(nthWeekdayOfMonth(2026, 1, 1, 3)).toBe(20260119); // 3rd Monday, MLK
    expect(nthWeekdayOfMonth(2026, 11, 4, 4)).toBe(20261126); // 4th Thursday
  });

  it('finds the last weekday of a month', () => {
    expect(lastWeekdayOfMonth(2026, 5, 1)).toBe(20260525); // Memorial Day
  });
});

describe('easterSunday', () => {
  it('matches published dates', () => {
    expect(easterSunday(2026)).toBe(20260405);
    expect(easterSunday(2025)).toBe(20250420);
    expect(easterSunday(2024)).toBe(20240331);
    expect(easterSunday(2038)).toBe(20380425);
  });

  it('always lands on a Sunday, over a long run', () => {
    for (let year = 1990; year <= 2100; year++) {
      expect(dayOfWeek(easterSunday(year))).toBe(0);
    }
  });
});
