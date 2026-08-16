/**
 * The AG Grid filter-model surface, exhaustively.
 *
 * This is the artefact behind Phase 1's exit criterion: EVERY operator the UI
 * can emit either evaluates correctly or is explicitly rejected, and nothing
 * reaches a silent catch-all. The operator lists below are copied from AG
 * Grid's own type declarations (`ISimpleFilterModelType`,
 * `TextAdvancedFilterModelType`, `ScalarAdvancedFilterModelType`,
 * `BooleanAdvancedFilterModelType`), so a version bump that adds an option
 * shows up here as an unlisted name rather than as a wrong answer in
 * production.
 *
 * Rejection is asserted the same way for both halves: the model is refused
 * BEFORE the scan (`assertFilterModelSupported`) and refused again if a row
 * reaches it (`rowPassesFilter`), because validation and evaluation are one
 * walk with a `row === null` mode, not two that can drift.
 */
import { describe, expect, it } from 'vitest';
import { assertFilterModelSupported, compareValues, rowPassesFilter } from './filter.js';
import { UnsupportedQueryError } from './UnsupportedQueryError.js';
import type { Row } from './types.js';

const ROW: Row = {
  id: 'r1',
  book: 'Alpha',
  px: 20,
  when: '2026-03-05T09:30:00',
  active: true,
  blank: '',
  quote: { bid: 7, venue: 'LSE' },
};

const passes = (model: unknown): boolean =>
  rowPassesFilter(ROW, model as Record<string, unknown>);

/** Both halves of the contract: refused up front AND refused per row. */
function expectRefused(model: unknown): void {
  const fm = model as Record<string, unknown>;
  expect(() => assertFilterModelSupported(fm)).toThrow(UnsupportedQueryError);
  expect(() => rowPassesFilter(ROW, fm)).toThrow(UnsupportedQueryError);
}

/** Accepted models are validated silently and answer a boolean. */
function expectAccepted(model: unknown): void {
  const fm = model as Record<string, unknown>;
  expect(() => assertFilterModelSupported(fm)).not.toThrow();
  expect(typeof rowPassesFilter(ROW, fm)).toBe('boolean');
}

describe('text filter — all 8 options AG Grid offers', () => {
  it.each([
    ['contains', 'lph', true],
    ['contains', 'zzz', false],
    ['notContains', 'zzz', true],
    ['notContains', 'lph', false],
    ['equals', 'alpha', true],
    ['equals', 'alph', false],
    ['notEqual', 'beta', true],
    ['notEqual', 'ALPHA', false],
    ['startsWith', 'alp', true],
    ['startsWith', 'lph', false],
    ['endsWith', 'pha', true],
    ['endsWith', 'alp', false],
  ] as const)('%s "%s" → %s', (type, filter, expected) => {
    expect(passes({ book: { filterType: 'text', type, filter } })).toBe(expected);
  });

  it('blank / notBlank read the value, not the filter box', () => {
    expect(passes({ blank: { filterType: 'text', type: 'blank' } })).toBe(true);
    expect(passes({ book: { filterType: 'text', type: 'blank' } })).toBe(false);
    expect(passes({ book: { filterType: 'text', type: 'notBlank' } })).toBe(true);
    expect(passes({ blank: { filterType: 'text', type: 'notBlank' } })).toBe(false);
  });

  it('a missing column is an empty string, not a match-all', () => {
    expect(passes({ nope: { filterType: 'text', type: 'contains', filter: 'a' } })).toBe(
      false,
    );
    expect(passes({ nope: { filterType: 'text', type: 'blank' } })).toBe(true);
  });
});

describe('number filter — all 9 options AG Grid offers', () => {
  it.each([
    ['equals', 20, undefined, true],
    ['equals', 21, undefined, false],
    ['notEqual', 21, undefined, true],
    ['notEqual', 20, undefined, false],
    ['lessThan', 21, undefined, true],
    ['lessThan', 20, undefined, false],
    ['lessThanOrEqual', 20, undefined, true],
    ['lessThanOrEqual', 19, undefined, false],
    ['greaterThan', 19, undefined, true],
    ['greaterThan', 20, undefined, false],
    ['greaterThanOrEqual', 20, undefined, true],
    ['greaterThanOrEqual', 21, undefined, false],
    ['inRange', 10, 30, true],
    ['inRange', 21, 30, false],
  ] as const)('%s %s..%s → %s', (type, filter, filterTo, expected) => {
    expect(
      passes({ px: { filterType: 'number', type, filter, filterTo } }),
    ).toBe(expected);
  });

  it('blank / notBlank treat a non-numeric value as blank', () => {
    expect(passes({ book: { filterType: 'number', type: 'blank' } })).toBe(true);
    expect(passes({ px: { filterType: 'number', type: 'blank' } })).toBe(false);
    expect(passes({ px: { filterType: 'number', type: 'notBlank' } })).toBe(true);
  });
});

describe('date filter — the 7 defaults plus the two the Advanced Filter adds', () => {
  // Bounds are written in AG Grid's own serialised form, `YYYY-MM-DD HH:mm:ss`,
  // which `Date.parse` reads as LOCAL time — the same clock the row value and
  // the engine's calendar-day comparison use. (A bare `YYYY-MM-DD` is UTC by
  // spec and would shift a day west of Greenwich; AG Grid never sends one.)
  const on = (type: string, dateFrom?: string, dateTo?: string) =>
    passes({ when: { filterType: 'date', type, dateFrom, dateTo } });

  it.each([
    ['equals', '2026-03-05 00:00:00', undefined, true],
    ['equals', '2026-03-06 00:00:00', undefined, false],
    ['notEqual', '2026-03-06 00:00:00', undefined, true],
    ['lessThan', '2026-03-06 00:00:00', undefined, true],
    ['lessThan', '2026-03-01 00:00:00', undefined, false],
    ['greaterThan', '2026-03-01 00:00:00', undefined, true],
    ['lessThanOrEqual', '2026-03-06 00:00:00', undefined, true],
    ['greaterThanOrEqual', '2026-03-01 00:00:00', undefined, true],
    ['inRange', '2026-03-01 00:00:00', '2026-03-09 00:00:00', true],
    ['inRange', '2026-03-06 00:00:00', '2026-03-09 00:00:00', false],
  ] as const)('%s %s..%s → %s', (type, from, to, expected) => {
    expect(on(type, from, to)).toBe(expected);
  });

  it('blank / notBlank', () => {
    expect(passes({ nope: { filterType: 'date', type: 'blank' } })).toBe(true);
    expect(on('notBlank')).toBe(true);
  });

  it('REFUSES the relative-date presets rather than answering zero rows', () => {
    // Not in DEFAULT_DATE_FILTER_OPTIONS — a column opts in. Evaluating them
    // would mean re-deriving the grid's own week/quarter boundaries here.
    for (const type of ['today', 'last7Days', 'thisQuarter', 'yearToDate']) {
      expectRefused({ when: { filterType: 'date', type } });
    }
  });

  it('names the option in the refusal, so the message can be shown as-is', () => {
    try {
      assertFilterModelSupported({ when: { filterType: 'date', type: 'last7Days' } });
      throw new Error('expected a refusal');
    } catch (err) {
      expect((err as UnsupportedQueryError).reason).toContain('last7Days');
      expect((err as UnsupportedQueryError).reason).toContain('date range');
    }
  });
});

describe('set filter', () => {
  it('matches membership, with null and empty string interchangeable', () => {
    expect(passes({ book: { filterType: 'set', values: ['Alpha', 'Beta'] } })).toBe(true);
    expect(passes({ book: { filterType: 'set', values: ['Beta'] } })).toBe(false);
    expect(passes({ blank: { filterType: 'set', values: [null] } })).toBe(true);
    expect(passes({ blank: { filterType: 'set', values: [''] } })).toBe(true);
  });

  it('nothing selected matches no rows; no values key restricts nothing', () => {
    expect(passes({ book: { filterType: 'set', values: [] } })).toBe(false);
    expect(passes({ book: { filterType: 'set' } })).toBe(true);
  });
});

describe('combined and multi filters', () => {
  it('joins conditions with AND / OR', () => {
    const conditions = [
      { filterType: 'text', type: 'startsWith', filter: 'Al' },
      { filterType: 'text', type: 'endsWith', filter: 'zz' },
    ];
    expect(passes({ book: { filterType: 'text', operator: 'AND', conditions } })).toBe(false);
    expect(passes({ book: { filterType: 'text', operator: 'OR', conditions } })).toBe(true);
  });

  it('reads a model persisted by an older grid (condition1 / condition2)', () => {
    expect(
      passes({
        book: {
          filterType: 'text',
          operator: 'OR',
          condition1: { filterType: 'text', type: 'equals', filter: 'Alpha' },
          condition2: { filterType: 'text', type: 'equals', filter: 'Beta' },
        },
      }),
    ).toBe(true);
  });

  it('ANDs the tabs of a multi filter, ignoring the ones left unset', () => {
    expect(
      passes({
        book: {
          filterType: 'multi',
          filterModels: [
            { filterType: 'text', type: 'contains', filter: 'lph' },
            null,
          ],
        },
      }),
    ).toBe(true);
  });

  it('refuses a bad condition even when a sibling already decided the answer', () => {
    // The OR is satisfied by the first condition. A short-circuiting
    // evaluator would never look at the second, so the same query would be
    // accepted or refused depending on the data.
    expectRefused({
      book: {
        filterType: 'text',
        operator: 'OR',
        conditions: [
          { filterType: 'text', type: 'contains', filter: 'lph' },
          { filterType: 'text', type: 'soundsLike', filter: 'x' },
        ],
      },
    });
  });
});

describe('Advanced Filter', () => {
  // The whole model IS the tree — AG Grid sends it in place of the column
  // map (`isAdvFilterEnabled() ? getAdvFilterModel() : getFilterModel()`).
  // It used to fall through `Object.entries` to a `return true`, which is how
  // an advanced filter returned the entire unfiltered dataset.
  const text = (type: string, filter?: string) => ({
    filterType: 'text', colId: 'book', type, filter,
  });

  it('evaluates a single column condition', () => {
    expect(passes(text('contains', 'lph'))).toBe(true);
    expect(passes(text('contains', 'zzz'))).toBe(false);
  });

  it('evaluates AND / OR joins, nested', () => {
    const model = {
      filterType: 'join',
      type: 'AND',
      conditions: [
        text('startsWith', 'Al'),
        {
          filterType: 'join',
          type: 'OR',
          conditions: [
            { filterType: 'number', colId: 'px', type: 'greaterThan', filter: 100 },
            { filterType: 'number', colId: 'px', type: 'lessThan', filter: 25 },
          ],
        },
      ],
    };
    expect(passes(model)).toBe(true);
    expect(
      passes({ ...model, conditions: [text('startsWith', 'zz'), model.conditions[1]] }),
    ).toBe(false);
  });

  it('evaluates the boolean column condition', () => {
    expect(passes({ filterType: 'boolean', colId: 'active', type: 'true' })).toBe(true);
    expect(passes({ filterType: 'boolean', colId: 'active', type: 'false' })).toBe(false);
  });

  it('evaluates the bigint, dateString and object variants', () => {
    expect(
      passes({ filterType: 'bigint', colId: 'px', type: 'equals', filter: '20' }),
    ).toBe(true);
    expect(
      passes({
        filterType: 'dateString', colId: 'when', type: 'greaterThan',
        filter: '2026-01-01 00:00:00',
      }),
    ).toBe(true);
    expect(
      passes({ filterType: 'object', colId: 'book', type: 'endsWith', filter: 'pha' }),
    ).toBe(true);
  });

  it('an empty join restricts nothing', () => {
    expect(passes({ filterType: 'join', type: 'AND', conditions: [] })).toBe(true);
  });

  it('refuses an option outside the advanced matrix', () => {
    expectRefused({ filterType: 'text', colId: 'book', type: 'inRange' });
    expectRefused({
      filterType: 'join',
      type: 'AND',
      conditions: [text('contains', 'a'), { filterType: 'text', colId: 'book', type: 'nope' }],
    });
  });

  it('is not confused by a column map whose column is called filterType', () => {
    expect(
      passes({ filterType: { filterType: 'text', type: 'equals', filter: 'x' } }),
    ).toBe(false);
  });
});

describe('nested-path columns', () => {
  // The projector keeps real sub-objects for a dot-path column
  // (`providers/fieldProjection.ts`), so a flat `row[colId]` read found
  // `undefined` and the column filtered on nothing.
  it('filters on the nested value', () => {
    expect(passes({ 'quote.bid': { filterType: 'number', type: 'equals', filter: 7 } })).toBe(
      true,
    );
    expect(passes({ 'quote.bid': { filterType: 'number', type: 'equals', filter: 8 } })).toBe(
      false,
    );
    expect(
      passes({ 'quote.venue': { filterType: 'text', type: 'equals', filter: 'LSE' } }),
    ).toBe(true);
  });

  it('prefers a literal flat key, matching the repo’s path accessor', () => {
    expect(
      rowPassesFilter(
        { 'quote.bid': 99, quote: { bid: 7 } },
        { 'quote.bid': { filterType: 'number', type: 'equals', filter: 99 } },
      ),
    ).toBe(true);
  });
});

describe('nothing falls through', () => {
  it('refuses an unknown operator on every kind', () => {
    expectRefused({ book: { filterType: 'text', type: 'soundsLike', filter: 'a' } });
    expectRefused({ px: { filterType: 'number', type: 'divisibleBy', filter: 2 } });
    expectRefused({ when: { filterType: 'date', type: 'sameWeekAs', dateFrom: 'x' } });
    expectRefused({ active: { filterType: 'boolean', type: 'maybe' } });
  });

  it('refuses a condition with no operator at all', () => {
    expectRefused({ book: { filterType: 'text', filter: 'a' } });
  });

  it('refuses a filterType it does not recognise', () => {
    expectRefused({ book: { filterType: 'geo', shape: 'circle' } });
  });

  it('accepts AG Grid’s unfinished-condition placeholder as no restriction', () => {
    expect(passes({ book: { filterType: 'text', type: 'empty' } })).toBe(true);
  });

  it('treats a cleared column as no restriction, so a persisted profile loads', () => {
    expectAccepted({ book: null });
    expect(passes({ book: null })).toBe(true);
  });

  it('an absent filter model restricts nothing', () => {
    expect(rowPassesFilter(ROW, null)).toBe(true);
    expect(rowPassesFilter(ROW, undefined)).toBe(true);
    expect(() => assertFilterModelSupported(null)).not.toThrow();
  });
});

describe('compareValues', () => {
  it('orders numbers numerically, dates chronologically, and the rest by locale', () => {
    expect(compareValues(2, 10, 'asc')).toBeLessThan(0);
    expect(compareValues('2026-01-02', '2026-01-01', 'asc')).toBeGreaterThan(0);
    expect(compareValues('b', 'a', 'asc')).toBeGreaterThan(0);
    expect(compareValues('b', 'a', 'desc')).toBeLessThan(0);
  });

  it('sorts nulls first ascending', () => {
    expect(compareValues(null, 1, 'asc')).toBeLessThan(0);
    expect(compareValues(null, null, 'asc')).toBe(0);
  });
});
