/**
 * Business-day arithmetic and the roll conventions.
 *
 * The distinction that matters downstream: US corporates and munis accrue
 * interest on UNADJUSTED nominal dates under 30/360 but PAY on the adjusted
 * date. Conflating the two shifts every coupon's accrued interest by a day or
 * two around weekends, which is small, systematic, and very visible to anyone
 * checking a number against a real quote. Schedule generation therefore keeps
 * accrual and payment dates separately, and this module supplies both.
 */

import { addDays, monthOf, type DateInt } from './dateInt.js';
import type { Calendar } from './sifmaCalendar.js';

export type BusinessDayConvention =
  /** Leave the date alone. Accrual dates usually want this. */
  | 'Unadjusted'
  /** Roll forward to the next business day. */
  | 'Following'
  /** Roll forward, unless that leaves the month — then roll back. */
  | 'ModifiedFollowing'
  /** Roll back to the previous business day. */
  | 'Preceding'
  /** Roll back, unless that leaves the month — then roll forward. */
  | 'ModifiedPreceding';

export function nextBusinessDay(calendar: Calendar, date: DateInt): DateInt {
  let cursor = addDays(date, 1);
  while (!calendar.isBusinessDay(cursor)) cursor = addDays(cursor, 1);
  return cursor;
}

export function previousBusinessDay(calendar: Calendar, date: DateInt): DateInt {
  let cursor = addDays(date, -1);
  while (!calendar.isBusinessDay(cursor)) cursor = addDays(cursor, -1);
  return cursor;
}

/** The date itself if it is a business day, else the next one. */
export function rollForward(calendar: Calendar, date: DateInt): DateInt {
  let cursor = date;
  while (!calendar.isBusinessDay(cursor)) cursor = addDays(cursor, 1);
  return cursor;
}

/** The date itself if it is a business day, else the previous one. */
export function rollBackward(calendar: Calendar, date: DateInt): DateInt {
  let cursor = date;
  while (!calendar.isBusinessDay(cursor)) cursor = addDays(cursor, -1);
  return cursor;
}

/** Apply a roll convention. */
export function adjust(
  calendar: Calendar,
  date: DateInt,
  convention: BusinessDayConvention,
): DateInt {
  switch (convention) {
    case 'Unadjusted':
      return date;
    case 'Following':
      return rollForward(calendar, date);
    case 'Preceding':
      return rollBackward(calendar, date);
    case 'ModifiedFollowing': {
      const forward = rollForward(calendar, date);
      return monthOf(forward) === monthOf(date) ? forward : rollBackward(calendar, date);
    }
    case 'ModifiedPreceding': {
      const backward = rollBackward(calendar, date);
      return monthOf(backward) === monthOf(date) ? backward : rollForward(calendar, date);
    }
  }
}

/**
 * Move `count` business days. Negative counts go backwards; zero rolls the
 * date onto a business day rather than returning a holiday untouched, which
 * is what settlement arithmetic (`T+1` from a Friday trade) expects.
 */
export function addBusinessDays(calendar: Calendar, date: DateInt, count: number): DateInt {
  if (count === 0) return rollForward(calendar, date);
  const step = count > 0 ? 1 : -1;
  let remaining = Math.abs(count);
  let cursor = date;
  while (remaining > 0) {
    cursor = addDays(cursor, step);
    if (calendar.isBusinessDay(cursor)) remaining -= 1;
  }
  return cursor;
}

/** Business days in the half-open span. Negative when `to` precedes `from`. */
export function businessDaysBetween(calendar: Calendar, from: DateInt, to: DateInt): number {
  if (from === to) return 0;
  const lo = from < to ? from : to;
  const hi = from < to ? to : from;
  let count = 0;
  for (let cursor = lo; cursor !== hi; cursor = addDays(cursor, 1)) {
    if (calendar.isBusinessDay(cursor)) count += 1;
  }
  return from < to ? count : -count;
}

/** Every business day in `[from, to]`, ascending. The corpus's day loop. */
export function businessDaysInRange(
  calendar: Calendar,
  from: DateInt,
  to: DateInt,
): DateInt[] {
  const out: DateInt[] = [];
  let cursor = from;
  while (cursor <= to) {
    if (calendar.isBusinessDay(cursor)) out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

/**
 * Settlement date for a `T+n` convention.
 *
 * US equities, corporates and munis moved to T+1 on 28 May 2024; Treasuries
 * and agencies were already there. CDS upfront settles T+3.
 */
export function settlementDate(calendar: Calendar, tradeDate: DateInt, plusDays: number): DateInt {
  return addBusinessDays(calendar, tradeDate, plusDays);
}
