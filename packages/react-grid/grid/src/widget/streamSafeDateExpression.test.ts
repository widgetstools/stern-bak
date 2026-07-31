import { describe, expect, it } from 'vitest';
import { parseDateExpression } from './streamSafeDateFloatingFilter';

// Fixed reference instant for deterministic trailing-window math:
// Saturday 20 June 2026, 14:30:00 local time.
const NOW = new Date(2026, 5, 20, 14, 30, 0);

describe('parseDateExpression — relative trailing windows', () => {
  it('parses "last 10 minutes" as inRange [now-10m, now]', () => {
    expect(parseDateExpression('last 10 minutes', 'us', NOW)).toEqual({
      filterType: 'date',
      type: 'inRange',
      dateFrom: '2026-06-20 14:20:00',
      dateTo: '2026-06-20 14:30:00',
    });
  });

  it('parses "last 5 seconds"', () => {
    expect(parseDateExpression('last 5 seconds', 'us', NOW)).toEqual({
      filterType: 'date',
      type: 'inRange',
      dateFrom: '2026-06-20 14:29:55',
      dateTo: '2026-06-20 14:30:00',
    });
  });

  it('parses "last 3 hours"', () => {
    expect(parseDateExpression('last 3 hours', 'us', NOW)).toEqual({
      filterType: 'date',
      type: 'inRange',
      dateFrom: '2026-06-20 11:30:00',
      dateTo: '2026-06-20 14:30:00',
    });
  });

  it('parses "last 7 days"', () => {
    expect(parseDateExpression('last 7 days', 'us', NOW)).toEqual({
      filterType: 'date',
      type: 'inRange',
      dateFrom: '2026-06-13 14:30:00',
      dateTo: '2026-06-20 14:30:00',
    });
  });

  it('parses "last 2 weeks"', () => {
    expect(parseDateExpression('last 2 weeks', 'us', NOW)).toEqual({
      filterType: 'date',
      type: 'inRange',
      dateFrom: '2026-06-06 14:30:00',
      dateTo: '2026-06-20 14:30:00',
    });
  });

  it('parses "last 6 months" (digit)', () => {
    expect(parseDateExpression('last 6 months', 'us', NOW)).toEqual({
      filterType: 'date',
      type: 'inRange',
      dateFrom: '2025-12-20 14:30:00',
      dateTo: '2026-06-20 14:30:00',
    });
  });

  it('parses "last six months" (word)', () => {
    expect(parseDateExpression('last six months', 'us', NOW)).toEqual(
      parseDateExpression('last 6 months', 'us', NOW),
    );
  });

  it('parses "last year" (count defaults to 1)', () => {
    expect(parseDateExpression('last year', 'us', NOW)).toEqual({
      filterType: 'date',
      type: 'inRange',
      dateFrom: '2025-06-20 14:30:00',
      dateTo: '2026-06-20 14:30:00',
    });
  });

  it('parses "last month" (singular = last 1)', () => {
    expect(parseDateExpression('last month', 'us', NOW)).toEqual({
      filterType: 'date',
      type: 'inRange',
      dateFrom: '2026-05-20 14:30:00',
      dateTo: '2026-06-20 14:30:00',
    });
  });

  it('parses worded count "last ten days"', () => {
    expect(parseDateExpression('last ten days', 'us', NOW)).toEqual({
      filterType: 'date',
      type: 'inRange',
      dateFrom: '2026-06-10 14:30:00',
      dateTo: '2026-06-20 14:30:00',
    });
  });

  it('parses "a"/"an" as count 1: "last an hour"', () => {
    expect(parseDateExpression('last an hour', 'us', NOW)).toEqual({
      filterType: 'date',
      type: 'inRange',
      dateFrom: '2026-06-20 13:30:00',
      dateTo: '2026-06-20 14:30:00',
    });
  });

  it('supports abbreviations: "last 2 hr", "last 3 wk", "last 4 yr"', () => {
    expect(parseDateExpression('last 2 hr', 'us', NOW)).toMatchObject({
      type: 'inRange',
      dateFrom: '2026-06-20 12:30:00',
    });
    expect(parseDateExpression('last 3 wk', 'us', NOW)).toMatchObject({
      type: 'inRange',
      dateFrom: '2026-05-30 14:30:00',
    });
    expect(parseDateExpression('last 4 yr', 'us', NOW)).toMatchObject({
      type: 'inRange',
      dateFrom: '2022-06-20 14:30:00',
    });
  });

  it('clamps day overflow when subtracting months (Mar 31 - 1 month = Feb 28)', () => {
    const mar31 = new Date(2026, 2, 31, 9, 0, 0);
    expect(parseDateExpression('last 1 month', 'us', mar31)).toEqual({
      filterType: 'date',
      type: 'inRange',
      dateFrom: '2026-02-28 09:00:00',
      dateTo: '2026-03-31 09:00:00',
    });
  });

  it('returns null for unknown unit', () => {
    expect(parseDateExpression('last 5 fortnights', 'us', NOW)).toBeNull();
  });
});

describe('parseDateExpression — comparator + relative keyword (existing behaviour, locked in)', () => {
  it('= today → inRange covering the whole day', () => {
    expect(parseDateExpression('= today', 'us', NOW)).toEqual({
      filterType: 'date',
      type: 'inRange',
      dateFrom: '2026-06-20 00:00:00',
      dateTo: '2026-06-20 23:59:59',
    });
  });

  it('> today → greaterThan end-of-today', () => {
    expect(parseDateExpression('> today', 'us', NOW)).toEqual({
      filterType: 'date',
      type: 'greaterThan',
      dateFrom: '2026-06-20 23:59:59',
    });
  });

  it('>= today → inRange [start-of-today, far future]', () => {
    expect(parseDateExpression('>= today', 'us', NOW)).toEqual({
      filterType: 'date',
      type: 'inRange',
      dateFrom: '2026-06-20 00:00:00',
      dateTo: '9999-12-31 23:59:59',
    });
  });

  it('< today → lessThan start-of-today', () => {
    expect(parseDateExpression('< today', 'us', NOW)).toEqual({
      filterType: 'date',
      type: 'lessThan',
      dateFrom: '2026-06-20 00:00:00',
    });
  });

  it('<= today → inRange [far past, end-of-today]', () => {
    expect(parseDateExpression('<= today', 'us', NOW)).toEqual({
      filterType: 'date',
      type: 'inRange',
      dateFrom: '1900-01-01 00:00:00',
      dateTo: '2026-06-20 23:59:59',
    });
  });

  it('> yesterday → greaterThan end-of-yesterday', () => {
    expect(parseDateExpression('> yesterday', 'us', NOW)).toEqual({
      filterType: 'date',
      type: 'greaterThan',
      dateFrom: '2026-06-19 23:59:59',
    });
  });

  it('= yesterday → inRange covering yesterday', () => {
    expect(parseDateExpression('= yesterday', 'us', NOW)).toEqual({
      filterType: 'date',
      type: 'inRange',
      dateFrom: '2026-06-19 00:00:00',
      dateTo: '2026-06-19 23:59:59',
    });
  });

  it('>= tomorrow → inRange [start-of-tomorrow, far future]', () => {
    expect(parseDateExpression('>= tomorrow', 'us', NOW)).toEqual({
      filterType: 'date',
      type: 'inRange',
      dateFrom: '2026-06-21 00:00:00',
      dateTo: '9999-12-31 23:59:59',
    });
  });
});
