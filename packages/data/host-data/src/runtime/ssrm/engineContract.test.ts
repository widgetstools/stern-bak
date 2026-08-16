import { describe, expect, it } from 'vitest';
import { SsrmServer, UnsupportedQueryError, type SsrmFlushEvent } from './index.js';
import type { ICacheIngest } from './index.js';

function fakeTimers() {
  const cbs = new Map<number, () => void>();
  let id = 0;
  return {
    set: (cb: () => void) => (cbs.set(++id, cb), id),
    clear: (h: unknown) => void cbs.delete(h as number),
    fire: () => { const all = [...cbs.values()]; cbs.clear(); all.forEach((f) => f()); },
    get armed() { return cbs.size > 0; },
  };
}

/**
 * Models `setInterval`/`clearInterval` semantics (the hub's own DEFAULT —
 * see `SharedWorkerDataServicesHub` constructor): a callback stays live and
 * keeps firing on every `fireLive()` until `clear()` removes it explicitly.
 * Contrast with `fakeTimers()` above, which is one-shot (`fire()` drains
 * the whole map), matching `setTimeout` — that shape can't catch a
 * consumer that forgets to call `clearTimer` on a normal (non-cancelled)
 * fire, because the one-shot fake already "clears itself".
 */
function intervalFakeTimers() {
  const live = new Map<number, () => void>();
  let id = 0;
  let clearCount = 0;
  return {
    set: (cb: () => void) => { const h = ++id; live.set(h, cb); return h; },
    clear: (h: unknown) => { if (live.delete(h as number)) clearCount++; },
    /** Invoke every still-live callback once (one tick of every armed interval). */
    fireLive: () => { for (const cb of [...live.values()]) cb(); },
    get liveCount() { return live.size; },
    get clearCount() { return clearCount; },
  };
}

/** Any transport is just something that calls ICacheIngest. */
function fakeTransport(sink: ICacheIngest) {
  return {
    snapshot: (n: number) =>
      sink.replaceSnapshot(
        Array.from({ length: n }, (_, i) => ({
          id: `P${i}`, book: i % 2 ? 'A' : 'B', px: i,
        })),
      ),
    tick: (id: string, px: number) => sink.upsert([{ id, px }]),
    drop: (id: string) => sink.remove([id]),
  };
}

const BASE = {
  startRow: 0, endRow: 100, filterModel: {}, sortModel: [],
  groupKeys: [], rowGroupCols: [], valueCols: [], pivotCols: [], pivotMode: false,
};

describe('ssrm engine contract (transport-agnostic)', () => {
  it('serves blocks, aggregates, and ticks driven purely through ICacheIngest', () => {
    const engine = new SsrmServer({ keyColumn: 'id' });
    const transport = fakeTransport(engine);
    const ticks: unknown[] = [];
    engine.onTick((e) => ticks.push(e));

    transport.snapshot(500);
    expect(engine.getRows(BASE).rowCount).toBe(500);

    transport.tick('P7', 9_999);
    const sum = engine.getRows({
      ...BASE, valueCols: [{ field: 'px', aggFunc: 'sum' }],
    }).grandTotalData?.px;
    // Recompute-from-state: the aggregate reflects the tick immediately.
    expect(sum).toBe(((499 * 500) / 2) - 7 + 9_999);

    transport.drop('P7');
    expect(engine.getRows(BASE).rowCount).toBe(499);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
  });
});

describe('windowed flush', () => {
  it('passthrough by default: one flush per store tick, revision-stamped', () => {
    const engine = new SsrmServer({ keyColumn: 'id' });
    const flushes: SsrmFlushEvent[] = [];
    engine.onFlush((e) => flushes.push(e));
    engine.replaceSnapshot([{ id: 'a', px: 1 }]);
    engine.upsert([{ id: 'a', px: 2 }]);
    expect(flushes.map((f) => f.type)).toEqual(['snapshot', 'rows']);
    expect(flushes[1].keys).toEqual(['a']);
    expect(flushes[1].revision).toBe(engine.getStats().revision);
  });

  it('accumulates and key-conflates across a window, flushing once', () => {
    const t = fakeTimers();
    const engine = new SsrmServer({
      keyColumn: 'id', publishWindowMs: 200, setTimer: t.set, clearTimer: t.clear,
    });
    const flushes: SsrmFlushEvent[] = [];
    engine.onFlush((e) => flushes.push(e));
    engine.replaceSnapshot([{ id: 'a', px: 1 }, { id: 'b', px: 1 }]);
    flushes.length = 0; // snapshot flushes immediately even windowed — tested below

    engine.upsert([{ id: 'a', px: 2 }]);
    engine.upsert([{ id: 'a', px: 3 }]);
    engine.upsert([{ id: 'b', px: 2 }]);
    expect(flushes).toEqual([]);      // window open, nothing published
    t.fire();
    expect(flushes).toHaveLength(1);  // one conflated flush
    expect([...flushes[0].keys].sort()).toEqual(['a', 'b']);
    expect(flushes[0].updatesAccumulated).toBe(3); // 3 accumulated, 2 shipped
    expect(flushes[0].revision).toBe(engine.getStats().revision);
    expect(t.armed).toBe(false);      // timer disarmed until next change
  });

  it('flushes snapshot events immediately even inside a window', () => {
    const t = fakeTimers();
    const engine = new SsrmServer({
      keyColumn: 'id', publishWindowMs: 200, setTimer: t.set, clearTimer: t.clear,
    });
    const flushes: SsrmFlushEvent[] = [];
    engine.onFlush((e) => flushes.push(e));
    engine.upsert([{ id: 'a', px: 1 }]);       // opens window
    engine.replaceSnapshot([{ id: 'z', px: 0 }]); // must not wait
    expect(flushes.at(-1)?.type).toBe('snapshot');
  });

  it('isolates a throwing onFlush listener from later listeners and from upsert()', () => {
    const engine = new SsrmServer({ keyColumn: 'id' });
    const flushes: SsrmFlushEvent[] = [];
    engine.onFlush(() => {
      throw new Error('boom');
    });
    engine.onFlush((e) => flushes.push(e));
    expect(() => engine.upsert([{ id: 'a', px: 1 }])).not.toThrow();
    expect(flushes).toHaveLength(1);
    expect(flushes[0].type).toBe('rows');
  });

  it('clears the window timer on every flush under interval-semantics injected timers (regression: timer leak)', () => {
    // Regression for a leak where `flushWindow()` only did `windowTimer =
    // null` and never called `clearTimer`. That's correct for a one-shot
    // `setTimeout`, but the hub's own DEFAULT timer is
    // `setInterval`/`clearInterval` — under interval semantics, skipping
    // the clear leaves the just-fired interval live forever, and the next
    // window arms ANOTHER one on top of it: N windows compound into N live
    // intervals, none ever cleared, all firing (empty, harmless-looking,
    // but leaked) on every subsequent tick.
    const t = intervalFakeTimers();
    const engine = new SsrmServer({
      keyColumn: 'id', publishWindowMs: 200, setTimer: t.set, clearTimer: t.clear,
    });
    const flushes: SsrmFlushEvent[] = [];
    engine.onFlush((e) => flushes.push(e));

    // Window 1: upsert arms exactly one interval.
    engine.upsert([{ id: 'a', px: 1 }]);
    expect(t.liveCount).toBe(1);
    t.fireLive();
    expect(flushes).toHaveLength(1);
    expect(t.clearCount).toBe(1); // window 1's timer was cleared on flush
    expect(t.liveCount).toBe(0);  // nothing pending → nothing re-armed, no leak

    // Window 2: a fresh upsert must arm exactly one NEW interval — not a
    // second one stacked on a leaked window-1 interval.
    engine.upsert([{ id: 'b', px: 2 }]);
    expect(t.liveCount).toBe(1);
    t.fireLive();
    expect(flushes).toHaveLength(2);
    expect(t.clearCount).toBe(2); // one clear per completed window
    expect(t.liveCount).toBe(0);  // no live timers remain, no changes pending
  });

  it('dispose() quiesces flush notification: a later upsert() flushes nothing and arms no timer', () => {
    const t = fakeTimers();
    const engine = new SsrmServer({
      keyColumn: 'id', publishWindowMs: 200, setTimer: t.set, clearTimer: t.clear,
    });
    const flushes: SsrmFlushEvent[] = [];
    engine.onFlush((e) => flushes.push(e));
    engine.dispose();
    engine.upsert([{ id: 'a', px: 1 }]);
    expect(flushes).toEqual([]);
    expect(t.armed).toBe(false);
  });
});

describe('observability stats', () => {
  it('counts memo hits/misses and flush conflation', () => {
    const engine = new SsrmServer({ keyColumn: 'id' });
    engine.replaceSnapshot([{ id: 'a', px: 1 }]);
    engine.getRows(BASE); engine.getRows(BASE);
    const s = engine.getStats();
    expect(s.memoMisses).toBeGreaterThanOrEqual(1);
    expect(s.memoHits).toBeGreaterThanOrEqual(1);
    expect(s.sessions).toBe(0);
    expect(s.flushes).toBeGreaterThanOrEqual(1);
  });
});

describe('per-session expression rules', () => {
  it('two sessions with different calculated columns never see each other\'s', () => {
    const engine = new SsrmServer({ keyColumn: 'id' });
    engine.replaceSnapshot([{ id: 'a', px: 10 }]);
    engine.configureExpressions([{ id: 'c1', kind: 'calculated', field: 'twice', expression: '[px] * 2' }], 'sessA');
    engine.configureExpressions([{ id: 'c2', kind: 'calculated', field: 'half', expression: '[px] / 2' }], 'sessB');

    const rowA = engine.getRows({ ...BASE }, 'sessA').rowData[0];
    const rowB = engine.getRows({ ...BASE }, 'sessB').rowData[0];
    expect(rowA.twice).toBe(20);
    expect(rowA.half).toBeUndefined();
    expect(rowB.half).toBe(5);
    expect(rowB.twice).toBeUndefined();
  });

  it('sessionless configure keeps today\'s global behaviour', () => {
    const engine = new SsrmServer({ keyColumn: 'id' });
    engine.replaceSnapshot([{ id: 'a', px: 10 }]);
    engine.configureExpressions([{ id: 'g', kind: 'calculated', field: 'g', expression: '[px] + 1' }]);
    expect(engine.getRows({ ...BASE }, 'anybody').rowData[0].g).toBe(11);
  });
});

describe('cross-grid consistency acceptance', () => {
  const CRITERIA = {
    ...BASE,
    filterModel: { book: { filterType: 'text', type: 'equals', filter: 'A' } },
    sortModel: [{ colId: 'px', sort: 'desc' as const }],
    valueCols: [{ field: 'px', aggFunc: 'sum' }],
  };

  it('two sessions with identical criteria get the IDENTICAL result at one revision', () => {
    const engine = new SsrmServer({ keyColumn: 'id' });
    engine.replaceSnapshot(Array.from({ length: 1000 }, (_, i) => ({
      id: `r${i}`, book: i % 2 ? 'A' : 'B', px: i,
    })));
    const a = engine.getRows(CRITERIA, 'gridA');
    const b = engine.getRows(CRITERIA, 'gridB');
    expect(b.grandTotalData).toBe(a.grandTotalData); // same memo object — bit-identical
    expect(b.rowData).toEqual(a.rowData);
  });

  it('a spike that retreats within one window leaves only the final value, for every grid', () => {
    const t = fakeTimers();
    const engine = new SsrmServer({
      keyColumn: 'id', publishWindowMs: 200, setTimer: t.set, clearTimer: t.clear,
    });
    engine.replaceSnapshot([{ id: 'a', book: 'A', px: 10 }, { id: 'b', book: 'A', px: 20 }]);
    const sumBefore = engine.getRows(CRITERIA).grandTotalData?.px;
    engine.upsert([{ id: 'a', px: 1_000_000 }]); // spike…
    engine.upsert([{ id: 'a', px: 12 }]);        // …and retreat, same window
    t.fire();
    const sumA = engine.getRows(CRITERIA, 'gridA').grandTotalData?.px;
    const sumB = engine.getRows(CRITERIA, 'gridB').grandTotalData?.px;
    expect(sumA).toBe(32);          // only the final value — never the spike
    expect(sumB).toBe(sumA);
    expect(sumBefore).toBe(30);
  });
});

// ─── Query correctness (roadmap Phase 1) ───────────────────────────────────

/**
 * Everything below answers one question: does a query the UI can express come
 * back with the RIGHT rows, or is it refused? Neither used to be guaranteed —
 * an Advanced Filter returned the whole dataset, an unknown `aggFunc` became a
 * sum, group rows came back in `Map` insertion order, and the quick filter
 * searched columns the user had hidden.
 */
describe('query correctness', () => {
  const seeded = (rows: Array<Record<string, unknown>>) => {
    const engine = new SsrmServer({ keyColumn: 'id' });
    engine.replaceSnapshot(rows);
    return engine;
  };

  const BOOKS = [
    { id: 'r1', book: 'A', desk: 'RATES', px: 30, quote: { bid: 3 } },
    { id: 'r2', book: 'B', desk: 'FX', px: 10, quote: { bid: 1 } },
    { id: 'r3', book: 'C', desk: 'RATES', px: 20, quote: { bid: 2 } },
  ];

  describe('Advanced Filter', () => {
    it('filters, where it used to return every row', () => {
      const engine = seeded(BOOKS);
      const result = engine.getRows({
        ...BASE,
        filterModel: {
          filterType: 'join',
          type: 'OR',
          conditions: [
            { filterType: 'text', colId: 'book', type: 'equals', filter: 'A' },
            { filterType: 'number', colId: 'px', type: 'lessThan', filter: 15 },
          ],
        },
      });
      expect(result.rowData.map((r) => r.id).sort()).toEqual(['r1', 'r2']);
      expect(result.rowCount).toBe(2);
    });

    it('scopes the grand total to the tree it evaluated', () => {
      const engine = seeded(BOOKS);
      const { grandTotalData } = engine.getRows({
        ...BASE,
        valueCols: [{ field: 'px', aggFunc: 'sum' }],
        filterModel: { filterType: 'text', colId: 'desk', type: 'equals', filter: 'RATES' },
      });
      expect(grandTotalData?.px).toBe(50);
    });
  });

  describe('refusals', () => {
    it('refuses an unknown filter option instead of substituting one', () => {
      const engine = seeded(BOOKS);
      expect(() =>
        engine.getRows({
          ...BASE,
          filterModel: { book: { filterType: 'text', type: 'soundsLike', filter: 'A' } },
        }),
      ).toThrow(UnsupportedQueryError);
    });

    it('refuses an unknown aggFunc instead of reporting it as a sum', () => {
      const engine = seeded(BOOKS);
      expect(() =>
        engine.getRows({ ...BASE, valueCols: [{ field: 'px', aggFunc: 'first' }] }),
      ).toThrow(/does not provide/);
    });

    it('refuses on an EMPTY store too — the verdict reads the query, not the rows', () => {
      const engine = new SsrmServer({ keyColumn: 'id' });
      expect(() =>
        engine.getRows({
          ...BASE,
          filterModel: { book: { filterType: 'text', type: 'soundsLike', filter: 'A' } },
        }),
      ).toThrow(UnsupportedQueryError);
    });

    it('refuses the same query through every entry point', () => {
      const engine = seeded(BOOKS);
      const filterModel = { book: { filterType: 'text', type: 'soundsLike', filter: 'A' } };
      expect(() => engine.getSetFilterValues({ column: 'book', filterModel })).toThrow(
        UnsupportedQueryError,
      );
      expect(() => engine.getStatusBar({ filterModel })).toThrow(UnsupportedQueryError);
      expect(() => engine.getGrandTotal({ filterModel })).toThrow(UnsupportedQueryError);
    });
  });

  describe('nested-path columns', () => {
    it('filters, sorts, groups and aggregates on the nested value', () => {
      const engine = seeded(BOOKS);
      const sorted = engine.getRows({
        ...BASE,
        sortModel: [{ colId: 'quote.bid', sort: 'desc' }],
      });
      expect(sorted.rowData.map((r) => r.id)).toEqual(['r1', 'r3', 'r2']);

      const filtered = engine.getRows({
        ...BASE,
        filterModel: {
          'quote.bid': { filterType: 'number', type: 'greaterThan', filter: 1 },
        },
      });
      expect(filtered.rowCount).toBe(2);

      const total = engine.getRows({
        ...BASE,
        valueCols: [{ field: 'quote.bid', aggFunc: 'sum' }],
      });
      expect(total.grandTotalData?.['quote.bid']).toBe(6);
    });

    it('lists set-filter values from the nested value', () => {
      const engine = seeded(BOOKS);
      expect(engine.getSetFilterValues({ column: 'quote.bid' })).toEqual(['1', '2', '3']);
    });
  });

  describe('group-row ordering', () => {
    const GROUPED = {
      ...BASE,
      rowGroupCols: [{ id: 'book', field: 'book' }],
      groupKeys: [],
    };

    it('orders by group key when the sort names a column group rows do not carry', () => {
      // Insertion order here is C, A, B. Sorting group rows by a LEAF column
      // read `undefined` on both sides, so every comparison returned 0 and the
      // block came back in first-seen order.
      const engine = seeded([
        { id: 'r3', book: 'C', px: 20 },
        { id: 'r1', book: 'A', px: 30 },
        { id: 'r2', book: 'B', px: 10 },
      ]);
      const rows = engine.getRows({
        ...GROUPED,
        sortModel: [{ colId: 'px', sort: 'asc' }],
      }).rowData;
      expect(rows.map((r) => r.__ssrmGroupKey)).toEqual(['A', 'B', 'C']);
    });

    it('honours a sort on an aggregated value column, which group rows DO carry', () => {
      const engine = seeded(BOOKS);
      const rows = engine.getRows({
        ...GROUPED,
        valueCols: [{ field: 'px', aggFunc: 'sum' }],
        sortModel: [{ colId: 'px', sort: 'desc' }],
      }).rowData;
      expect(rows.map((r) => r.__ssrmGroupKey)).toEqual(['A', 'C', 'B']);
    });

    it('honours a sort on the auto group column, which is how AG Grid reports one', () => {
      const engine = seeded(BOOKS);
      const rows = engine.getRows({
        ...GROUPED,
        sortModel: [{ colId: 'ag-Grid-AutoColumn', sort: 'desc' }],
      }).rowData;
      expect(rows.map((r) => r.__ssrmGroupKey)).toEqual(['C', 'B', 'A']);
    });
  });

  describe('quick-filter column scope', () => {
    const ROWS = [
      { id: 'r1', book: 'ALPHA', trader: 'jones' },
      { id: 'r2', book: 'BETA', trader: 'alpha' },
    ];

    it('searches only the columns the grid is showing', () => {
      const engine = seeded(ROWS);
      const all = engine.getRows({ ...BASE, quickFilterText: 'alpha' });
      expect(all.rowCount).toBe(2);

      const visibleOnly = engine.getRows({
        ...BASE,
        quickFilterText: 'alpha',
        quickFilterColumns: ['book'],
      });
      expect(visibleOnly.rowData.map((r) => r.id)).toEqual(['r1']);
    });

    it('keeps the same scope for the status bar, so the counts agree', () => {
      const engine = seeded(ROWS);
      const scoped = { quickFilterText: 'alpha', quickFilterColumns: ['book'] };
      expect(engine.getStatusBar(scoped).filteredRows).toBe(
        engine.getRows({ ...BASE, ...scoped }).rowCount,
      );
      expect(engine.getStatusBar(scoped).totalRows).toBe(2);
    });

    it('an omitted scope keeps the all-fields behaviour', () => {
      const engine = seeded(ROWS);
      expect(engine.getRows({ ...BASE, quickFilterText: 'alpha' }).rowCount).toBe(2);
    });

    it('reaches nested values through the scope and through the cache alike', () => {
      const engine = seeded([{ id: 'r1', quote: { venue: 'XETRA' } }]);
      expect(engine.getRows({ ...BASE, quickFilterText: 'xetra' }).rowCount).toBe(1);
      expect(
        engine.getRows({
          ...BASE,
          quickFilterText: 'xetra',
          quickFilterColumns: ['quote.venue'],
        }).rowCount,
      ).toBe(1);
    });

    it('memoises per scope — narrowing the columns is a different query', () => {
      const engine = seeded(ROWS);
      const wide = { ...BASE, quickFilterText: 'alpha' };
      const narrow = { ...wide, quickFilterColumns: ['book'] };
      expect(engine.getRows(wide).rowCount).toBe(2);
      expect(engine.getRows(narrow).rowCount).toBe(1);
      expect(engine.getRows(wide).rowCount).toBe(2);
    });
  });

  describe('an empty fold is blank, not zero', () => {
    it('reports null for a MIN over a column with no numeric values', () => {
      // `computeStatusBar` used to finish with `Number(value ?? 0)`, undoing
      // the fold's own deliberate null — a 0 price reads as data.
      const engine = seeded([{ id: 'r1', note: 'alpha' }]);
      const summary = engine.getStatusBar({ valueCols: [{ field: 'note', aggFunc: 'min' }] });
      expect(summary.aggregations[0].value).toBeNull();
    });

    it('still counts to zero and sums to zero, which are real answers', () => {
      const engine = seeded([{ id: 'r1', note: 'alpha' }]);
      const summary = engine.getStatusBar({
        valueCols: [{ field: 'note', aggFunc: 'sum' }],
      });
      expect(summary.aggregations[0].value).toBe(0);
      expect(
        engine.getStatusBar({ valueCols: [{ field: 'note', aggFunc: 'count' }] })
          .aggregations[0].value,
      ).toBe(1);
    });

    it('folds the SELECTED rows when the request names keys', () => {
      const engine = seeded([
        { id: 'r1', px: 10 },
        { id: 'r2', px: 40 },
        { id: 'r3', px: 100 },
      ]);
      const summary = engine.getStatusBar({
        selectedKeys: ['r1', 'r2'],
        valueCols: [{ field: 'px', aggFunc: 'sum', headerName: 'Notional' }],
      });
      expect(summary.selectedRows).toBe(2);
      expect(summary.filteredRows).toBe(3);
      expect(summary.aggregations[0]).toMatchObject({ value: 50, headerName: 'Notional' });
    });

    it('counts a selected row only while it still passes the filter', () => {
      const engine = seeded([
        { id: 'r1', book: 'A', px: 10 },
        { id: 'r2', book: 'B', px: 40 },
      ]);
      const summary = engine.getStatusBar({
        filterModel: { book: { filterType: 'text', type: 'equals', filter: 'A' } },
        selectedKeys: ['r1', 'r2'],
        valueCols: [{ field: 'px', aggFunc: 'sum' }],
      });
      expect(summary.selectedRows).toBe(1);
      expect(summary.aggregations[0].value).toBe(10);
    });

    it('answers two aggregations over ONE column independently', () => {
      // The fold's output row is keyed by field, so a single pass had the
      // later spec overwrite the earlier one and both readings came back the
      // same. A status bar naming a column twice is the ordinary case.
      const engine = seeded([
        { id: 'r1', px: 10 },
        { id: 'r2', px: 40 },
      ]);
      const summary = engine.getStatusBar({
        valueCols: [
          { field: 'px', aggFunc: 'min' },
          { field: 'px', aggFunc: 'max' },
          { field: 'px', aggFunc: 'avg' },
        ],
      });
      expect(summary.aggregations.map((a) => a.value)).toEqual([10, 40, 25]);
    });
  });
});
