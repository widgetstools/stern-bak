/**
 * Coupon schedule construction.
 *
 * Generated BACKWARDS from maturity, which is the market convention and the
 * reason a bond maturing on the 15th pays on the 15th however odd its dated
 * date is. Any stub therefore lands at the front, where the market puts it.
 *
 * The distinction this module exists to preserve: **accrual dates are
 * unadjusted, payment dates are adjusted.** A US corporate accrues on nominal
 * 30/360 dates and pays on the following business day. Adjusting the accrual
 * dates too — the natural-looking simplification — shifts every accrued
 * interest number by a day or two around weekends. It is small, systematic,
 * and immediately visible against a real quote.
 *
 * `paymentDelayDays` is separate again, and it is money rather than
 * cosmetics: a UMBS pass-through accrues in a month and pays on the 25th of
 * the next, a 24-day delay worth roughly a quarter of a point on a 5.5%
 * coupon. Generic generators ignore it, so every mortgage they produce is a
 * quarter-point rich.
 */

import { adjust, type BusinessDayConvention } from '../core/businessDays.js';
import { addDays, addMonths, type DateInt } from '../core/dateInt.js';
import type { Calendar } from '../core/sifmaCalendar.js';

export type CouponFrequency = 1 | 2 | 4 | 12;

export interface ScheduleSpec {
  /** Dated date — when interest starts accruing. */
  effective: DateInt;
  maturity: DateInt;
  frequency: CouponFrequency;
  /** Roll to the month end when the maturity is a month end. */
  endOfMonth?: boolean;
  /** Applied to payment dates only. */
  businessDayConvention?: BusinessDayConvention;
  /** Calendar days between accrual end and payment. Zero for most bonds. */
  paymentDelayDays?: number;
  calendar: Calendar;
}

export interface Period {
  index: number;
  /** Unadjusted. */
  accrualStart: DateInt;
  /** Unadjusted. */
  accrualEnd: DateInt;
  /** Adjusted, and shifted by any payment delay. */
  paymentDate: DateInt;
  /** True for a front stub shorter than a regular period. */
  isStub: boolean;
}

/** Months between coupons. */
export function periodMonths(frequency: CouponFrequency): number {
  return 12 / frequency;
}

export function buildSchedule(spec: ScheduleSpec): Period[] {
  if (spec.maturity <= spec.effective) {
    throw new Error(`Maturity ${spec.maturity} must follow the dated date ${spec.effective}`);
  }
  const months = periodMonths(spec.frequency);
  const endOfMonth = spec.endOfMonth ?? false;
  const convention = spec.businessDayConvention ?? 'Following';
  const delay = spec.paymentDelayDays ?? 0;

  // Walk back from maturity until we pass the dated date.
  const boundaries: DateInt[] = [spec.maturity];
  let cursor = spec.maturity;
  for (;;) {
    const previous = addMonths(cursor, -months, endOfMonth);
    if (previous <= spec.effective) break;
    boundaries.unshift(previous);
    cursor = previous;
  }
  boundaries.unshift(spec.effective);

  const periods: Period[] = [];
  for (let i = 1; i < boundaries.length; i++) {
    const accrualStart = boundaries[i - 1] as DateInt;
    const accrualEnd = boundaries[i] as DateInt;
    // A front stub is any first period shorter than a regular one.
    const isStub =
      i === 1 && boundaries.length > 2 && addMonths(accrualEnd, -months, endOfMonth) !== accrualStart;
    periods.push({
      index: i - 1,
      accrualStart,
      accrualEnd,
      paymentDate: adjust(spec.calendar, addDays(accrualEnd, delay), convention),
      isStub,
    });
  }
  return periods;
}

/** The period containing `settle`, or null when settle is outside the schedule. */
export function periodContaining(schedule: readonly Period[], settle: DateInt): Period | null {
  for (const period of schedule) {
    if (settle >= period.accrualStart && settle < period.accrualEnd) return period;
  }
  return null;
}

/** Periods whose payment falls strictly after settlement — what a buyer gets. */
export function remainingPeriods(schedule: readonly Period[], settle: DateInt): Period[] {
  return schedule.filter((period) => period.accrualEnd > settle);
}

/** The next coupon date on or after settlement. */
export function nextCouponDate(schedule: readonly Period[], settle: DateInt): DateInt | null {
  for (const period of schedule) {
    if (period.accrualEnd > settle) return period.accrualEnd;
  }
  return null;
}

/** The most recent coupon date on or before settlement. */
export function previousCouponDate(schedule: readonly Period[], settle: DateInt): DateInt | null {
  let previous: DateInt | null = null;
  for (const period of schedule) {
    if (period.accrualEnd > settle) return previous ?? period.accrualStart;
    previous = period.accrualEnd;
  }
  return previous;
}

/**
 * Payment delay by product, in calendar days after the accrual month.
 *
 * These are real settlement mechanics, and each one costs the holder money
 * relative to a same-coupon bond paying on time.
 */
export const PAYMENT_DELAY_DAYS = {
  bond: 0,
  umbs30: 24,
  umbs15: 24,
  ginnie1: 14,
  ginnie2: 19,
  cmbsConduit: 12,
  absAuto: 14,
  absCard: 19,
} as const;
