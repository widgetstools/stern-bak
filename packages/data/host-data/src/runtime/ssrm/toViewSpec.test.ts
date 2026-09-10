import { describe, expect, it } from 'vitest';
import { filterModelToNodes, toViewSpec, toViewSpecResult } from './toViewSpec.js';

describe('toViewSpec', () => {
  it('maps the next group level only and turns groupKeys into equals filters', () => {
    const spec = toViewSpec({
      groupKeys: ['DeskA'],
      rowGroupCols: [{ id: 'desk' }, { id: 'trader' }],
      valueCols: [{ id: 'marketValue', aggFunc: 'sum' }],
    });
    expect(spec.filter).toEqual([{ column: 'desk', op: 'equals', value: 'DeskA' }]);
    expect(spec.groupBy).toEqual(['trader']);
    expect(spec.aggregates).toEqual({ marketValue: 'sum' });
    expect(spec.depth).toBe(1);
  });

  it('maps text filters and sort', () => {
    const spec = toViewSpec({
      filterModel: { trader: { filterType: 'text', type: 'contains', filter: 'ann' } },
      sortModel: [{ colId: 'desk', sort: 'asc' }],
    });
    expect(spec.filter).toEqual([{ column: 'trader', op: 'contains', value: 'ann' }]);
    expect(spec.sort).toEqual([{ column: 'desk', dir: 'asc' }]);
  });

  it('maps pivot columns and defaults missing agg funcs to sum', () => {
    const spec = toViewSpec({
      pivotMode: true,
      pivotCols: [{ id: 'ccy' }],
      rowGroupCols: [{ id: 'desk' }],
      valueCols: [{ id: 'qty' }],
    });
    expect(spec.splitBy).toEqual(['ccy']);
    expect(spec.columns).toEqual(['qty']);
    expect(spec.aggregates).toEqual({ qty: 'sum' });
  });

  it('skips groupKeys that have no matching row group column', () => {
    const spec = toViewSpec({ groupKeys: ['only'] });
    expect(spec.filter).toEqual([]);
    expect(spec.groupBy).toBeUndefined();
  });

  describe('quick filter', () => {
    it('expands into an OR of contains across the configured search columns', () => {
      const spec = toViewSpec(
        { quickFilterText: '  ann  ' },
        { searchColumns: ['desk', 'trader'] },
      );
      expect(spec.filter).toEqual([{
        op: 'or',
        conditions: [
          { column: 'desk', op: 'contains', value: 'ann' },
          { column: 'trader', op: 'contains', value: 'ann' },
        ],
      }]);
    });

    it('reports rather than drops a quick filter with no search columns', () => {
      const { spec, unsupported } = toViewSpecResult({ quickFilterText: 'ann' });
      expect(spec.filter).toEqual([]);
      expect(unsupported).toEqual(['quick filter "ann" (no searchColumns configured)']);
    });
  });
});

describe('filterModelToNodes', () => {
  const nodes = (model: unknown) => {
    const unsupported: string[] = [];
    return { out: filterModelToNodes('col', model as never, unsupported), unsupported };
  };

  it('returns nothing for an absent model', () => {
    expect(nodes(null).out).toEqual([]);
    expect(nodes(undefined).out).toEqual([]);
    expect(nodes('nope').out).toEqual([]);
  });

  it('folds case for text equality, which AG Grid treats as insensitive', () => {
    expect(nodes({ filterType: 'text', type: 'equals', filter: 'A' }).out)
      .toEqual([{ column: 'col', op: 'equalsIgnoreCase', value: 'A' }]);
    expect(nodes({ filterType: 'text', type: 'notEqual', filter: 'A' }).out)
      .toEqual([{ column: 'col', op: 'notEqualIgnoreCase', value: 'A' }]);
  });

  it('keeps number equality case-sensitive (there is no case)', () => {
    expect(nodes({ filterType: 'number', type: 'equals', filter: 5 }).out)
      .toEqual([{ column: 'col', op: 'equals', value: 5 }]);
  });

  it.each(['contains', 'notContains', 'startsWith', 'endsWith'] as const)(
    'maps the %s text operator through unchanged',
    (type) => {
      expect(nodes({ filterType: 'text', type, filter: 'x' }).out)
        .toEqual([{ column: 'col', op: type, value: 'x' }]);
    },
  );

  it.each(['greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual'] as const)(
    'maps the %s number operator through unchanged',
    (type) => {
      expect(nodes({ filterType: 'number', type, filter: 3 }).out)
        .toEqual([{ column: 'col', op: type, value: 3 }]);
    },
  );

  it.each(['blank', 'notBlank'] as const)('emits %s with no value', (type) => {
    expect(nodes({ filterType: 'text', type }).out).toEqual([{ column: 'col', op: type }]);
  });

  it('carries both bounds of a number range', () => {
    expect(nodes({ filterType: 'number', type: 'inRange', filter: 1, filterTo: 10 }).out)
      .toEqual([{ column: 'col', op: 'inRange', value: 1, valueTo: 10 }]);
  });

  it('reads dates from dateFrom / dateTo, not filter', () => {
    expect(nodes({ filterType: 'date', type: 'equals', dateFrom: '2026-01-15 00:00:00' }).out)
      .toEqual([{ column: 'col', op: 'equals', value: '2026-01-15 00:00:00' }]);
    expect(nodes({
      filterType: 'date',
      type: 'inRange',
      dateFrom: '2026-01-01 00:00:00',
      dateTo: '2026-12-31 23:59:59',
    }).out).toEqual([{
      column: 'col',
      op: 'inRange',
      value: '2026-01-01 00:00:00',
      valueTo: '2026-12-31 23:59:59',
    }]);
  });

  it('turns a one-value set filter into equals — grouped views reject `in`', () => {
    expect(nodes({ filterType: 'set', values: ['Govies'] }).out)
      .toEqual([{ column: 'col', op: 'equalsIgnoreCase', value: 'Govies' }]);
  });

  it('turns a multi-value set filter into an OR of equals', () => {
    expect(nodes({ filterType: 'set', values: ['A', 'B'] }).out)
      .toEqual([{
        op: 'or',
        conditions: [
          { column: 'col', op: 'equalsIgnoreCase', value: 'A' },
          { column: 'col', op: 'equalsIgnoreCase', value: 'B' },
        ],
      }]);
  });

  it('treats an empty set selection as matching nothing, not everything', () => {
    expect(nodes({ filterType: 'set', values: [] }).out)
      .toEqual([{ column: 'col', op: 'in', value: [] }]);
  });

  it('flattens AND conditions into the ANDed top-level list', () => {
    expect(nodes({
      filterType: 'number',
      operator: 'AND',
      conditions: [
        { filterType: 'number', type: 'greaterThan', filter: 1 },
        { filterType: 'number', type: 'lessThan', filter: 9 },
      ],
    }).out).toEqual([
      { column: 'col', op: 'greaterThan', value: 1 },
      { column: 'col', op: 'lessThan', value: 9 },
    ]);
  });

  it('keeps OR conditions grouped — flattening would show fewer rows', () => {
    expect(nodes({
      filterType: 'text',
      operator: 'OR',
      conditions: [
        { filterType: 'text', type: 'equals', filter: 'a' },
        { filterType: 'text', type: 'equals', filter: 'b' },
      ],
    }).out).toEqual([{
      op: 'or',
      conditions: [
        { column: 'col', op: 'equalsIgnoreCase', value: 'a' },
        { column: 'col', op: 'equalsIgnoreCase', value: 'b' },
      ],
    }]);
  });

  it('drops an OR whose conditions all failed to translate', () => {
    const { out, unsupported } = nodes({
      filterType: 'text',
      operator: 'OR',
      conditions: [{ filterType: 'text', type: 'madeUp' }],
    });
    expect(out).toEqual([]);
    expect(unsupported).toEqual(['col: madeUp (text)']);
  });

  it('ANDs the populated slots of a multi filter and ignores the empty ones', () => {
    // The envelope our stream-safe floating filters emit for
    // `agMultiColumnFilter` columns.
    expect(nodes({
      filterType: 'multi',
      filterModels: [
        { filterType: 'text', type: 'contains', filter: 'ab' },
        null,
      ],
    }).out).toEqual([{ column: 'col', op: 'contains', value: 'ab' }]);

    expect(nodes({
      filterType: 'multi',
      filterModels: [null, { filterType: 'set', values: ['A'] }],
    }).out).toEqual([{ column: 'col', op: 'equalsIgnoreCase', value: 'A' }]);
  });

  it('reports an operator with no engine translation', () => {
    const { out, unsupported } = nodes({ filterType: 'number', type: 'weird', filter: 1 });
    expect(out).toEqual([]);
    expect(unsupported).toEqual(['col: weird (number)']);
  });
});
