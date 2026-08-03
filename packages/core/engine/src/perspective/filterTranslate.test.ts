import { describe, expect, it } from 'vitest';
import {
  QUICK_FILTER_COLUMN,
  isFilterModelMappable,
  sanitizeQuickFilterTerm,
  toPerspectiveAggregate,
  toPerspectiveFilter,
  toPerspectiveFilterClauses,
  toPerspectiveGroupLevel,
  toPerspectiveSort,
  toPerspectiveViewConfig,
  toQuickFilterExpression,
  type AgFilterItem,
} from './filterTranslate';

describe('toPerspectiveSort', () => {
  it('maps asc/desc and drops unknown directions', () => {
    expect(toPerspectiveSort([{ colId: 'px', sort: 'asc' }, { colId: 'qty', sort: 'desc' }])).toEqual([
      ['px', 'asc'],
      ['qty', 'desc'],
    ]);
    expect(toPerspectiveSort([{ colId: 'px', sort: 'sideways' }])).toBeUndefined();
    expect(toPerspectiveSort([])).toBeUndefined();
    expect(toPerspectiveSort(undefined)).toBeUndefined();
  });
});

describe('toPerspectiveAggregate', () => {
  it('maps the AG agg funcs that have an exact Perspective name', () => {
    expect(toPerspectiveAggregate('sum')).toBe('sum');
    expect(toPerspectiveAggregate('avg')).toBe('avg');
    expect(toPerspectiveAggregate('min')).toBe('low');
    expect(toPerspectiveAggregate('max')).toBe('high');
    expect(toPerspectiveAggregate('count')).toBe('count');
    expect(toPerspectiveAggregate('first')).toBe('first');
    expect(toPerspectiveAggregate('last')).toBe('last');
  });

  it('returns null rather than guessing at unmappable agg funcs', () => {
    expect(toPerspectiveAggregate('weighted mean')).toBeNull();
    expect(toPerspectiveAggregate('customAgg')).toBeNull();
    expect(toPerspectiveAggregate(null)).toBeNull();
    expect(toPerspectiveAggregate(undefined)).toBeNull();
  });
});

describe('toPerspectiveFilterClauses', () => {
  it('maps every numeric comparison', () => {
    const cases: [string, string][] = [
      ['equals', '=='],
      ['notEqual', '!='],
      ['greaterThan', '>'],
      ['greaterThanOrEqual', '>='],
      ['lessThan', '<'],
      ['lessThanOrEqual', '<='],
    ];
    for (const [agType, op] of cases) {
      expect(
        toPerspectiveFilterClauses('px', { filterType: 'number', type: agType, filter: 10 }),
      ).toEqual([['px', op, 10]]);
    }
  });

  it('maps text equals/notEqual/contains', () => {
    expect(toPerspectiveFilterClauses('book', { filterType: 'text', type: 'equals', filter: 'A' }))
      .toEqual([['book', '==', 'A']]);
    expect(toPerspectiveFilterClauses('book', { filterType: 'text', type: 'notEqual', filter: 'A' }))
      .toEqual([['book', '!=', 'A']]);
    expect(toPerspectiveFilterClauses('book', { filterType: 'text', type: 'contains', filter: 'ne' }))
      .toEqual([['book', 'contains', 'ne']]);
  });

  it('maps set filters, blanks and ranges', () => {
    expect(toPerspectiveFilterClauses('sector', { filterType: 'set', values: ['Energy', 'Tech'] }))
      .toEqual([['sector', 'in', ['Energy', 'Tech']]]);
    expect(toPerspectiveFilterClauses('px', { type: 'blank' })).toEqual([['px', 'is null']]);
    expect(toPerspectiveFilterClauses('px', { type: 'notBlank' })).toEqual([['px', 'is not null']]);
    expect(toPerspectiveFilterClauses('px', { type: 'inRange', filter: 1, filterTo: 9 })).toEqual([
      ['px', '>=', 1],
      ['px', '<=', 9],
    ]);
    expect(
      toPerspectiveFilterClauses('trade', {
        filterType: 'date',
        type: 'inRange',
        dateFrom: '2026-01-01',
        dateTo: '2026-02-01',
      }),
    ).toEqual([
      ['trade', '>=', '2026-01-01'],
      ['trade', '<=', '2026-02-01'],
    ]);
  });

  it('flattens an AND compound into one clause per condition', () => {
    expect(
      toPerspectiveFilterClauses('px', {
        operator: 'AND',
        conditions: [
          { filterType: 'number', type: 'greaterThan', filter: 1 },
          { filterType: 'number', type: 'lessThan', filter: 9 },
        ],
      }),
    ).toEqual([
      ['px', '>', 1],
      ['px', '<', 9],
    ]);
  });

  it('defaults a compound without an operator to AND', () => {
    expect(
      toPerspectiveFilterClauses('px', {
        conditions: [{ filterType: 'number', type: 'greaterThan', filter: 1 }],
      }),
    ).toEqual([['px', '>', 1]]);
  });

  it('refuses an OR compound — Perspective clause lists are conjunctive', () => {
    expect(
      toPerspectiveFilterClauses('px', {
        operator: 'OR',
        conditions: [
          { filterType: 'number', type: 'greaterThan', filter: 9 },
          { filterType: 'number', type: 'lessThan', filter: 1 },
        ],
      }),
    ).toEqual([]);
  });

  it('returns [] for anything it cannot express exactly', () => {
    // Unknown text op — a `startsWith` served as `contains` would show a
    // wider book than the trader asked for.
    expect(
      toPerspectiveFilterClauses('book', { filterType: 'text', type: 'startsWith', filter: 'A' }),
    ).toEqual([]);
    expect(toPerspectiveFilterClauses('px', { filterType: 'number', type: 'equals' })).toEqual([]);
    expect(toPerspectiveFilterClauses('px', { filterType: 'number' })).toEqual([]);
    expect(toPerspectiveFilterClauses('sector', { filterType: 'set' })).toEqual([]);
    expect(toPerspectiveFilterClauses('px', { type: 'inRange', filter: 1 })).toEqual([]);
    expect(toPerspectiveFilterClauses('px', { type: 'inRange', filterTo: 9 })).toEqual([]);
  });
});

describe('isFilterModelMappable', () => {
  it('is true for an absent or fully mappable model', () => {
    expect(isFilterModelMappable(null)).toBe(true);
    expect(isFilterModelMappable(undefined)).toBe(true);
    expect(isFilterModelMappable({})).toBe(true);
    expect(
      isFilterModelMappable({
        px: { filterType: 'number', type: 'greaterThan', filter: 1 },
        sector: { filterType: 'set', values: ['Energy'] },
      }),
    ).toBe(true);
  });

  it('is false as soon as one column drops', () => {
    expect(
      isFilterModelMappable({ book: { filterType: 'text', type: 'startsWith', filter: 'A' } }),
    ).toBe(false);
  });

  it('disagrees with toPerspectiveFilter exactly where a clause was dropped', () => {
    // The View still gets the clause it CAN express — an unfiltered-ish book
    // beats a wrong one, and the grid's filter chips still say what was asked.
    // A count over the same model must refuse instead, which is what the
    // mappable check buys the caller.
    const model: Record<string, AgFilterItem> = {
      px: { filterType: 'number', type: 'greaterThan', filter: 1 },
      book: { filterType: 'text', type: 'startsWith', filter: 'A' },
    };
    expect(toPerspectiveFilter(model)).toEqual([['px', '>', 1]]);
    expect(isFilterModelMappable(model)).toBe(false);

    const mappable: Record<string, AgFilterItem> = {
      px: { filterType: 'number', type: 'greaterThan', filter: 1 },
    };
    expect(toPerspectiveFilter(mappable)).toEqual([['px', '>', 1]]);
    expect(isFilterModelMappable(mappable)).toBe(true);
  });

  it('reports a model whose every clause dropped as unmappable with no filter', () => {
    const model: Record<string, AgFilterItem> = {
      book: { filterType: 'text', type: 'startsWith', filter: 'A' },
    };
    expect(toPerspectiveFilter(model)).toBeUndefined();
    expect(isFilterModelMappable(model)).toBe(false);
  });
});

describe('sanitizeQuickFilterTerm', () => {
  const UNPARSEABLE = /[()[\]{}*+?^$|\\'"]/;

  it('rewrites regex and quoting metacharacters to the self-matching wildcard', () => {
    expect(sanitizeQuickFilterTerm('(')).toBe('.');
    expect(sanitizeQuickFilterTerm('.')).toBe('.');
    expect(sanitizeQuickFilterTerm("'")).toBe('.');
    expect(sanitizeQuickFilterTerm('"')).toBe('.');
    expect(sanitizeQuickFilterTerm('3.5')).toBe('3.5');
    expect(sanitizeQuickFilterTerm('a(b)c')).toBe('a.b.c');
  });

  it('keeps unicode letters and digits — the class is \\p{L}\\p{N}, not a-z0-9', () => {
    expect(sanitizeQuickFilterTerm('Ünïcodé')).toBe('ünïcodé');
    expect(sanitizeQuickFilterTerm('日経225')).toBe('日経225');
    expect(sanitizeQuickFilterTerm('BOOK_A-1')).toBe('book_a-1');
  });

  it('never leaves a character that could abort the View build', () => {
    const hostile = ['(', ')', '[', ']', '{', '}', '*', '+', '?', '^', '$', '|', '\\', "'", '"', '.*', 'a|b', '\\('];
    for (const term of hostile) {
      const safe = sanitizeQuickFilterTerm(term);
      expect(safe).not.toMatch(UNPARSEABLE);
      expect(() => new RegExp(safe)).not.toThrow();
    }
  });
});

describe('toQuickFilterExpression', () => {
  it('ORs across columns within a token and ANDs across tokens', () => {
    expect(toQuickFilterExpression(['a', 'b'], 'foo bar')).toBe(
      "(match(lower(string(\"a\")), 'foo') or match(lower(string(\"b\")), 'foo'))"
      + " and (match(lower(string(\"a\")), 'bar') or match(lower(string(\"b\")), 'bar'))",
    );
  });

  it('returns null when there is nothing to apply', () => {
    expect(toQuickFilterExpression(['a'], '')).toBeNull();
    expect(toQuickFilterExpression(['a'], '   ')).toBeNull();
    expect(toQuickFilterExpression(['a'], undefined)).toBeNull();
    expect(toQuickFilterExpression(['a'], null)).toBeNull();
    expect(toQuickFilterExpression([], 'foo')).toBeNull();
  });

  it('sanitizes each token, so a lone paren cannot blank the grid', () => {
    expect(toQuickFilterExpression(['a'], '(')).toBe("(match(lower(string(\"a\")), '.'))");
  });
});

describe('toPerspectiveViewConfig', () => {
  it('emits only the keys that carry intent', () => {
    expect(toPerspectiveViewConfig({})).toEqual({});
    expect(toPerspectiveViewConfig({ sortModel: [], filterModel: {}, valueCols: [] })).toEqual({});
  });

  it('assembles sort, filter, group_by and aggregates', () => {
    expect(
      toPerspectiveViewConfig({
        sortModel: [{ colId: 'px', sort: 'desc' }],
        filterModel: { sector: { filterType: 'set', values: ['Energy'] } },
        rowGroupCols: [{ id: 'sector' }, { id: 'book' }],
        valueCols: [{ id: 'px', aggFunc: 'sum' }, { id: 'note', aggFunc: 'customAgg' }],
      }),
    ).toEqual({
      sort: [['px', 'desc']],
      filter: [['sector', 'in', ['Energy']]],
      group_by: ['sector', 'book'],
      aggregates: { px: 'sum' },
    });
  });

  it('rides the quick filter as an expression column plus one ANDed clause', () => {
    const config = toPerspectiveViewConfig({
      filterModel: { px: { filterType: 'number', type: 'greaterThan', filter: 1 } },
      quickFilterText: 'foo',
      quickFilterColumns: ['book'],
    });
    expect(config.expressions?.[QUICK_FILTER_COLUMN]).toBe(
      "(match(lower(string(\"book\")), 'foo'))",
    );
    expect(config.filter).toEqual([
      ['px', '>', 1],
      [QUICK_FILTER_COLUMN, '==', true],
    ]);
  });

  it('merges calc-column expressions instead of overwriting the quick-filter column', () => {
    const config = toPerspectiveViewConfig({
      quickFilterText: 'foo',
      quickFilterColumns: ['book'],
      expressions: { notional: '"px" * "qty"' },
    });
    expect(Object.keys(config.expressions ?? {}).sort()).toEqual([QUICK_FILTER_COLUMN, 'notional']);
    expect(config.filter).toEqual([[QUICK_FILTER_COLUMN, '==', true]]);
  });
});

describe('toPerspectiveGroupLevel', () => {
  const rowGroupCols = [{ id: 'sector' }, { id: 'book' }];

  it('groups by the first column at depth 0 with no ancestor clauses', () => {
    const level = toPerspectiveGroupLevel({ rowGroupCols, groupKeys: [] });
    expect(level).toEqual({
      config: { group_by: ['sector'] },
      groupColId: 'sector',
      depth: 0,
    });
  });

  it('pushes ancestor keys down as filter clauses at a mid level', () => {
    const level = toPerspectiveGroupLevel({ rowGroupCols, groupKeys: ['Energy'] });
    expect(level).toEqual({
      config: { filter: [['sector', '==', 'Energy']], group_by: ['book'] },
      groupColId: 'book',
      depth: 1,
    });
  });

  it('drops group_by at the leaf level so the View returns real rows', () => {
    const level = toPerspectiveGroupLevel({ rowGroupCols, groupKeys: ['Energy', 'A'] });
    expect(level).toEqual({
      config: {
        filter: [
          ['sector', '==', 'Energy'],
          ['book', '==', 'A'],
        ],
      },
      groupColId: null,
      depth: 2,
    });
  });

  it('turns a null/undefined group key into `is null`, not `== null`', () => {
    expect(toPerspectiveGroupLevel({ rowGroupCols, groupKeys: [null] }).config.filter).toEqual([
      ['sector', 'is null'],
    ]);
    expect(toPerspectiveGroupLevel({ rowGroupCols, groupKeys: [undefined] }).config.filter).toEqual([
      ['sector', 'is null'],
    ]);
  });

  it('appends ancestor clauses after the request filters, keeping sort intact', () => {
    const level = toPerspectiveGroupLevel({
      rowGroupCols,
      groupKeys: ['Energy'],
      sortModel: [{ colId: 'px', sort: 'asc' }],
      filterModel: { px: { filterType: 'number', type: 'greaterThan', filter: 1 } },
    });
    expect(level.config.sort).toEqual([['px', 'asc']]);
    expect(level.config.filter).toEqual([
      ['px', '>', 1],
      ['sector', '==', 'Energy'],
    ]);
  });

  it('ignores group keys deeper than the group columns', () => {
    const level = toPerspectiveGroupLevel({ rowGroupCols: [{ id: 'sector' }], groupKeys: ['Energy', 'A'] });
    expect(level.config.filter).toEqual([['sector', '==', 'Energy']]);
    expect(level.groupColId).toBeNull();
    expect(level.depth).toBe(2);
  });
});
