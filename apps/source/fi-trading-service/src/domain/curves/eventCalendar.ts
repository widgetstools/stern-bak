/**
 * The scheduled releases that move rates.
 *
 * Two things depend on this. The factor model adds a jump component on these
 * days, which is what gives daily rate changes fat tails — a purely Gaussian
 * factor produces kurtosis of 3, and real 10-year yield changes run above 4.
 * And trade arrival spikes around them, which is what makes the intraday
 * volume profile look like a market rather than a sine wave.
 *
 * Dates are rule-based approximations of the real schedules: NFP on the first
 * Friday, CPI mid-month, and eight FOMC meetings a year. The exact days move
 * a little year to year; what matters for realism is that there are roughly
 * thirty of them, they cluster the way releases do, and they are the same on
 * every run.
 */

import { addDays, monthOf, nthWeekdayOfMonth, toDateInt, type DateInt } from '../core/dateInt.js';
import { rollForward } from '../core/businessDays.js';
import type { Calendar } from '../core/sifmaCalendar.js';

export type MacroEvent = 'NFP' | 'CPI' | 'FOMC';

const FRIDAY = 5;
const WEDNESDAY = 3;

/** The eight months the FOMC meets in. */
const FOMC_MONTHS = [1, 3, 5, 6, 7, 9, 11, 12] as const;

export interface ScheduledEvent {
  date: DateInt;
  event: MacroEvent;
  /** Multiplier applied to factor volatility and to trade arrival. */
  volMultiplier: number;
}

const VOL_MULTIPLIER: Record<MacroEvent, number> = {
  NFP: 4.5,
  CPI: 5.0,
  FOMC: 6.0,
};

/** Every scheduled release in a year, ascending. */
export function macroEvents(year: number, calendar: Calendar): ScheduledEvent[] {
  const events: ScheduledEvent[] = [];
  for (let month = 1; month <= 12; month++) {
    events.push({
      date: nthWeekdayOfMonth(year, month, FRIDAY, 1),
      event: 'NFP',
      volMultiplier: VOL_MULTIPLIER.NFP,
    });
    // CPI prints mid-month; roll onto a session so it never lands on a holiday.
    events.push({
      date: rollForward(calendar, toDateInt(year, month, 13)),
      event: 'CPI',
      volMultiplier: VOL_MULTIPLIER.CPI,
    });
  }
  for (const month of FOMC_MONTHS) {
    events.push({
      date: nthWeekdayOfMonth(year, month, WEDNESDAY, 3),
      event: 'FOMC',
      volMultiplier: VOL_MULTIPLIER.FOMC,
    });
  }
  return events.sort((a, b) => a.date - b.date);
}

/** Index of scheduled events, so a day lookup is O(1) during the build. */
export class EventCalendar {
  private readonly cache = new Map<number, Map<DateInt, ScheduledEvent>>();

  constructor(private readonly calendar: Calendar) {}

  private forYear(year: number): Map<DateInt, ScheduledEvent> {
    let cached = this.cache.get(year);
    if (cached === undefined) {
      cached = new Map(macroEvents(year, this.calendar).map((e) => [e.date, e]));
      this.cache.set(year, cached);
    }
    return cached;
  }

  eventOn(date: DateInt): ScheduledEvent | null {
    const year = Math.trunc(date / 10000);
    return this.forYear(year).get(date) ?? null;
  }

  isEventDay(date: DateInt): boolean {
    return this.eventOn(date) !== null;
  }

  /** Month-end is a rebalance day: index changes, marking, forced flow. */
  isMonthEndSession(date: DateInt): boolean {
    let cursor = addDays(date, 1);
    while (!this.calendar.isBusinessDay(cursor)) cursor = addDays(cursor, 1);
    return monthOf(cursor) !== monthOf(date);
  }
}
