/**
 * Dates as `YYYYMMDD` integers, with arithmetic done on a day serial.
 *
 * Two deliberate choices:
 *
 *  - **No `Date` objects.** Every bug I have seen in a settlement or accrual
 *    calculation traces back to a timezone or a DST boundary sneaking in
 *    through `Date`. A bond's maturity is a calendar date, not an instant, so
 *    it is modelled as one. The conversions below are Howard Hinnant's
 *    `days_from_civil` / `civil_from_days`, which are exact for the whole
 *    proleptic Gregorian range and involve no clock at all.
 *  - **`YYYYMMDD` as the stored form.** It is compact, sorts correctly as an
 *    integer, is readable in a debugger and in a Parquet column, and round
 *    trips to ISO text with no ambiguity.
 */

/** A calendar date encoded as `YYYYMMDD`, e.g. 2026-03-15 is 20260315. */
export type DateInt = number;

/** Days since 1970-01-01, the arithmetic form. */
export type DaySerial = number;

export function toDateInt(year: number, month: number, day: number): DateInt {
  return year * 10000 + month * 100 + day;
}

export function yearOf(date: DateInt): number {
  return Math.trunc(date / 10000);
}

export function monthOf(date: DateInt): number {
  return Math.trunc(date / 100) % 100;
}

export function dayOf(date: DateInt): number {
  return date % 100;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29;
  return MONTH_LENGTHS[month - 1] as number;
}

/** Days from 1970-01-01. Exact; no clock, no timezone. */
export function toSerial(date: DateInt): DaySerial {
  const d = dayOf(date);
  const m = monthOf(date);
  let y = yearOf(date);
  y -= m <= 2 ? 1 : 0;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Inverse of `toSerial`. */
export function fromSerial(serial: DaySerial): DateInt {
  const z = serial + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return toDateInt(y + (m <= 2 ? 1 : 0), m, d);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(date: DateInt): number {
  return (((toSerial(date) + 4) % 7) + 7) % 7;
}

export function addDays(date: DateInt, days: number): DateInt {
  return fromSerial(toSerial(date) + days);
}

export function diffDays(from: DateInt, to: DateInt): number {
  return toSerial(to) - toSerial(from);
}

export function endOfMonth(date: DateInt): DateInt {
  const y = yearOf(date);
  const m = monthOf(date);
  return toDateInt(y, m, daysInMonth(y, m));
}

export function isEndOfMonth(date: DateInt): boolean {
  return dayOf(date) === daysInMonth(yearOf(date), monthOf(date));
}

/**
 * Shift by whole months.
 *
 * `preserveEndOfMonth` is what schedule generation needs: a bond maturing on
 * 31 August rolls to 30 November, not to 1 December, and — the case that
 * catches people — 28 February in a non-leap year rolls to 31 August rather
 * than to the 28th, because the date was the month end to begin with.
 */
export function addMonths(date: DateInt, months: number, preserveEndOfMonth = false): DateInt {
  const y = yearOf(date);
  const m = monthOf(date);
  const d = dayOf(date);
  const total = y * 12 + (m - 1) + months;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  if (preserveEndOfMonth && isEndOfMonth(date)) {
    return toDateInt(ty, tm, daysInMonth(ty, tm));
  }
  return toDateInt(ty, tm, Math.min(d, daysInMonth(ty, tm)));
}

export function addYears(date: DateInt, years: number, preserveEndOfMonth = false): DateInt {
  return addMonths(date, years * 12, preserveEndOfMonth);
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parse `YYYY-MM-DD`. Returns null rather than a wrong date. */
export function parseIsoDate(text: string): DateInt | null {
  const m = ISO_DATE.exec(text);
  if (m === null) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return toDateInt(year, month, day);
}

export function formatIso(date: DateInt): string {
  const y = String(yearOf(date)).padStart(4, '0');
  const m = String(monthOf(date)).padStart(2, '0');
  const d = String(dayOf(date)).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** True when the encoding names a real calendar date. */
export function isValidDateInt(date: DateInt): boolean {
  if (!Number.isInteger(date) || date < 10000101) return false;
  const m = monthOf(date);
  const d = dayOf(date);
  if (m < 1 || m > 12) return false;
  return d >= 1 && d <= daysInMonth(yearOf(date), m);
}

/** Nth occurrence of a weekday in a month, e.g. the 3rd Monday of January. */
export function nthWeekdayOfMonth(
  year: number,
  month: number,
  weekday: number,
  n: number,
): DateInt {
  const first = toDateInt(year, month, 1);
  const shift = (weekday - dayOfWeek(first) + 7) % 7;
  return addDays(first, shift + (n - 1) * 7);
}

/** Last occurrence of a weekday in a month, e.g. the last Monday of May. */
export function lastWeekdayOfMonth(year: number, month: number, weekday: number): DateInt {
  const last = endOfMonth(toDateInt(year, month, 1));
  const back = (dayOfWeek(last) - weekday + 7) % 7;
  return addDays(last, -back);
}

/**
 * Easter Sunday, by the anonymous Gregorian algorithm (Meeus/Jones/Butcher).
 * Needed because Good Friday is a bond-market holiday and is the only one
 * that is not a fixed date or an nth-weekday rule.
 */
export function easterSunday(year: number): DateInt {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toDateInt(year, month, day);
}
