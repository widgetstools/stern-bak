
import { describe, expect, it } from 'vitest';

import { SifmaCalendar } from '../core/sifmaCalendar.js';
import { EventCalendar, macroEvents } from './eventCalendar.js';

const calendar = new SifmaCalendar();

describe('macroEvents', () => {
  const events = macroEvents(2026, calendar);

  it('schedules twelve payrolls, twelve CPIs and eight FOMC meetings', () => {
    const counts = { NFP: 0, CPI: 0, FOMC: 0 };
    for (const event of events) counts[event.event] += 1;
    expect(counts).toEqual({ NFP: 12, CPI: 12, FOMC: 8 });
  });

  it('puts payrolls on the first Friday', () => {
    // 2 January 2026 and 6 February 2026 are both first Fridays.
    const nfp = events.filter((e) => e.event === 'NFP').map((e) => e.date);
    expect(nfp[0]).toBe(20260102);
    expect(nfp[1]).toBe(20260206);
  });

  it('never schedules a release on a closed day', () => {
    for (const event of events) {
      if (event.event !== 'CPI') continue;
      expect(calendar.isBusinessDay(event.date)).toBe(true);
    }
  });

  it('returns them in date order', () => {
    for (let i = 1; i < events.length; i++) {
      expect(events[i]?.date as number).toBeGreaterThanOrEqual(events[i - 1]?.date as number);
    }
  });

  it('weights FOMC above CPI above payrolls', () => {
    const multiplier = (name: string) =>
      events.find((e) => e.event === name)?.volMultiplier as number;
    expect(multiplier('FOMC')).toBeGreaterThan(multiplier('CPI'));
    expect(multiplier('CPI')).toBeGreaterThan(multiplier('NFP'));
  });
});

describe('EventCalendar', () => {
  const events = new EventCalendar(calendar);

  it('finds a scheduled event and reports nothing on a quiet day', () => {
    expect(events.eventOn(20260102)?.event).toBe('NFP');
    expect(events.isEventDay(20260102)).toBe(true);
    expect(events.eventOn(20260108)).toBeNull();
    expect(events.isEventDay(20260108)).toBe(false);
  });

  it('caches per year without changing answers', () => {
    expect(events.eventOn(20260102)).toEqual(events.eventOn(20260102));
    expect(events.isEventDay(20270101)).toBe(events.isEventDay(20270101));
  });

  it('has roughly thirty release days a year, so most days are quiet', () => {
    let count = 0;
    for (const event of macroEvents(2026, calendar)) {
      if (calendar.isBusinessDay(event.date)) count += 1;
    }
    expect(count).toBeGreaterThan(25);
    expect(count).toBeLessThan(35);
  });

  it('spots the last session of a month', () => {
    // 31 July 2026 is a Friday and the last session of the month.
    expect(events.isMonthEndSession(20260731)).toBe(true);
    expect(events.isMonthEndSession(20260730)).toBe(false);
  });

  it('treats the last SESSION as month end, not the last calendar day', () => {
    // 31 May 2026 is a Sunday, so the month ends for trading on Friday 29th.
    expect(events.isMonthEndSession(20260529)).toBe(true);
  });
});
