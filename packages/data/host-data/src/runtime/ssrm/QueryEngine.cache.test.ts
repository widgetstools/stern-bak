/**
 * Correctness contract for the per-query filtered/sorted order cache.
 *
 * The cache exists so that scrolling a query does not re-scan and re-sort the
 * whole store for every 100-row block. It must be invisible: identical results
 * to an uncached engine, and never a stale answer after the store changes.
 *
 * These are the tests that would catch a broken cache, so they matter more
 * than the speed-up they protect.
 */
import { describe, expect, it, vi } from 'vitest';
import { QueryEngine } from './QueryEngine.js';
import { RowStore } from './RowStore.js';
import { SsrmServer } from './SsrmServer.js';

function seeded(n = 50) {
  const store = new RowStore({ keyColumn: 'id' });
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push({
      id: `r${i}`,
      book: i % 2 === 0 ? 'A' : 'B',
      px: n - i,
    });
  }
  store.replaceSnapshot(rows);
  return { store, engine: new QueryEngine({ store }) };
}

const base = {
  filterModel: {},
  sortModel: [],
  groupKeys: [],
  rowGroupCols: [],
  valueCols: [],
  pivotCols: [],
  pivotMode: false,
};

const ids = (r: { rowData: Array<Record<string, unknown>> }) =>
  r.rowData.map((x) => x.id);

describe('QueryEngine block paging', () => {
  it('returns contiguous non-overlapping blocks across one sorted query', () => {
    const { engine } = seeded();
    const sortModel = [{ colId: 'px', sort: 'asc' as const }];

    const b0 = ids(engine.getRows({ ...base, sortModel, startRow: 0, endRow: 10 }));
    const b1 = ids(engine.getRows({ ...base, sortModel, startRow: 10, endRow: 20 }));
    const all = ids(engine.getRows({ ...base, sortModel, startRow: 0, endRow: 20 }));

    expect([...b0, ...b1]).toEqual(all);
    expect(new Set([...b0, ...b1]).size).toBe(20);
  });

  it('gives the same answer whether a block is fetched first or last', () => {
    const { engine } = seeded();
    const sortModel = [{ colId: 'px', sort: 'desc' as const }];

    const coldMid = ids(engine.getRows({ ...base, sortModel, startRow: 20, endRow: 30 }));
    // Warm other blocks, then re-ask for the same window.
    engine.getRows({ ...base, sortModel, startRow: 0, endRow: 10 });
    engine.getRows({ ...base, sortModel, startRow: 40, endRow: 50 });
    const warmMid = ids(engine.getRows({ ...base, sortModel, startRow: 20, endRow: 30 }));

    expect(warmMid).toEqual(coldMid);
  });
});

describe('QueryEngine cache isolation', () => {
  it('does not serve one sort order for another', () => {
    const { engine } = seeded();
    const asc = ids(engine.getRows({
      ...base, sortModel: [{ colId: 'px', sort: 'asc' }], startRow: 0, endRow: 5,
    }));
    const desc = ids(engine.getRows({
      ...base, sortModel: [{ colId: 'px', sort: 'desc' }], startRow: 0, endRow: 5,
    }));

    expect(desc).not.toEqual(asc);
    // Re-asking for asc must still give the original asc block.
    expect(ids(engine.getRows({
      ...base, sortModel: [{ colId: 'px', sort: 'asc' }], startRow: 0, endRow: 5,
    }))).toEqual(asc);
  });

  it('does not serve one filter for another', () => {
    const { engine } = seeded();
    const all = engine.getRows({ ...base, startRow: 0, endRow: 50 });
    const onlyA = engine.getRows({
      ...base,
      filterModel: { book: { filterType: 'text', type: 'equals', filter: 'A' } },
      startRow: 0,
      endRow: 50,
    });

    expect(all.rowCount).toBe(50);
    expect(onlyA.rowCount).toBe(25);
    expect(ids(onlyA).every((id) => Number(String(id).slice(1)) % 2 === 0)).toBe(true);
    // Unfiltered query must not have been poisoned by the filtered one.
    expect(engine.getRows({ ...base, startRow: 0, endRow: 50 }).rowCount).toBe(50);
  });

  it('keeps quick-filter results separate from unfiltered ones', () => {
    const { engine } = seeded();
    const plain = engine.getRows({ ...base, startRow: 0, endRow: 50 });
    const quick = engine.getRows({ ...base, quickFilterText: 'A', startRow: 0, endRow: 50 });

    expect(quick.rowCount).toBeLessThan(plain.rowCount);
    expect(engine.getRows({ ...base, startRow: 0, endRow: 50 }).rowCount).toBe(50);
  });
});

describe('QueryEngine cache invalidation', () => {
  it('reflects an upsert that changes sort position', () => {
    const { store, engine } = seeded();
    const sortModel = [{ colId: 'px', sort: 'desc' as const }];

    const before = ids(engine.getRows({ ...base, sortModel, startRow: 0, endRow: 1 }));
    expect(before).toEqual(['r0']);

    // Push a different row to the top.
    store.upsert([{ id: 'r49', px: 9_999 }]);

    const after = ids(engine.getRows({ ...base, sortModel, startRow: 0, endRow: 1 }));
    expect(after).toEqual(['r49']);
  });

  it('reflects an upsert that changes filter membership', () => {
    const { store, engine } = seeded();
    const filterModel = { book: { filterType: 'text', type: 'equals', filter: 'A' } };

    expect(engine.getRows({ ...base, filterModel, startRow: 0, endRow: 50 }).rowCount).toBe(25);

    store.upsert([{ id: 'r1', book: 'A' }]);

    expect(engine.getRows({ ...base, filterModel, startRow: 0, endRow: 50 }).rowCount).toBe(26);
  });

  it('reflects removals', () => {
    const { store, engine } = seeded();
    expect(engine.getRows({ ...base, startRow: 0, endRow: 50 }).rowCount).toBe(50);

    store.remove(['r0', 'r1']);

    expect(engine.getRows({ ...base, startRow: 0, endRow: 50 }).rowCount).toBe(48);
  });

  it('reflects a replaced snapshot', () => {
    const { store, engine } = seeded();
    expect(engine.getRows({ ...base, startRow: 0, endRow: 50 }).rowCount).toBe(50);

    store.replaceSnapshot([{ id: 'z1', book: 'A', px: 1 }]);

    const after = engine.getRows({ ...base, startRow: 0, endRow: 50 });
    expect(after.rowCount).toBe(1);
    expect(ids(after)).toEqual(['z1']);
  });

  it('reflects an upsert in the grand total', () => {
    const { store, engine } = seeded();
    const withAgg = {
      ...base,
      valueCols: [{ field: 'px', aggFunc: 'sum' }],
      startRow: 0,
      endRow: 10,
    };

    const before = engine.getRows(withAgg).grandTotalData?.px as number;
    expect(before).toBe((50 * 51) / 2);

    store.upsert([{ id: 'r0', px: 1_000 }]);

    const after = engine.getRows(withAgg).grandTotalData?.px as number;
    expect(after).toBe(before - 50 + 1_000);
  });

  it('does not serve one filter\'s grand total for another', () => {
    const { engine } = seeded();
    const withAgg = { ...base, valueCols: [{ field: 'px', aggFunc: 'sum' }], startRow: 0, endRow: 10 };

    const all = engine.getRows(withAgg).grandTotalData?.px as number;
    const onlyA = engine.getRows({
      ...withAgg,
      filterModel: { book: { filterType: 'text', type: 'equals', filter: 'A' } },
    }).grandTotalData?.px as number;

    expect(onlyA).toBeLessThan(all);
    expect(engine.getRows(withAgg).grandTotalData?.px).toBe(all);
  });

  it('keeps grand totals distinct per aggregation function', () => {
    const { engine } = seeded();
    const mk = (aggFunc: string) =>
      engine.getRows({
        ...base,
        valueCols: [{ field: 'px', aggFunc }],
        startRow: 0,
        endRow: 10,
      }).grandTotalData?.px;

    expect(mk('sum')).toBe((50 * 51) / 2);
    expect(mk('min')).toBe(1);
    expect(mk('max')).toBe(50);
    expect(mk('sum')).toBe((50 * 51) / 2);
  });

  it('reflects a value change in the rows it returns, not just the count', () => {
    const { store, engine } = seeded();
    const read = () =>
      engine.getRows({ ...base, startRow: 0, endRow: 50 }).rowData.find((r) => r.id === 'r5')?.px;

    expect(read()).toBe(45);
    store.upsert([{ id: 'r5', px: 4_242 }]);
    expect(read()).toBe(4_242);
  });
});

describe('QueryEngine memo sizing (10+ blotters)', () => {
  it('ten sorts of one filter share a single filtered-set scan', () => {
    const { store, engine } = seeded(50);
    const filterModel = { book: { filterType: 'text', type: 'equals', filter: 'A' } };
    const spy = vi.spyOn(store, 'iterate');
    for (let s = 0; s < 10; s++) {
      engine.getRows({ ...base, filterModel, sortModel: [{ colId: 'px', sort: s % 2 ? 'asc' : 'desc' }], startRow: 0, endRow: 5 });
    }
    // One store scan for the shared filtered set; sorts memoise independently.
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('grows the memo with session count so 10 blotters do not thrash', () => {
    const s = new SsrmServer({ keyColumn: 'id' });
    for (let i = 0; i < 10; i++) {
      s.setViewportInterest(`sess${i}`, ['a'], { blockKey: 'b0', queryId: `q${i}` });
    }
    // 10 sessions × 8 = 80 — verify via distinct query shapes all staying warm:
    s.replaceSnapshot(Array.from({ length: 100 }, (_, i) => ({ id: `r${i}`, px: i })));
    const spy = vi.spyOn(s.store, 'iterate');
    for (let q = 0; q < 30; q++) {
      s.getRows({ ...base, filterModel: { px: { filterType: 'number', type: 'greaterThan', filter: q } }, startRow: 0, endRow: 5 });
    }
    spy.mockClear();
    for (let q = 0; q < 30; q++) {
      s.getRows({ ...base, filterModel: { px: { filterType: 'number', type: 'greaterThan', filter: q } }, startRow: 0, endRow: 5 });
    }
    expect(spy).not.toHaveBeenCalled(); // all 30 shapes still memoised
  });
});
