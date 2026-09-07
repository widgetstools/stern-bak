/**
 * Accrued interest.
 *
 * The shape that matters is a sawtooth: interest builds linearly through a
 * period and resets hard to zero on the coupon date. A generator that lets
 * accrued drift smoothly across a payment is immediately wrong to anyone who
 * looks at a position over a coupon date.
 *
 * Mortgages accrue differently from bonds and it is not a detail: a
 * pass-through accrues 30/360 from the FIRST of the month on the current
 * factor, not from the last payment date. CDS premium accrues ACT/360 from
 * the previous IMM date, and the protection buyer is credited with the
 * accrued at inception, which is why a standard contract has a full first
 * coupon.
 */

import { dayOf, daysInMonth, monthOf, yearOf, type DateInt } from '../core/dateInt.js';
import { yearFraction, type DayCountConvention } from '../core/dayCount.js';
import { periodContaining, type Period } from './schedule.js';

export interface AccrualInput {
  schedule: readonly Period[];
  /** Annual coupon rate in percent. */
  couponRate: number;
  frequency: number;
  dayCount: DayCountConvention;
  endOfMonth?: boolean;
  /** Face value the accrual is quoted against. Defaults to 100. */
  face?: number;
}

/** Accrued interest at settlement, in the same units as `face`. */
export function accruedInterest(input: AccrualInput, settle: DateInt): number {
  const period = periodContaining(input.schedule, settle);
  if (period === null) return 0;
  const face = input.face ?? 100;
  const fraction = yearFraction(input.dayCount, period.accrualStart, settle, {
    periodStart: period.accrualStart,
    periodEnd: period.accrualEnd,
    frequency: input.frequency,
    endOfMonth: input.endOfMonth ?? true,
  });
  return (input.couponRate / 100) * fraction * face;
}

/** How far through its coupon period settlement sits, from 0 to 1. */
export function accrualFraction(input: AccrualInput, settle: DateInt): number {
  const period = periodContaining(input.schedule, settle);
  if (period === null) return 0;
  const context = {
    periodStart: period.accrualStart,
    periodEnd: period.accrualEnd,
    frequency: input.frequency,
    endOfMonth: input.endOfMonth ?? true,
  };
  const whole = yearFraction(input.dayCount, period.accrualStart, period.accrualEnd, context);
  if (whole <= 0) return 0;
  return yearFraction(input.dayCount, period.accrualStart, settle, context) / whole;
}

/**
 * Mortgage accrued interest.
 *
 * Always 30/360 from the first of the month, on the current face — not from
 * the last payment date. A pool settling on the 15th has exactly half a
 * month's interest accrued regardless of when it last paid.
 */
export function mbsAccrued(couponRate: number, currentFace: number, settle: DateInt): number {
  const day = Math.min(dayOf(settle), 30);
  return (couponRate / 100 / 12) * currentFace * ((day - 1) / 30);
}

/** Days from the previous IMM roll to settlement, on ACT/360. */
export function cdsAccrued(
  couponBp: number,
  notional: number,
  previousImm: DateInt,
  settle: DateInt,
): number {
  const days = yearFraction('ACT/360', previousImm, settle);
  return (couponBp / 10000) * notional * days;
}

/**
 * True when settlement is a coupon date, so accrued has just reset.
 *
 * Worth asserting on: a position that shows a full period of accrued on its
 * payment date has an off-by-one in its period lookup.
 */
export function isCouponDate(schedule: readonly Period[], settle: DateInt): boolean {
  return schedule.some((period) => period.accrualEnd === settle);
}

/** The last day of the month `date` falls in — used by mortgage accrual. */
export function monthEndOf(date: DateInt): DateInt {
  const year = yearOf(date);
  const month = monthOf(date);
  return year * 10000 + month * 100 + daysInMonth(year, month);
}
