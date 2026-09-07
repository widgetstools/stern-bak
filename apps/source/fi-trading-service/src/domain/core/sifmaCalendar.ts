/**
 * The US bond market calendar, as SIFMA recommends it.
 *
 * Generated from rules rather than shipped as a table, so it is correct for
 * any year the corpus covers without a maintenance burden.
 *
 * It is NOT the NYSE calendar, and the differences are exactly the sort of
 * thing that makes synthetic data look wrong to anyone who trades:
 *
 *  - **Columbus Day and Veterans Day** are bond-market holidays. The stock
 *    market trades through both.
 *  - **Good Friday** closes the bond market in most years (it is the only
 *    holiday here driven by a lunar calculation, hence `easterSunday`).
 *  - **Early closes** at 14:00 ET before Independence Day, after Thanksgiving
 *    and on Christmas Eve, with roughly a third of normal volume.
 *
 * Observance follows the usual US rule — a Saturday holiday is taken on the
 * preceding Friday, a Sunday holiday on the following Monday. That is why
 * Independence Day 2026 (a Saturday) is observed on Friday 3 July.
 *
 * SIFMA publishes recommendations, not rules, and occasionally departs from
 * the pattern for a specific year (a Good Friday coinciding with a major
 * release may become an early close instead of a full one). `overrides` is
 * where such a year goes, so the general rule stays clean.
 */

import {
  addDays,
  dayOfWeek,
  easterSunday,
  lastWeekdayOfMonth,
  nthWeekdayOfMonth,
  toDateInt,
  yearOf,
  type DateInt,
} from './dateInt.js';

const SATURDAY = 6;
const SUNDAY = 0;
const MONDAY = 1;
const THURSDAY = 4;

/** Minutes from midnight ET. */
export const NORMAL_CLOSE_MINUTES = 17 * 60;
export const EARLY_CLOSE_MINUTES = 14 * 60;

/** Juneteenth became a federal holiday in 2021 and was observed from 2022. */
const JUNETEENTH_FROM_YEAR = 2022;
/** MLK Day has been a market holiday since 1998. */
const MLK_FROM_YEAR = 1998;

/** Shift a fixed-date holiday onto the weekday the market actually observes. */
function observed(date: DateInt): DateInt {
  const dow = dayOfWeek(date);
  if (dow === SATURDAY) return addDays(date, -1);
  if (dow === SUNDAY) return addDays(date, 1);
  return date;
}

export interface SifmaOverrides {
  /** Dates to treat as full closes on top of the rules. */
  addHolidays?: readonly DateInt[];
  /** Dates the rules produce that a given year did not actually observe. */
  removeHolidays?: readonly DateInt[];
  /** Extra or amended early closes, as minutes from midnight ET. */
  earlyCloses?: ReadonlyMap<DateInt, number>;
}

/** Full-close dates for one calendar year. */
export function sifmaHolidays(year: number, overrides: SifmaOverrides = {}): Set<DateInt> {
  const holidays = new Set<DateInt>();
  const add = (date: DateInt): void => {
    holidays.add(date);
  };

  add(observed(toDateInt(year, 1, 1)));
  if (year >= MLK_FROM_YEAR) add(nthWeekdayOfMonth(year, 1, MONDAY, 3));
  add(nthWeekdayOfMonth(year, 2, MONDAY, 3));
  add(addDays(easterSunday(year), -2));
  add(lastWeekdayOfMonth(year, 5, MONDAY));
  if (year >= JUNETEENTH_FROM_YEAR) add(observed(toDateInt(year, 6, 19)));
  add(observed(toDateInt(year, 7, 4)));
  add(nthWeekdayOfMonth(year, 9, MONDAY, 1));
  add(nthWeekdayOfMonth(year, 10, MONDAY, 2));
  add(observed(toDateInt(year, 11, 11)));
  add(nthWeekdayOfMonth(year, 11, THURSDAY, 4));
  add(observed(toDateInt(year, 12, 25)));

  // A New Year's Day that lands on a Saturday is observed on 31 December of
  // the year before, so it belongs to THIS year's set, not next year's.
  const nextNewYear = observed(toDateInt(year + 1, 1, 1));
  if (yearOf(nextNewYear) === year) add(nextNewYear);

  for (const date of overrides.removeHolidays ?? []) holidays.delete(date);
  for (const date of overrides.addHolidays ?? []) holidays.add(date);
  return holidays;
}

/** Early-close dates for one calendar year, as minutes from midnight ET. */
export function sifmaEarlyCloses(
  year: number,
  overrides: SifmaOverrides = {},
): Map<DateInt, number> {
  const closes = new Map<DateInt, number>();
  const holidays = sifmaHolidays(year, overrides);

  /** Walk back to the last day the market is actually open. */
  const priorSession = (date: DateInt): DateInt => {
    let cursor = addDays(date, -1);
    while (dayOfWeek(cursor) === SATURDAY || dayOfWeek(cursor) === SUNDAY || holidays.has(cursor)) {
      cursor = addDays(cursor, -1);
    }
    return cursor;
  };

  closes.set(priorSession(observed(toDateInt(year, 7, 4))), EARLY_CLOSE_MINUTES);
  closes.set(addDays(nthWeekdayOfMonth(year, 11, THURSDAY, 4), 1), EARLY_CLOSE_MINUTES);
  const christmasEve = toDateInt(year, 12, 24);
  const eveDow = dayOfWeek(christmasEve);
  if (eveDow !== SATURDAY && eveDow !== SUNDAY && !holidays.has(christmasEve)) {
    closes.set(christmasEve, EARLY_CLOSE_MINUTES);
  }

  // An early close on a day the market is shut is meaningless.
  for (const date of [...closes.keys()]) {
    if (holidays.has(date)) closes.delete(date);
  }
  for (const [date, minutes] of overrides.earlyCloses ?? []) closes.set(date, minutes);
  return closes;
}

/** What a calendar has to answer for the rest of the domain. */
export interface Calendar {
  isHoliday(date: DateInt): boolean;
  isBusinessDay(date: DateInt): boolean;
  /** Minutes from midnight ET at which the session ends. */
  closeMinutes(date: DateInt): number;
}

/** The SIFMA calendar, with per-year rule evaluation cached. */
export class SifmaCalendar implements Calendar {
  private readonly holidayCache = new Map<number, Set<DateInt>>();
  private readonly earlyCache = new Map<number, Map<DateInt, number>>();

  constructor(private readonly overrides: SifmaOverrides = {}) {}

  private holidaysFor(year: number): Set<DateInt> {
    let cached = this.holidayCache.get(year);
    if (cached === undefined) {
      cached = sifmaHolidays(year, this.overrides);
      this.holidayCache.set(year, cached);
    }
    return cached;
  }

  private earlyClosesFor(year: number): Map<DateInt, number> {
    let cached = this.earlyCache.get(year);
    if (cached === undefined) {
      cached = sifmaEarlyCloses(year, this.overrides);
      this.earlyCache.set(year, cached);
    }
    return cached;
  }

  isHoliday(date: DateInt): boolean {
    return this.holidaysFor(yearOf(date)).has(date);
  }

  isWeekend(date: DateInt): boolean {
    const dow = dayOfWeek(date);
    return dow === SATURDAY || dow === SUNDAY;
  }

  isBusinessDay(date: DateInt): boolean {
    return !this.isWeekend(date) && !this.isHoliday(date);
  }

  isEarlyClose(date: DateInt): boolean {
    return this.earlyClosesFor(yearOf(date)).has(date);
  }

  closeMinutes(date: DateInt): number {
    return this.earlyClosesFor(yearOf(date)).get(date) ?? NORMAL_CLOSE_MINUTES;
  }
}

/**
 * Weekends only, no holidays.
 *
 * Useful as a contrast in tests — it makes the cost of ignoring the holiday
 * calendar visible, because settlement lands a day early around Thanksgiving.
 * The parameters are declared even though unused, so the class is callable
 * through the same shape as the real calendar.
 */
export class WeekendOnlyCalendar implements Calendar {
  isHoliday(_date: DateInt): boolean {
    return false;
  }

  isBusinessDay(date: DateInt): boolean {
    const dow = dayOfWeek(date);
    return dow !== SATURDAY && dow !== SUNDAY;
  }

  closeMinutes(_date: DateInt): number {
    return NORMAL_CLOSE_MINUTES;
  }
}
