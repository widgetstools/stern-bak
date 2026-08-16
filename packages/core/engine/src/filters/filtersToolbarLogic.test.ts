import { describe, expect, it } from 'vitest';
import {
  filterModelsEqual,
  formatFilterModel,
  generateLabel,
  isNewFilter,
  mergeFilterModels,
  normalizeFilterModelForCompare,
  subtractFilterModel,
} from './filtersToolbarLogic';

describe('generateLabel', () => {
  it('names empty, single-column, two-column, and many-column filters', () => {
    expect(generateLabel({}, 2)).toBe('Filter 3');
    expect(generateLabel({ price: { filter: 100 } }, 0)).toBe('price: 100');
    expect(generateLabel({ a: {}, b: {} }, 0)).toBe('a + b');
    expect(generateLabel({ a: {}, b: {}, c: {} }, 0)).toBe('a + 2 more');
  });
});

describe('formatFilterModel', () => {
  it('pretty-prints set, text, number, composite, and multi filters', () => {
    expect(formatFilterModel(null)).toBe('(empty filter)');
    expect(formatFilterModel({ side: { filterType: 'set', values: ['BUY', 'SELL'] } }))
      .toBe('side IN (BUY, SELL)');
    expect(formatFilterModel({ name: { filterType: 'text', type: 'contains', filter: 'abc' } }))
      .toBe('name contains "abc"');
    expect(
      formatFilterModel({
        price: {
          filterType: 'number',
          operator: 'OR',
          conditions: [
            { type: 'greaterThan', filter: 10 },
            { type: 'lessThan', filter: 5 },
          ],
        },
      }),
    ).toBe('(price > 10 OR price < 5)');
  });
});

// `doesValueMatchFilter` / `doesRowMatchFilterModel` moved out of this module
// in Phase 2 of the SSRM parity roadmap — they are the shared predicate now,
// and their suite moved with them to `filterPredicate.test.ts`. The two blocks
// that used to sit here asserted a second reading of AG-Grid's semantics; a
// second reading is the thing that phase deleted.

describe('filterModelsEqual', () => {
  it('treats empty models as equal and ignores set value order', () => {
    expect(filterModelsEqual({}, {})).toBe(true);
    expect(
      filterModelsEqual(
        { side: { filterType: 'set', values: ['B', 'A'] } },
        { side: { filterType: 'set', values: ['A', 'B'] } },
      ),
    ).toBe(true);
  });
});

describe('normalizeFilterModelForCompare', () => {
  it('strips runtime noise while preserving compare keys', () => {
    const normalized = normalizeFilterModelForCompare({
      price: { filterType: 'number', type: 'greaterThan', filter: 1, extra: 'noise' },
    });
    expect(normalized?.price).toEqual({
      filterType: 'number',
      type: 'greaterThan',
      filter: 1,
    });
  });
});

describe('mergeFilterModels', () => {
  it('unions set filters and combines simple filters with OR', () => {
    expect(
      mergeFilterModels([
        { side: { filterType: 'set', values: ['BUY'] } },
        { side: { filterType: 'set', values: ['SELL'] } },
      ]).side,
    ).toEqual({ filterType: 'set', values: ['BUY', 'SELL'] });

    const merged = mergeFilterModels([
      { price: { filterType: 'number', type: 'greaterThan', filter: 10 } },
      { price: { filterType: 'number', type: 'lessThan', filter: 5 } },
    ]).price as { operator?: string; conditions?: unknown[] };
    expect(merged.operator).toBe('OR');
    expect(merged.conditions).toHaveLength(2);
  });
});

describe('isNewFilter and subtractFilterModel', () => {
  const pills = [
    { active: true, filterModel: { side: { filterType: 'set', values: ['BUY'] } } },
    { active: false, filterModel: { region: { filterType: 'text', type: 'equals', filter: 'US' } } },
  ];

  it('detects genuinely new live filters', () => {
    expect(isNewFilter({}, pills)).toBe(false);
    expect(
      isNewFilter({ price: { filterType: 'number', type: 'greaterThan', filter: 10 } }, pills),
    ).toBe(true);
    expect(isNewFilter({ side: { filterType: 'set', values: ['BUY'] } }, pills)).toBe(false);
  });

  it('subtracts columns already owned by active pills', () => {
    expect(
      subtractFilterModel(
        {
          side: { filterType: 'set', values: ['BUY'] },
          price: { filterType: 'number', type: 'greaterThan', filter: 10 },
        },
        { side: { filterType: 'set', values: ['BUY'] } },
      ),
    ).toEqual({
      price: { filterType: 'number', type: 'greaterThan', filter: 10 },
    });
  });

  it('formatFilterModel handles blank ops, multi-filter slots, and unknown shapes', () => {
    expect(formatFilterModel({ qty: { filterType: 'number', type: 'blank' } })).toBe('qty is blank');
    expect(formatFilterModel({
      side: {
        filterType: 'multi',
        filterModels: [null, { filterType: 'text', type: 'equals', filter: 'BUY' }],
      },
    })).toContain('BUY');
    expect(formatFilterModel({ weird: { filterType: 'custom', x: 1 } })).toContain('weird:');
  });

  it('mergeFilterModels appends to existing OR and last-write-wins for unlike shapes', () => {
    const merged = mergeFilterModels([
      { price: { filterType: 'number', type: 'greaterThan', filter: 10, operator: 'OR', conditions: [{ type: 'greaterThan', filter: 10 }] } },
      { price: { filterType: 'number', type: 'lessThan', filter: 5 } },
      { region: { filterType: 'text', type: 'equals', filter: 'BUY' } },
      { region: { filterType: 'set', values: ['US'] } },
    ]);
    expect((merged.price as { conditions?: unknown[] }).conditions?.length).toBe(2);
    expect((merged.region as { filterType?: string }).filterType).toBe('set');
  });

  it('generateLabel uses set values and rejects duplicate inactive pills in isNewFilter', () => {
    expect(generateLabel({ side: { filterType: 'set', values: ['BUY'] } }, 0)).toBe('side: BUY');
    expect(isNewFilter(
      { region: { filterType: 'text', type: 'equals', filter: 'US' } },
      [{ active: false, filterModel: { region: { filterType: 'text', type: 'equals', filter: 'US' } } }],
    )).toBe(false);
  });
});
