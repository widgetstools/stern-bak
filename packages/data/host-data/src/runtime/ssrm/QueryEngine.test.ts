import { describe, expect, it } from 'vitest';
import { QueryEngine } from './QueryEngine.js';
import { RowStore } from './RowStore.js';
import { SsrmPlane } from './SsrmPlane.js';

function seedStore() {
  const store = new RowStore({ keyColumn: 'id' });
  store.replaceSnapshot([
    { id: '1', book: 'A', pnl: 10, qty: 2, price: 5 },
    { id: '2', book: 'A', pnl: -5, qty: 1, price: 3 },
    { id: '3', book: 'B', pnl: 20, qty: 4, price: 2 },
  ]);
  return store;
}

describe('QueryEngine', () => {
  it('filters, sorts, and pages leaf rows', () => {
    const engine = new QueryEngine({ store: seedStore() });
    const result = engine.getRows({
      startRow: 0,
      endRow: 1,
      filterModel: {
        book: { filterType: 'text', type: 'equals', filter: 'A' },
      },
      sortModel: [{ colId: 'pnl', sort: 'desc' }],
    });

    expect(result.rowCount).toBe(2);
    expect(result.rowData).toHaveLength(1);
    expect(result.rowData[0]).toMatchObject({ id: '1', pnl: 10 });
  });

  it('enriches calculated columns from configureExpressions', () => {
    const engine = new QueryEngine({ store: seedStore() });
    engine.configureExpressions([
      {
        id: 'gross',
        kind: 'calculated',
        field: 'gross',
        expression: 'data.qty * data.price',
      },
    ]);
    const result = engine.getRows({ startRow: 0, endRow: 10 });
    const row1 = result.rowData.find((r) => r.id === '1');
    expect(row1?.gross).toBe(10);
  });

  it('returns grouped keys with child counts', () => {
    const engine = new QueryEngine({ store: seedStore() });
    const result = engine.getRows({
      startRow: 0,
      endRow: 10,
      rowGroupCols: [{ id: 'book', field: 'book' }],
      groupKeys: [],
    });
    expect(result.rowCount).toBe(2);
    const keys = result.rowData.map((r) => r.book ?? r.__ssrmGroupKey).sort();
    expect(keys).toEqual(['A', 'B']);
  });
});

describe('SsrmPlane', () => {
  it('syncs hub cache and answers getRows', () => {
    const plane = new SsrmPlane({
      providerType: 'stomp-ssrm',
      keyColumn: 'id',
      columnDefinitions: [],
    } as never);

    const cache = new Map<string, unknown>([
      ['a', { id: 'a', pnl: 1 }],
      ['b', { id: 'b', pnl: 2 }],
    ]);
    plane.syncFromCache(cache);

    const result = plane.getRows({
      startRow: 0,
      endRow: 10,
      sortModel: [{ colId: 'pnl', sort: 'asc' }],
    });
    expect(result.rowCount).toBe(2);
    expect(result.rowData.map((r) => r.id)).toEqual(['a', 'b']);
  });
});
