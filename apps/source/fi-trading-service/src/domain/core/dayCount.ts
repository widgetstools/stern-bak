/**
 * Day-count conventions.
 *
 * Which one applies is a property of the instrument, not of the desk, and
 * getting it wrong is a quiet, systematic error in every accrued-interest and
 * yield number the instrument produces:
 *
 *   ACT/ACT (ISDA)  US Treasuries
 *   30/360 US       US corporates, munis, agencies
 *   ACT/360         money markets, floaters, CDS premium legs
 *   ACT/365F        some sovereigns, many analytics defaults
 *   30E/360         Eurobonds
 *   ACT/ACT (ICMA)  the accrual basis behind street-convention bond yields
 *
 * The fiddly one is 30/360 US, whose February rules only apply when the
 * instrument follows the end-of-month convention. `30E/360` has no February
 * special case at all, which is exactly why a Eurobond and a US corporate with
 * identical terms accrue differently across a February coupon.
 */

import {
  dayOf,
  daysInMonth,
  diffDays,
  isLeapYear,
  monthOf,
  toDateInt,
  yearOf,
  type DateInt,
} from './dateInt.js';

export type DayCountConvention =
  | 'ACT/ACT'
  | 'ACT/ACT-ICMA'
  | 'ACT/360'
  | 'ACT/365F'
  | '30/360'
  | '30E/360'
  | '30E/360-ISDA';

export interface PeriodContext {
  /** Start of the coupon period containing the accrual span. */
  periodStart: DateInt;
  /** End of that coupon period. */
  periodEnd: DateInt;
  /** Coupon frequency per year. */
  frequency: number;
  /** Whether the instrument follows the end-of-month convention. */
  endOfMonth?: boolean;
  /** True when `end` is the instrument's maturity (30E/360 ISDA cares). */
  isTerminal?: boolean;
}

function isLastDayOfFebruary(date: DateInt): boolean {
  return monthOf(date) === 2 && dayOf(date) === daysInMonth(yearOf(date), 2);
}

function isLastDayOfMonth(date: DateInt): boolean {
  return dayOf(date) === daysInMonth(yearOf(date), monthOf(date));
}

function thirty360(d1: DateInt, d2: DateInt, day1: number, day2: number): number {
  return (
    360 * (yearOf(d2) - yearOf(d1)) + 30 * (monthOf(d2) - monthOf(d1)) + (day2 - day1)
  );
}

/** 30/360 US, a.k.a. Bond Basis. The February rules need the EOM convention. */
export function days30360US(start: DateInt, end: DateInt, endOfMonth = true): number {
  let d1 = dayOf(start);
  let d2 = dayOf(end);
  if (endOfMonth && isLastDayOfFebruary(start) && isLastDayOfFebruary(end)) d2 = 30;
  if (endOfMonth && isLastDayOfFebruary(start)) d1 = 30;
  if (d2 === 31 && d1 >= 30) d2 = 30;
  if (d1 === 31) d1 = 30;
  return thirty360(start, end, d1, d2);
}

/** 30E/360, the Eurobond basis. No February special case. */
export function days30E360(start: DateInt, end: DateInt): number {
  const d1 = dayOf(start) === 31 ? 30 : dayOf(start);
  const d2 = dayOf(end) === 31 ? 30 : dayOf(end);
  return thirty360(start, end, d1, d2);
}

/** 30E/360 ISDA. Month ends become 30, except a February maturity. */
export function days30E360ISDA(start: DateInt, end: DateInt, isTerminal = false): number {
  const d1 = isLastDayOfMonth(start) ? 30 : dayOf(start);
  const endIsFebruaryMaturity = isTerminal && monthOf(end) === 2;
  const d2 = isLastDayOfMonth(end) && !endIsFebruaryMaturity ? 30 : dayOf(end);
  return thirty360(start, end, d1, d2);
}

/**
 * ACT/ACT (ISDA): each calendar year's share of the span is divided by that
 * year's own length, so a span crossing a leap year is not mis-weighted.
 */
export function yearFractionActActIsda(start: DateInt, end: DateInt): number {
  if (start === end) return 0;
  const y1 = yearOf(start);
  const y2 = yearOf(end);
  if (y1 === y2) return diffDays(start, end) / (isLeapYear(y1) ? 366 : 365);

  let total = 0;
  // Leading stub, up to the first year boundary.
  total += diffDays(start, toDateInt(y1 + 1, 1, 1)) / (isLeapYear(y1) ? 366 : 365);
  // Whole years in between contribute exactly 1 each.
  total += y2 - y1 - 1;
  // Trailing stub.
  total += diffDays(toDateInt(y2, 1, 1), end) / (isLeapYear(y2) ? 366 : 365);
  return total;
}

/**
 * ACT/ACT (ICMA): actual days over the actual length of the coupon period,
 * annualised by the frequency. This is the accrual basis the street-convention
 * bond yield is quoted against, so it needs the period it sits in.
 */
export function yearFractionActActIcma(
  start: DateInt,
  end: DateInt,
  context: PeriodContext,
): number {
  const periodDays = diffDays(context.periodStart, context.periodEnd);
  if (periodDays <= 0) return 0;
  return diffDays(start, end) / (periodDays * context.frequency);
}

/** Days in the accrual numerator for a convention. */
export function accrualDays(
  convention: DayCountConvention,
  start: DateInt,
  end: DateInt,
  context?: PeriodContext,
): number {
  switch (convention) {
    case '30/360':
      return days30360US(start, end, context?.endOfMonth ?? true);
    case '30E/360':
      return days30E360(start, end);
    case '30E/360-ISDA':
      return days30E360ISDA(start, end, context?.isTerminal ?? false);
    default:
      return diffDays(start, end);
  }
}

/** The year fraction a convention assigns to `[start, end)`. */
export function yearFraction(
  convention: DayCountConvention,
  start: DateInt,
  end: DateInt,
  context?: PeriodContext,
): number {
  switch (convention) {
    case 'ACT/ACT':
      return yearFractionActActIsda(start, end);
    case 'ACT/ACT-ICMA': {
      if (context === undefined) {
        throw new Error('ACT/ACT-ICMA needs the coupon period it sits in');
      }
      return yearFractionActActIcma(start, end, context);
    }
    case 'ACT/360':
      return diffDays(start, end) / 360;
    case 'ACT/365F':
      return diffDays(start, end) / 365;
    case '30/360':
      return days30360US(start, end, context?.endOfMonth ?? true) / 360;
    case '30E/360':
      return days30E360(start, end) / 360;
    case '30E/360-ISDA':
      return days30E360ISDA(start, end, context?.isTerminal ?? false) / 360;
  }
}

/** The conventional day count for each instrument family. */
export const CONVENTION_BY_INSTRUMENT = {
  treasury: 'ACT/ACT',
  treasuryBill: 'ACT/360',
  agency: '30/360',
  corporate: '30/360',
  municipal: '30/360',
  mbs: '30/360',
  abs: '30/360',
  cmbs: '30/360',
  floater: 'ACT/360',
  cdsPremium: 'ACT/360',
  eurobond: '30E/360',
} as const satisfies Record<string, DayCountConvention>;
