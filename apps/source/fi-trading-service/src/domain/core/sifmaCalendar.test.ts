
import { describe, expect, it } from 'vitest';

import { businessDaysInRange } from './businessDays.js';
import {
  EARLY_CLOSE_MINUTES, NORMAL_CLOSE_MINUTES, SifmaCalendar, WeekendOnlyCalendar,
  sifmaEarlyCloses, sifmaHolidays,
} from './sifmaCalendar.js';

describe('sifmaHolidays', () => {
  it('produces the 2026 bond-market calendar exactly', () => {
    // Derived independently from the published rules, not from this code:
    // New Year Thu 1 Jan; MLK 3rd Mon; Presidents 3rd Mon; Good Friday (Easter
    // 5 Apr); Memorial last Mon; Juneteenth Fri; Independence observed Fri 3
    // Jul because 4 Jul 2026 is a Saturday; Labor 1st Mon; Columbus 2nd Mon;
    // Veterans Wed; Thanksgiving 4th Thu; Christmas Fri.
    expect([...sifmaHolidays(2026)].sort((a, b) => a - b)).toEqual([
      20260101, 20260119, 20260216, 20260403, 20260525, 20260619,
      20260703, 20260907, 20261012, 20261111, 20261126, 20261225,
    ]);
  });

  it('observes a Saturday holiday on the preceding Friday', () => {
    // 4 July 2026 is a Saturday.
    expect(sifmaHolidays(2026).has(20260703)).toBe(true);
    expect(sifmaHolidays(2026).has(20260704)).toBe(false);
  });

  it('observes a Sunday holiday on the following Monday', () => {
    // 4 July 2027 is a Sunday.
    expect(sifmaHolidays(2027).has(20270705)).toBe(true);
  });

  it('keeps a New Year that rolls back into December in the earlier year', () => {
    // 1 January 2022 was a Saturday, so the market observed Friday 31 Dec 2021.
    expect(sifmaHolidays(2021).has(20211231)).toBe(true);
    expect(sifmaHolidays(2022).has(20220101)).toBe(false);
  });

  it('closes for Columbus Day and Veterans Day, unlike the stock market', () => {
    const holidays = sifmaHolidays(2026);
    expect(holidays.has(20261012)).toBe(true);
    expect(holidays.has(20261111)).toBe(true);
  });

  it('closes for Good Friday, the one lunar-dated holiday', () => {
    expect(sifmaHolidays(2026).has(20260403)).toBe(true);
    expect(sifmaHolidays(2025).has(20250418)).toBe(true);
  });

  it('omits Juneteenth before it was observed and MLK before 1998', () => {
    expect(sifmaHolidays(2021).has(20210618)).toBe(false);
    expect(sifmaHolidays(2022).has(20220620)).toBe(true);
    expect([...sifmaHolidays(1997)].some((d) => d >= 19970101 && d <= 19970131)).toBe(true);
    expect(sifmaHolidays(1997).has(19970120)).toBe(false);
  });

  it('applies overrides for a year that departed from the rules', () => {
    const overrides = { removeHolidays: [20260403], addHolidays: [20260406] };
    const holidays = sifmaHolidays(2026, overrides);
    expect(holidays.has(20260403)).toBe(false);
    expect(holidays.has(20260406)).toBe(true);
  });
});

describe('sifmaEarlyCloses', () => {
  it('closes early before Independence Day, after Thanksgiving and on Christmas Eve', () => {
    const closes = sifmaEarlyCloses(2026);
    expect(closes.get(20261127)).toBe(EARLY_CLOSE_MINUTES); // day after Thanksgiving
    expect(closes.get(20261224)).toBe(EARLY_CLOSE_MINUTES); // Christmas Eve
    // 3 July is itself a holiday in 2026, so the early close moves to 2 July.
    expect(closes.get(20260702)).toBe(EARLY_CLOSE_MINUTES);
  });

  it('never marks a full holiday as an early close', () => {
    const holidays = sifmaHolidays(2026);
    for (const date of sifmaEarlyCloses(2026).keys()) {
      expect(holidays.has(date)).toBe(false);
    }
  });

  it('makes Christmas Eve a FULL close when it is the observed holiday', () => {
    // 25 December 2027 is a Saturday, so Christmas is observed on Friday the
    // 24th. That is a full close, not a 14:00 one.
    expect(sifmaHolidays(2027).has(20271224)).toBe(true);
    expect(sifmaEarlyCloses(2027).has(20271224)).toBe(false);
  });

  it('skips Christmas Eve when it falls at a weekend', () => {
    // 24 December 2028 is a Sunday.
    expect(sifmaEarlyCloses(2028).has(20281224)).toBe(false);
  });
});

describe('SifmaCalendar', () => {
  const calendar = new SifmaCalendar();

  it('classifies weekends, holidays and business days', () => {
    expect(calendar.isBusinessDay(20260316)).toBe(true); // Monday
    expect(calendar.isBusinessDay(20260314)).toBe(false); // Saturday
    expect(calendar.isBusinessDay(20260315)).toBe(false); // Sunday
    expect(calendar.isBusinessDay(20261126)).toBe(false); // Thanksgiving
    expect(calendar.isHoliday(20261126)).toBe(true);
    expect(calendar.isWeekend(20260314)).toBe(true);
  });

  it('reports session close times', () => {
    expect(calendar.closeMinutes(20260316)).toBe(NORMAL_CLOSE_MINUTES);
    expect(calendar.closeMinutes(20261224)).toBe(EARLY_CLOSE_MINUTES);
    expect(calendar.isEarlyClose(20261224)).toBe(true);
    expect(calendar.isEarlyClose(20260316)).toBe(false);
  });

  it('caches per year without changing answers', () => {
    expect(calendar.isHoliday(20261126)).toBe(calendar.isHoliday(20261126));
    expect(calendar.closeMinutes(20261224)).toBe(calendar.closeMinutes(20261224));
  });

  it('yields exactly 249 business days in 2026', () => {
    // 365 days, less 104 weekend days, less the 12 holidays above (all of
    // which fall on weekdays in 2026). Counted independently.
    expect(businessDaysInRange(calendar, 20260101, 20261231)).toHaveLength(249);
  });
});

describe('WeekendOnlyCalendar', () => {
  it('skips weekends but honours no holidays', () => {
    const calendar = new WeekendOnlyCalendar();
    expect(calendar.isBusinessDay(20261126)).toBe(true);
    expect(calendar.isBusinessDay(20260314)).toBe(false);
    expect(calendar.isHoliday(20261126)).toBe(false);
    expect(calendar.closeMinutes(20261126)).toBe(NORMAL_CLOSE_MINUTES);
  });
});
