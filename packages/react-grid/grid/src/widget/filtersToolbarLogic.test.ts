import { describe, it, expect } from 'vitest';
import {
  doesRowMatchFilterModel,
  doesValueMatchFilter,
  filterModelsEqual,
  formatFilterModel,
  generateLabel,
  isNewFilter,
  mergeFilterModels,
  subtractFilterModel,
  type SavedFilterShape,
} from './filtersToolbarLogic';

describe('generateLabel', () => {
  it('returns "Filter N+1" for empty models', () => {
    expect(generateLabel({}, 0)).toBe('Filter 1');
    expect(generateLabel({}, 3)).toBe('Filter 4');
  });

  it('formats single-column models with the filter value', () => {
    expect(
      generateLabel(
        { price: { filterType: 'number', type: 'greaterThan', filter: 100 } },
        0,
      ),
    ).toBe('price: 100');
  });

  it('falls back to column name when no filter value is present', () => {
    expect(generateLabel({ symbol: { filterType: 'text' } }, 0)).toBe('symbol');
  });

  it('prefers `value` / `values[0]` over `filter` for set filters', () => {
    expect(
      generateLabel({ side: { filterType: 'set', values: ['BUY', 'SELL'] } }, 0),
    ).toBe('side: BUY');
  });

  it('collapses two-column labels with " + "', () => {
    expect(generateLabel({ a: {}, b: {} }, 0)).toBe('a + b');
  });

  it('summarises 3+ column labels as "<first> + N more"', () => {
    expect(generateLabel({ a: {}, b: {}, c: {} }, 0)).toBe('a + 2 more');
    expect(generateLabel({ a: {}, b: {}, c: {}, d: {} }, 0)).toBe('a + 3 more');
  });
});

describe('doesValueMatchFilter', () => {
  it('match-all when filter is not a recognised shape', () => {
    expect(doesValueMatchFilter(1, {})).toBe(true);
    expect(doesValueMatchFilter(1, { filterType: 'date' })).toBe(true);
  });

  it('set filter — membership', () => {
    expect(
      doesValueMatchFilter('BUY', { filterType: 'set', values: ['BUY', 'SELL'] }),
    ).toBe(true);
    expect(
      doesValueMatchFilter('HOLD', { filterType: 'set', values: ['BUY', 'SELL'] }),
    ).toBe(false);
  });

  it('set filter with empty values matches everything (no filter)', () => {
    expect(doesValueMatchFilter('anything', { filterType: 'set', values: [] })).toBe(true);
  });

  it('text filter — contains / equals / startsWith / endsWith', () => {
    const base = { filterType: 'text' };
    expect(doesValueMatchFilter('Hello', { ...base, type: 'contains', filter: 'ell' })).toBe(true);
    expect(doesValueMatchFilter('Hello', { ...base, type: 'contains', filter: 'xyz' })).toBe(false);
    expect(doesValueMatchFilter('hello', { ...base, type: 'equals', filter: 'Hello' })).toBe(true);
    expect(doesValueMatchFilter('Hello', { ...base, type: 'startsWith', filter: 'he' })).toBe(true);
    expect(doesValueMatchFilter('Hello', { ...base, type: 'endsWith', filter: 'lo' })).toBe(true);
  });

  it('text filter blank / notBlank', () => {
    const base = { filterType: 'text' };
    expect(doesValueMatchFilter('', { ...base, type: 'blank' })).toBe(true);
    expect(doesValueMatchFilter('x', { ...base, type: 'blank' })).toBe(false);
    expect(doesValueMatchFilter('x', { ...base, type: 'notBlank' })).toBe(true);
    expect(doesValueMatchFilter(null, { ...base, type: 'notBlank' })).toBe(false);
  });

  it('number filter — comparators + inRange', () => {
    const base = { filterType: 'number' };
    expect(doesValueMatchFilter(5, { ...base, type: 'greaterThan', filter: 3 })).toBe(true);
    expect(doesValueMatchFilter(3, { ...base, type: 'greaterThan', filter: 3 })).toBe(false);
    expect(doesValueMatchFilter(3, { ...base, type: 'greaterThanOrEqual', filter: 3 })).toBe(true);
    expect(doesValueMatchFilter(5, { ...base, type: 'inRange', filter: 3, filterTo: 7 })).toBe(true);
    expect(doesValueMatchFilter(9, { ...base, type: 'inRange', filter: 3, filterTo: 7 })).toBe(false);
  });

  it('text filter with AND/OR conditions', () => {
    const andFilter = {
      filterType: 'text',
      operator: 'AND',
      conditions: [
        { type: 'startsWith', filter: 'He' },
        { type: 'endsWith', filter: 'lo' },
      ],
    };
    expect(doesValueMatchFilter('Hello', andFilter)).toBe(true);
    expect(doesValueMatchFilter('Help', andFilter)).toBe(false);

    const orFilter = {
      filterType: 'text',
      operator: 'OR',
      conditions: [
        { type: 'equals', filter: 'A' },
        { type: 'equals', filter: 'B' },
      ],
    };
    expect(doesValueMatchFilter('A', orFilter)).toBe(true);
    expect(doesValueMatchFilter('C', orFilter)).toBe(false);
  });
});

describe('doesRowMatchFilterModel', () => {
  it('AND across columns', () => {
    const model = {
      side: { filterType: 'set', values: ['BUY'] },
      price: { filterType: 'number', type: 'greaterThan', filter: 100 },
    };
    expect(doesRowMatchFilterModel({ side: 'BUY', price: 120 }, model)).toBe(true);
    expect(doesRowMatchFilterModel({ side: 'BUY', price: 90 }, model)).toBe(false);
    expect(doesRowMatchFilterModel({ side: 'SELL', price: 120 }, model)).toBe(false);
  });

  it('empty model matches everything', () => {
    expect(doesRowMatchFilterModel({ a: 1 }, {})).toBe(true);
  });

  it('resolves dot-notation column ids against nested row objects', () => {
    const model = {
      'quote.bid': { filterType: 'number', type: 'greaterThan', filter: 100 },
      'meta.side': { filterType: 'set', values: ['BUY'] },
    };
    expect(
      doesRowMatchFilterModel({ quote: { bid: 120 }, meta: { side: 'BUY' } }, model),
    ).toBe(true);
    expect(
      doesRowMatchFilterModel({ quote: { bid: 90 }, meta: { side: 'BUY' } }, model),
    ).toBe(false);
    expect(
      doesRowMatchFilterModel({ quote: { bid: 120 }, meta: { side: 'SELL' } }, model),
    ).toBe(false);
  });

  it('formatFilterModel renders set/text/number and composites', () => {
    expect(formatFilterModel(null)).toBe('(empty filter)');
    expect(formatFilterModel({})).toBe('(empty filter)');
    expect(
      formatFilterModel({ side: { filterType: 'set', values: ['BUY', 'SELL'] } }),
    ).toBe('side IN (BUY, SELL)');
    expect(
      formatFilterModel({
        price: { filterType: 'number', type: 'greaterThan', filter: 100 },
      }),
    ).toBe('price > 100');
    expect(
      formatFilterModel({
        name: { filterType: 'text', type: 'contains', filter: 'foo' },
      }),
    ).toBe('name contains "foo"');
    expect(
      formatFilterModel({
        x: {
          filterType: 'number',
          operator: 'OR',
          conditions: [
            { type: 'greaterThan', filter: 1 },
            { type: 'lessThan', filter: 0 },
          ],
        },
      }),
    ).toBe('(x > 1 OR x < 0)');
    expect(
      formatFilterModel({
        side: { filterType: 'set', values: ['BUY'] },
        price: { filterType: 'number', type: 'inRange', filter: 1, filterTo: 5 },
      }),
    ).toBe('side IN (BUY) AND price between 1 and 5');
  });

  it('literal flat key with dots wins over dot-walk', () => {
    const model = {
      'a.b': { filterType: 'number', type: 'equals', filter: 1 },
    };
    expect(doesRowMatchFilterModel({ 'a.b': 1, a: { b: 2 } }, model)).toBe(true);
  });
});

describe('filterModelsEqual', () => {
  it('both empty / null — equal', () => {
    expect(filterModelsEqual(null, null)).toBe(true);
    expect(filterModelsEqual({}, null)).toBe(true);
    expect(filterModelsEqual(null, {})).toBe(true);
  });

  it('one empty, one populated — not equal', () => {
    expect(filterModelsEqual(null, { a: { filterType: 'text' } })).toBe(false);
  });

  it('key-order-insensitive on top-level', () => {
    const a = { price: { filterType: 'number' }, side: { filterType: 'set' } };
    const b = { side: { filterType: 'set' }, price: { filterType: 'number' } };
    expect(filterModelsEqual(a, b)).toBe(true);
  });

  it('treats set-filter values as order-insensitive (set semantics)', () => {
    const a = { side: { filterType: 'set', values: ['BUY', 'SELL'] } };
    const b = { side: { filterType: 'set', values: ['SELL', 'BUY'] } };
    expect(filterModelsEqual(a, b)).toBe(true);
  });

  it('different values — not equal', () => {
    const a = { side: { filterType: 'set', values: ['BUY'] } };
    const b = { side: { filterType: 'set', values: ['SELL'] } };
    expect(filterModelsEqual(a, b)).toBe(false);
  });
});

describe('mergeFilterModels', () => {
  it('merges distinct columns without conflict', () => {
    const a = { price: { filterType: 'number', type: 'greaterThan', filter: 100 } };
    const b = { side: { filterType: 'set', values: ['BUY'] } };
    expect(mergeFilterModels([a, b])).toEqual({ ...a, ...b });
  });

  it('unions `set` values for the same column', () => {
    const a = { side: { filterType: 'set', values: ['BUY'] } };
    const b = { side: { filterType: 'set', values: ['SELL'] } };
    const out = mergeFilterModels([a, b]);
    expect(out.side).toMatchObject({ filterType: 'set' });
    const values = (out.side as { values: string[] }).values.sort();
    expect(values).toEqual(['BUY', 'SELL']);
  });

  it('combines simple number filters on the same column into an OR', () => {
    const a = { price: { filterType: 'number', type: 'equals', filter: 100 } };
    const b = { price: { filterType: 'number', type: 'equals', filter: 200 } };
    const out = mergeFilterModels([a, b]);
    expect(out.price).toMatchObject({
      filterType: 'number',
      operator: 'OR',
    });
    const conds = (out.price as { conditions: unknown[] }).conditions;
    expect(conds).toHaveLength(2);
  });

  it('appends to an existing OR fan-out', () => {
    const a = {
      price: {
        filterType: 'number',
        operator: 'OR',
        conditions: [
          { type: 'equals', filter: 100 },
          { type: 'equals', filter: 200 },
        ],
      },
    };
    const b = { price: { filterType: 'number', type: 'equals', filter: 300 } };
    const out = mergeFilterModels([a, b]);
    const conds = (out.price as { conditions: unknown[] }).conditions;
    expect(conds).toHaveLength(3);
  });

  it('last-write-wins for incompatible shapes', () => {
    const a = { price: { filterType: 'number', type: 'equals', filter: 100 } };
    const b = { price: { filterType: 'text', type: 'equals', filter: 'abc' } };
    const out = mergeFilterModels([a, b]);
    expect(out.price).toEqual(b.price);
  });

  it('empty input returns empty model', () => {
    expect(mergeFilterModels([])).toEqual({});
  });
});

describe('isNewFilter', () => {
  const pillA: SavedFilterShape = {
    filterModel: { price: { filterType: 'number', type: 'greaterThan', filter: 100 } },
    active: true,
  };
  const pillB: SavedFilterShape = {
    filterModel: { side: { filterType: 'set', values: ['BUY'] } },
    active: true,
  };

  it('null / empty live model is never new', () => {
    expect(isNewFilter(null, [])).toBe(false);
    expect(isNewFilter(undefined, [])).toBe(false);
    expect(isNewFilter({}, [])).toBe(false);
    expect(isNewFilter(null, [pillA])).toBe(false);
  });

  it('empty pills + non-empty live is new', () => {
    expect(isNewFilter(pillA.filterModel, [])).toBe(true);
  });

  it('live matches an ACTIVE pill → not new (echo case)', () => {
    expect(isNewFilter(pillA.filterModel, [pillA])).toBe(false);
  });

  it('live matches an INACTIVE pill → not new (duplicate guard — bug fix)', () => {
    // Previously the check only compared against active filters, so
    // re-entering an inactive pill's filter enabled + and created a
    // duplicate. This regression guard locks that fix in.
    const inactiveA: SavedFilterShape = { ...pillA, active: false };
    expect(isNewFilter(pillA.filterModel, [inactiveA])).toBe(false);
  });

  it('live matches the MERGED active model (N≥2 echo) → not new', () => {
    const merged = mergeFilterModels([pillA.filterModel, pillB.filterModel]);
    expect(isNewFilter(merged, [pillA, pillB])).toBe(false);
  });

  it('live is unique across every pill → new', () => {
    const fresh = { quantity: { filterType: 'number', type: 'greaterThan', filter: 500 } };
    expect(isNewFilter(fresh, [pillA, pillB])).toBe(true);
  });

  it('order-insensitive set-value equality still recognises matching pills', () => {
    // Uses filterModelsEqual internally, which treats set `values` as
    // order-insensitive. Live = {side: set[SELL, BUY]} should match
    // pill whose model stored {side: set[BUY, SELL]}.
    const live = { side: { filterType: 'set', values: ['SELL', 'BUY'] } };
    const pill: SavedFilterShape = {
      filterModel: { side: { filterType: 'set', values: ['BUY', 'SELL'] } },
      active: false,
    };
    expect(isNewFilter(live, [pill])).toBe(false);
  });

  it('AG-Grid enriched live shape still matches a saved pill (no false + enable)', () => {
    const pill: SavedFilterShape = {
      filterModel: { side: { filterType: 'set', values: ['BUY'] } },
      active: true,
    };
    const live = {
      side: {
        filterType: 'set',
        values: ['BUY'],
        // Runtime-only keys AG-Grid adds on getFilterModel().
        searchType: 'value',
      },
    };
    expect(isNewFilter(live, [pill])).toBe(false);
  });

  it('mixed active/inactive set: new filter with two actives + one inactive', () => {
    const extraInactive: SavedFilterShape = {
      filterModel: { quantity: { filterType: 'number', type: 'equals', filter: 7 } },
      active: false,
    };
    const fresh = { venue: { filterType: 'set', values: ['NASDAQ'] } };
    expect(isNewFilter(fresh, [pillA, pillB, extraInactive])).toBe(true);
  });
});

describe('subtractFilterModel', () => {
  it('null / undefined live returns an empty object', () => {
    expect(subtractFilterModel(null, { foo: {} })).toEqual({});
    expect(subtractFilterModel(undefined, { foo: {} })).toEqual({});
  });

  it('empty expected → full live as delta (no active pills case)', () => {
    const live = { side: { filterType: 'set', values: ['BUY'] } };
    expect(subtractFilterModel(live, {})).toEqual(live);
    expect(subtractFilterModel(live, null)).toEqual(live);
  });

  it('drops columns whose per-column filter equals expected', () => {
    const live = {
      side: { filterType: 'set', values: ['BUY'] },
      price: { filterType: 'number', type: 'greaterThan', filter: 100 },
    };
    const expected = { side: { filterType: 'set', values: ['BUY'] } };
    // side is already owned by the active pill; price is new.
    expect(subtractFilterModel(live, expected)).toEqual({
      price: { filterType: 'number', type: 'greaterThan', filter: 100 },
    });
  });

  it('emits a changed value as a delta even on a column expected already covers', () => {
    const live = { side: { filterType: 'set', values: ['SELL'] } };
    const expected = { side: { filterType: 'set', values: ['BUY'] } };
    // Value differs → column is part of the delta.
    expect(subtractFilterModel(live, expected)).toEqual({
      side: { filterType: 'set', values: ['SELL'] },
    });
  });

  it('empty delta when every live column matches expected', () => {
    const live = {
      side: { filterType: 'set', values: ['BUY'] },
      price: { filterType: 'number', type: 'greaterThan', filter: 100 },
    };
    const expected = {
      side: { filterType: 'set', values: ['BUY'] },
      price: { filterType: 'number', type: 'greaterThan', filter: 100 },
    };
    expect(subtractFilterModel(live, expected)).toEqual({});
  });

  it('honours set-value order-insensitivity (same values, different order)', () => {
    const live = { side: { filterType: 'set', values: ['SELL', 'BUY'] } };
    const expected = { side: { filterType: 'set', values: ['BUY', 'SELL'] } };
    // Same values → same filter → not in delta.
    expect(subtractFilterModel(live, expected)).toEqual({});
  });

  it('three-column live + one-column expected → drops the matching column only', () => {
    const live = {
      side: { filterType: 'set', values: ['BUY'] },
      price: { filterType: 'number', type: 'greaterThan', filter: 100 },
      venue: { filterType: 'set', values: ['NYSE'] },
    };
    const expected = {
      price: { filterType: 'number', type: 'greaterThan', filter: 100 },
    };
    expect(subtractFilterModel(live, expected)).toEqual({
      side: { filterType: 'set', values: ['BUY'] },
      venue: { filterType: 'set', values: ['NYSE'] },
    });
  });
});
