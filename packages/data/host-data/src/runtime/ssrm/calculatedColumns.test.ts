/**
 * A calculated column behaves like a real one.
 *
 * Before this, the plane evaluated calculated columns only on the sliced page
 * — after filtering, sorting and grouping had already run against rows that
 * did not carry the field. So a filter on one matched nothing (an EMPTY GRID),
 * a sort on one was a silent no-op, a group on one collapsed every row into a
 * single `""` bucket, and `sum()` over one read 0. The client-side row model
 * answers all four through the column's `valueGetter`, which is the reference
 * these cases are written against.
 *
 * The fix materialises the fields in `SessionOverlay`'s per-session row view,
 * and ONLY for a query that actually reads one — which is what the second half
 * of this file is about. A grid that merely HAS a calculated column asks the
 * same question a clean session asks, and has to keep sharing the answer.
 */
import { describe, expect, it } from 'vitest';
import { QueryEngine } from './QueryEngine.js';
import { RowStore } from './RowStore.js';
import type { ExpressionRule, Row } from './types.js';

const SEED: Row[] = [
  { id: 'A', px: 30, qty: 1, book: 'X' },
  { id: 'B', px: 10, qty: 2, book: 'Y' },
  { id: 'C', px: 20, qty: 3, book: 'X' },
];
// total = px * qty  →  A 30, B 20, C 60

const TOTAL: ExpressionRule = {
  id: 'c1',
  kind: 'calculated',
  field: 'total',
  expression: '[px] * [qty]',
};

function makeEngine(rules: ExpressionRule[] = [TOTAL], sessionId = 's1') {
  const store = new RowStore({ keyColumn: 'id' });
  store.replaceSnapshot(SEED);
  const engine = new QueryEngine({ store });
  engine.configureExpressions(rules, sessionId);
  return { store, engine };
}

const base = {
  startRow: 0,
  endRow: 100,
  filterModel: {},
  sortModel: [],
  groupKeys: [],
  rowGroupCols: [],
  valueCols: [],
  pivotCols: [],
  pivotMode: false,
} as const;

const ids = (r: { rowData: Row[] }) => r.rowData.map((x) => x.id);

describe('filter, sort and group on a calculated column', () => {
  it('sorts by the computed value, not by insertion order', () => {
    const { engine } = makeEngine();
    const r = engine.getRows({ ...base, sortModel: [{ colId: 'total', sort: 'desc' }] }, 's1');
    expect(ids(r)).toEqual(['C', 'A', 'B']);
  });

  it('filters on the computed value instead of matching nothing', () => {
    const { engine } = makeEngine();
    const r = engine.getRows(
      {
        ...base,
        filterModel: { total: { filterType: 'number', type: 'greaterThan', filter: 25 } },
      },
      's1',
    );
    expect(ids(r)).toEqual(['A', 'C']);
    // The count is what the scrollbar is built from, so it has to narrow too.
    expect(r.rowCount).toBe(2);
  });

  it('groups by the computed value instead of one empty bucket', () => {
    const { engine } = makeEngine();
    const r = engine.getRows(
      { ...base, rowGroupCols: [{ id: 'total', field: 'total' }] },
      's1',
    );
    expect(r.rowData.map((g) => g.__ssrmGroupKey)).toEqual(['20', '30', '60']);
    expect(r.rowData.every((g) => g.__ssrmChildCount === 1)).toBe(true);
  });

  it('groups when AG Grid sends only the column id — a calculated column has no colDef.field', () => {
    const { engine } = makeEngine();
    const r = engine.getRows(
      { ...base, rowGroupCols: [{ id: 'total' } as { id: string; field: string }] },
      's1',
    );
    expect(r.rowData.map((g) => g.__ssrmGroupKey)).toEqual(['20', '30', '60']);
  });

  it('aggregates the computed value rather than folding zeroes', () => {
    const { engine } = makeEngine();
    const r = engine.getRows(
      { ...base, valueCols: [{ id: 'total', field: 'total', aggFunc: 'sum' }] },
      's1',
    );
    expect(r.grandTotalData?.total).toBe(110);
  });

  it('lists a calculated column’s own values in its set filter', () => {
    const { engine } = makeEngine();
    expect(engine.getSetFilterValues({ column: 'total' }, 's1')).toEqual(['20', '30', '60']);
    // Sessionless / another session has no such rule, so no such values.
    expect(engine.getSetFilterValues({ column: 'total' }, 's2')).toEqual(['']);
  });

  it('answers per session — two grids on one plane, different rules', () => {
    const { engine } = makeEngine();
    engine.configureExpressions(
      [{ id: 'c2', kind: 'calculated', field: 'total', expression: '[px] + [qty]' }],
      's2',
    );
    const sortDesc = { ...base, sortModel: [{ colId: 'total', sort: 'desc' as const }] };

    // s1: px*qty → C 60, A 30, B 20.  s2: px+qty → A 31, C 23, B 12.
    expect(ids(engine.getRows(sortDesc, 's1'))).toEqual(['C', 'A', 'B']);
    expect(ids(engine.getRows(sortDesc, 's2'))).toEqual(['A', 'C', 'B']);
  });

  it('re-answers when the session changes its rules', () => {
    const { engine } = makeEngine();
    const sortDesc = { ...base, sortModel: [{ colId: 'total', sort: 'desc' as const }] };
    expect(ids(engine.getRows(sortDesc, 's1'))).toEqual(['C', 'A', 'B']);

    engine.configureExpressions(
      [{ id: 'c1', kind: 'calculated', field: 'total', expression: '[px] + [qty]' }],
      's1',
    );
    expect(ids(engine.getRows(sortDesc, 's1'))).toEqual(['A', 'C', 'B']);
  });

  it('derives the column from the session’s own EDIT, as a valueGetter would', () => {
    const { engine } = makeEngine();
    // qty 1 → 10 makes A's total 300, moving it above C.
    engine.setSessionPatches('s1', [{ key: 'A', fields: { qty: 10 } }]);
    const r = engine.getRows({ ...base, sortModel: [{ colId: 'total', sort: 'desc' }] }, 's1');
    expect(ids(r)).toEqual(['A', 'C', 'B']);
    expect(r.rowData[0].total).toBe(300);
  });

  it('excludes on the computed value too', () => {
    const { engine } = makeEngine();
    engine.setSessionExclude('s1', '[total] > 25');
    const r = engine.getRows({ ...base }, 's1');
    expect(ids(r)).toEqual(['B']);
    expect(r.rowCount).toBe(1);
  });

  it('follows a tick — the computed value moves with its inputs', () => {
    const { store, engine } = makeEngine();
    const sortDesc = { ...base, sortModel: [{ colId: 'total', sort: 'desc' as const }] };
    expect(ids(engine.getRows(sortDesc, 's1'))).toEqual(['C', 'A', 'B']);

    store.upsert([{ id: 'B', px: 100 }]); // B: 100*2 = 200
    expect(ids(engine.getRows(sortDesc, 's1'))).toEqual(['B', 'C', 'A']);
  });

  it('evaluates each rule ONCE — the page is not re-derived from its own output', () => {
    // `[total] + 1` is self-referencing: evaluated twice it would answer 2
    // higher than a client-side valueGetter, which runs once per cell.
    const { engine } = makeEngine([
      { id: 'c1', kind: 'calculated', field: 'total', expression: '[px] + 1' },
    ]);
    const sorted = engine.getRows(
      { ...base, sortModel: [{ colId: 'total', sort: 'asc' }] },
      's1',
    );
    // Sorted (so the rows went through the computed view) AND enriched.
    expect(sorted.rowData.map((r) => r.total)).toEqual([11, 21, 31]);

    // Same rows without touching the calculated column: the un-viewed path.
    const plain = engine.getRows({ ...base, sortModel: [{ colId: 'px', sort: 'asc' }] }, 's1');
    expect(plain.rowData.map((r) => r.total)).toEqual([11, 21, 31]);
  });
});

describe('the sharing model survives calculated columns', () => {
  const sortByPx = { ...base, sortModel: [{ colId: 'px', sort: 'desc' as const }] };

  it('a session that has rules but does not QUERY them still shares the cache', () => {
    const { engine } = makeEngine();
    engine.configureExpressions([TOTAL], 's2');

    engine.getRows(sortByPx, 's1');
    const before = engine.getMemoStats();
    engine.getRows(sortByPx, 's2');
    const after = engine.getMemoStats();

    // Neither query reads `total`, so both are the same question — and if
    // merely HAVING a calculated column forked the cache, that would be most
    // grids in the building.
    expect(after.memoMisses).toBe(before.memoMisses);
    expect(after.memoHits).toBeGreaterThan(before.memoHits);
  });

  it('a session with no rules at all is untouched', () => {
    const { engine } = makeEngine();
    engine.getRows(sortByPx, 's1');
    const before = engine.getMemoStats();
    engine.getRows(sortByPx, 'clean');
    expect(engine.getMemoStats().memoMisses).toBe(before.memoMisses);
  });

  it('only the query that READS a calculated column forks', () => {
    const { engine } = makeEngine();
    engine.getRows(sortByPx, 's1');
    const before = engine.getMemoStats();
    engine.getRows({ ...base, sortModel: [{ colId: 'total', sort: 'desc' }] }, 's1');
    expect(engine.getMemoStats().memoMisses).toBeGreaterThan(before.memoMisses);
  });

  it('two sessions with the SAME query but different rules do not share it', () => {
    const { engine } = makeEngine();
    engine.configureExpressions(
      [{ id: 'c2', kind: 'calculated', field: 'total', expression: '[px] + [qty]' }],
      's2',
    );
    const sortTotal = { ...base, sortModel: [{ colId: 'total', sort: 'desc' as const }] };

    engine.getRows(sortTotal, 's1');
    const before = engine.getMemoStats();
    engine.getRows(sortTotal, 's2');
    // A hit here would serve s2 the order s1's rules produced.
    expect(engine.getMemoStats().memoMisses).toBeGreaterThan(before.memoMisses);
  });

  it('the second block of a computed query is still a hit', () => {
    const { engine } = makeEngine();
    const sortTotal = { ...base, sortModel: [{ colId: 'total', sort: 'desc' as const }] };
    engine.getRows({ ...sortTotal, startRow: 0, endRow: 2 }, 's1');
    const before = engine.getMemoStats();
    engine.getRows({ ...sortTotal, startRow: 2, endRow: 4 }, 's1');
    // Paging a computed query must not re-derive the whole store per block —
    // that is the cost that kept this feature out of the plane.
    expect(engine.getMemoStats().memoMisses).toBe(before.memoMisses);
    expect(engine.getMemoStats().memoHits).toBeGreaterThan(before.memoHits);
  });
});

/**
 * `configureExpressions` used to clear the WHOLE shared order cache, so ten
 * blotters pushing rules at mount evicted each other's warm orders nine times
 * over. Every cache key now carries the requesting session's identity, so a
 * session's own entries are exactly those naming it.
 */
describe('a rule change evicts only the session that made it', () => {
  const sortByPx = { ...base, sortModel: [{ colId: 'px', sort: 'desc' as const }] };

  it('leaves another session’s warm order alone', () => {
    const { engine } = makeEngine();
    engine.configureExpressions([TOTAL], 's2');
    // Warm both on a query that READS the calculated column, so each holds
    // entries of its own.
    const sortTotal = { ...base, sortModel: [{ colId: 'total', sort: 'desc' as const }] };
    engine.getRows(sortTotal, 's1');
    engine.getRows(sortTotal, 's2');

    engine.configureExpressions(
      [{ id: 'c1', kind: 'calculated', field: 'total', expression: '[px] + 1' }],
      's1',
    );

    const before = engine.getMemoStats();
    engine.getRows(sortTotal, 's2');
    // s2's rules did not change, so its order is still warm.
    expect(engine.getMemoStats().memoMisses).toBe(before.memoMisses);
  });

  it('still evicts the session that DID change', () => {
    const { engine } = makeEngine();
    const sortTotal = { ...base, sortModel: [{ colId: 'total', sort: 'desc' as const }] };
    engine.getRows(sortTotal, 's1');

    engine.configureExpressions(
      [{ id: 'c1', kind: 'calculated', field: 'total', expression: '[px] + 1' }],
      's1',
    );
    const before = engine.getMemoStats();
    expect(ids(engine.getRows(sortTotal, 's1'))).toEqual(['A', 'C', 'B']);
    expect(engine.getMemoStats().memoMisses).toBeGreaterThan(before.memoMisses);
  });

  it('a SESSIONLESS configure still clears everything — it changes the global set', () => {
    const { engine } = makeEngine();
    engine.getRows(sortByPx, 'clean');
    const before = engine.getMemoStats();

    engine.configureExpressions([TOTAL]);

    engine.getRows(sortByPx, 'clean');
    expect(engine.getMemoStats().memoMisses).toBeGreaterThan(before.memoMisses);
  });
});
