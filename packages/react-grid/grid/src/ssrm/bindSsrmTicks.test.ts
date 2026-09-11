import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import { bindSsrmTicks } from './bindSsrmTicks.js';
import { SsrmBlockCache } from './SsrmBlockCache.js';
import { SSRM_ROW_ID_KEY } from './ssrmGetRowId.js';

afterEach(() => {
  vi.useRealTimers();
});

function provider(rowCount = 0) {
  const ticks = new Set<(payload: unknown) => void>();
  const statuses = new Set<(status: string) => void>();
  const refreshes = new Set<() => void>();
  return {
    id: 'p1',
    capabilities: {
      providerType: 'stomp-ssrm',
      streaming: true,
      realtime: true,
      supportsRefresh: true,
      supportsRestart: true,
    },
    start: vi.fn(),
    stop: vi.fn(),
    refresh: vi.fn(),
    restart: vi.fn(),
    getConfig: vi.fn(),
    getColumnDefs: vi.fn(() => []),
    getRows: vi.fn(),
    getColumnValues: vi.fn(() => Promise.resolve({ column: 'c', values: [], truncated: false })),
    getRowCount: vi.fn(() => Promise.resolve({ rowCount })),
    getAggregates: vi.fn(() => Promise.resolve({ values: {} })),
    watchGroups: vi.fn(),
    onSsrmTick: vi.fn((h: (payload: unknown) => void) => {
      ticks.add(h);
      return () => { ticks.delete(h); };
    }),
    onRefresh: vi.fn((h: () => void) => {
      refreshes.add(h);
      return () => { refreshes.delete(h); };
    }),
    onRowsReceived: vi.fn(() => () => undefined),
    onStatus: vi.fn((h: (status: string) => void) => {
      statuses.add(h);
      return () => { statuses.delete(h); };
    }),
    onError: vi.fn(() => () => undefined),
    emitTick(payload: unknown) {
      for (const h of ticks) h(payload);
    },
    emitStatus(status: string) {
      for (const h of statuses) h(status);
    },
    emitRefresh() {
      for (const h of refreshes) h();
    },
  } as ISsrmDataProvider & {
    emitTick: (payload: unknown) => void;
    emitStatus: (status: string) => void;
    emitRefresh: () => void;
  };
}

type Loaded = Record<string, Record<string, unknown>>;

/** A grid whose store holds `loaded` rows, keyed by id, with `row.id` as the row id. */
function api(overrides: Record<string, unknown> = {}, loaded: Loaded = {}) {
  const listeners = new Map<string, Set<() => void>>();
  return {
    refreshServerSide: vi.fn(),
    applyServerSideTransactionAsync: vi.fn(),
    getColumnState: vi.fn(() => [] as Array<{ colId: string; sort: string | null }>),
    getRowGroupColumns: vi.fn(() => [] as Array<{ getColId: () => string }>),
    getFilterModel: vi.fn(() => ({}) as Record<string, unknown>),
    getRowNode: vi.fn((id: string) => (loaded[id] ? { id, data: loaded[id] } : undefined)),
    forEachNode: vi.fn((fn: (node: { id: string; data: unknown; group: boolean }) => void) => {
      for (const [id, data] of Object.entries(loaded)) fn({ id, data, group: false });
    }),
    retryServerSideLoads: vi.fn(),
    getDisplayedRowCount: vi.fn(() => Object.keys(loaded).length),
    getGridOption: vi.fn((key: string) => (
      key === 'getRowId' ? (p: { data: { id: string } }) => p.data.id : undefined
    )),
    addEventListener: vi.fn((evt: string, fn: () => void) => {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt)!.add(fn);
    }),
    removeEventListener: vi.fn((evt: string, fn: () => void) => {
      listeners.get(evt)?.delete(fn);
    }),
    isDestroyed: vi.fn(() => false),
    fire(evt: string) {
      for (const fn of listeners.get(evt) ?? []) fn();
    },
    ...overrides,
  };
}

const sorted = () => [{ colId: 'desk', sort: 'asc' }];

describe('bindSsrmTicks — lifecycle', () => {
  it('purges the SSRM cache when the provider becomes ready', () => {
    const p = provider();
    const grid = api();
    bindSsrmTicks(p, grid as never);
    p.emitStatus('ready');
    expect(grid.refreshServerSide).toHaveBeenCalledWith({ purge: true });
  });

  it('purges when the provider signals a refresh, and stops after unbind', () => {
    const p = provider();
    const grid = api();
    const off = bindSsrmTicks(p, grid as never);
    p.emitRefresh();
    expect(grid.refreshServerSide).toHaveBeenCalledWith({ purge: true });
    expect(grid.addEventListener).toHaveBeenCalledWith('bodyScroll', expect.any(Function));

    off();
    grid.refreshServerSide.mockClear();
    p.emitRefresh();
    p.emitTick({ kind: 'rowDelta', upserts: [{ id: '1' }] });
    p.emitStatus('ready');
    expect(grid.refreshServerSide).not.toHaveBeenCalled();
    expect(grid.applyServerSideTransactionAsync).not.toHaveBeenCalled();
    expect(grid.removeEventListener).toHaveBeenCalledWith('bodyScroll', expect.any(Function));
  });

  it('swallows refresh errors on a destroyed api', () => {
    const p = provider();
    const grid = api({
      refreshServerSide: vi.fn(() => { throw new Error('destroyed'); }),
    });
    bindSsrmTicks(p, grid as never);
    p.emitStatus('ready');
  });
});

describe('bindSsrmTicks — transactions', () => {
  it('applies loaded upserts in place and skips rows the grid has not loaded', () => {
    const p = provider();
    const grid = api({}, { 1: { id: '1', px: 1 } });
    bindSsrmTicks(p, grid as never);
    p.emitTick({ kind: 'rowDelta', upserts: [{ id: '1', px: 2 }, { id: '2', px: 3 }] });
    expect(grid.applyServerSideTransactionAsync).toHaveBeenCalledWith({ update: [{ id: '1', px: 2 }] });
  });

  it('sends removals as a remove transaction of id stubs', () => {
    const p = provider();
    const grid = api({}, { 1: { id: '1' } });
    bindSsrmTicks(p, grid as never);
    p.emitTick({ kind: 'rowDelta', upserts: [], removals: ['1', '9'] });
    expect(grid.applyServerSideTransactionAsync).toHaveBeenCalledWith({
      remove: [{ [SSRM_ROW_ID_KEY]: '1' }, { [SSRM_ROW_ID_KEY]: '9' }],
    });
  });

  it('treats every upsert as loaded when the api offers no row lookup', () => {
    const p = provider();
    const grid = api({ getRowNode: undefined, forEachNode: undefined });
    bindSsrmTicks(p, grid as never);
    p.emitTick({ kind: 'rowDelta', upserts: [{ id: '1' }, { id: '2' }] });
    expect(grid.applyServerSideTransactionAsync).toHaveBeenCalledWith({ update: [{ id: '1' }, { id: '2' }] });
  });

  it('indexes loaded rows once per tick with forEachNode rather than scanning per row', () => {
    const p = provider();
    const grid = api({}, { 1: { id: '1' }, 2: { id: '2' } });
    bindSsrmTicks(p, grid as never);
    p.emitTick({ kind: 'rowDelta', upserts: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }] });
    expect(grid.forEachNode).toHaveBeenCalledTimes(1);
    expect(grid.getRowNode).not.toHaveBeenCalled();
    expect(grid.applyServerSideTransactionAsync).toHaveBeenCalledWith({ update: [{ id: '1' }, { id: '2' }] });
  });

  it('falls back to getRowNode when forEachNode is missing', () => {
    const p = provider();
    const grid = api({ forEachNode: undefined }, { 1: { id: '1' } });
    bindSsrmTicks(p, grid as never);
    p.emitTick({ kind: 'rowDelta', upserts: [{ id: '1' }, { id: '2' }] });
    expect(grid.getRowNode).toHaveBeenCalledTimes(2);
    expect(grid.applyServerSideTransactionAsync).toHaveBeenCalledWith({ update: [{ id: '1' }] });
  });

  it('patches the shared block cache on updates and clears it on removals and refreshes', () => {
    vi.useFakeTimers();
    const p = provider();
    const cache = new SsrmBlockCache();
    const idOf = (r: Record<string, unknown>) => String(r.id);
    cache.set('v', 0, { rowData: [{ id: '1', px: 1 }], rowCount: 1 }, idOf);
    const grid = api({}, { 1: { id: '1', px: 1 } });
    bindSsrmTicks(p, grid as never, { cache, refreshThrottleMs: 10 });
    p.emitTick({ kind: 'rowDelta', upserts: [{ id: '1', px: 5 }] });
    expect(cache.get('v', 0)?.rowData[0]).toEqual({ id: '1', px: 5 });

    p.emitTick({ kind: 'rowDelta', upserts: [], removals: ['9'] });
    expect(cache.size).toBe(0);

    cache.set('v', 0, { rowData: [{ id: '1', px: 5 }], rowCount: 1 }, idOf);
    p.emitTick({ kind: 'groupDelta', groups: [] });
    vi.advanceTimersByTime(10);
    expect(cache.size).toBe(0);
    expect(grid.refreshServerSide).toHaveBeenCalledWith({ purge: false });

    cache.set('v', 0, { rowData: [{ id: '1', px: 5 }], rowCount: 1 }, idOf);
    p.emitStatus('ready');
    expect(cache.size).toBe(0);
  });

  it('ignores empty ticks', () => {
    const p = provider();
    const grid = api();
    bindSsrmTicks(p, grid as never);
    p.emitTick({ kind: 'rowDelta', upserts: [] });
    p.emitTick({ kind: 'rowDelta' });
    expect(grid.applyServerSideTransactionAsync).not.toHaveBeenCalled();
    expect(grid.refreshServerSide).not.toHaveBeenCalled();
  });

  it('falls back to a refresh when apply throws', () => {
    vi.useFakeTimers();
    const p = provider();
    const grid = api({
      applyServerSideTransactionAsync: vi.fn(() => { throw new Error('gone'); }),
    }, { 1: { id: '1' } });
    bindSsrmTicks(p, grid as never, { refreshThrottleMs: 10 });
    p.emitTick({ kind: 'rowDelta', upserts: [{ id: '1' }] });
    vi.advanceTimersByTime(10);
    expect(grid.refreshServerSide).toHaveBeenCalledWith({ purge: false });
  });
});

describe('bindSsrmTicks — positional refreshes', () => {
  it('does not refresh when a sorted row ticks without changing its sort key', () => {
    vi.useFakeTimers();
    const p = provider();
    const grid = api({ getColumnState: sorted }, { 1: { id: '1', desk: 'A', px: 1 } });
    bindSsrmTicks(p, grid as never, { refreshThrottleMs: 10, positionalRefreshMs: 20 });
    p.emitTick({ kind: 'rowDelta', upserts: [{ id: '1', desk: 'A', px: 2 }] });
    expect(grid.applyServerSideTransactionAsync).toHaveBeenCalledWith({ update: [{ id: '1', desk: 'A', px: 2 }] });
    vi.advanceTimersByTime(5000);
    expect(grid.refreshServerSide).not.toHaveBeenCalled();
  });

  it('refreshes on the fast throttle when a loaded row\'s sort key changes', () => {
    vi.useFakeTimers();
    const p = provider();
    const grid = api({ getColumnState: sorted }, { 1: { id: '1', desk: 'A' } });
    bindSsrmTicks(p, grid as never, { refreshThrottleMs: 10, positionalRefreshMs: 1000 });
    p.emitTick({ kind: 'rowDelta', upserts: [{ id: '1', desk: 'B' }] });
    vi.advanceTimersByTime(9);
    expect(grid.refreshServerSide).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(grid.refreshServerSide).toHaveBeenCalledTimes(1);
    expect(grid.refreshServerSide).toHaveBeenCalledWith({ purge: false });
  });

  it('counts filter columns as key columns', () => {
    vi.useFakeTimers();
    const p = provider();
    const grid = api(
      { getFilterModel: () => ({ desk: { filterType: 'text', type: 'equals', filter: 'A' } }) },
      { 1: { id: '1', desk: 'A' } },
    );
    bindSsrmTicks(p, grid as never, { refreshThrottleMs: 10 });
    p.emitTick({ kind: 'rowDelta', upserts: [{ id: '1', desk: 'B' }] });
    vi.advanceTimersByTime(10);
    expect(grid.refreshServerSide).toHaveBeenCalledWith({ purge: false });
  });

  it('refreshes on the slow cadence when unloaded rows tick under a sort', () => {
    vi.useFakeTimers();
    const p = provider();
    const grid = api({ getColumnState: sorted }, { 1: { id: '1', desk: 'A' } });
    bindSsrmTicks(p, grid as never, { refreshThrottleMs: 10, positionalRefreshMs: 100 });
    p.emitTick({ kind: 'rowDelta', upserts: [{ id: '2', desk: 'Z' }] });
    p.emitTick({ kind: 'rowDelta', upserts: [{ id: '3', desk: 'Z' }] });
    vi.advanceTimersByTime(99);
    expect(grid.refreshServerSide).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(grid.refreshServerSide).toHaveBeenCalledTimes(1);
  });

  it('re-reads group aggregates on the slow cadence when grouped', () => {
    vi.useFakeTimers();
    const p = provider();
    const grid = api(
      { getRowGroupColumns: () => [{ getColId: () => 'desk' }] },
      { 1: { id: '1', desk: 'A' } },
    );
    bindSsrmTicks(p, grid as never, { refreshThrottleMs: 10, positionalRefreshMs: 50 });
    p.emitTick({ kind: 'rowDelta', upserts: [{ id: '1', desk: 'A', px: 9 }] });
    expect(grid.applyServerSideTransactionAsync).toHaveBeenCalled();
    vi.advanceTimersByTime(49);
    expect(grid.refreshServerSide).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(grid.refreshServerSide).toHaveBeenCalledWith({ purge: false });
  });

  it('schedules one fast refresh for group deltas and resets', () => {
    vi.useFakeTimers();
    const p = provider();
    const grid = api();
    bindSsrmTicks(p, grid as never, { refreshThrottleMs: 10 });
    p.emitTick({ kind: 'groupDelta', groups: [] });
    p.emitTick({ kind: 'rowDelta', reset: true, upserts: [{ id: '1' }] });
    vi.advanceTimersByTime(10);
    expect(grid.refreshServerSide).toHaveBeenCalledTimes(1);
  });

  it('defers refreshes while a paste is in progress', () => {
    vi.useFakeTimers();
    const p = provider();
    const grid = api();
    bindSsrmTicks(p, grid as never, { refreshThrottleMs: 10, scrollResumeMs: 20 });
    grid.fire('pasteStart');
    p.emitTick({ kind: 'groupDelta', groups: [] });
    vi.advanceTimersByTime(100);
    expect(grid.refreshServerSide).not.toHaveBeenCalled();
    grid.fire('pasteEnd');
    vi.advanceTimersByTime(19);
    expect(grid.refreshServerSide).not.toHaveBeenCalled();
    vi.advanceTimersByTime(20);
    expect(grid.refreshServerSide).toHaveBeenCalledTimes(1);
  });

  it('retries failed blocks on ready, on positional refreshes and on the count check', async () => {
    vi.useFakeTimers();
    const p = provider(1);
    const grid = api({}, { 1: { id: '1' } });
    bindSsrmTicks(p, grid as never, { refreshThrottleMs: 10, countCheckMs: 10 });
    p.emitStatus('ready');
    expect(grid.retryServerSideLoads).toHaveBeenCalledTimes(1);
    p.emitTick({ kind: 'groupDelta', groups: [] });
    vi.advanceTimersByTime(10);
    expect(grid.retryServerSideLoads).toHaveBeenCalledTimes(2);
    p.emitTick({ kind: 'rowDelta', upserts: [{ id: '2' }] });
    await vi.advanceTimersByTimeAsync(11);
    expect(grid.retryServerSideLoads).toHaveBeenCalledTimes(3);
  });

  it('defers refreshes while the body is scrolling', () => {
    vi.useFakeTimers();
    const p = provider();
    const grid = api();
    bindSsrmTicks(p, grid as never, { refreshThrottleMs: 10, scrollResumeMs: 50 });
    grid.fire('bodyScroll');
    p.emitTick({ kind: 'groupDelta', groups: [] });
    vi.advanceTimersByTime(10);
    expect(grid.refreshServerSide).not.toHaveBeenCalled();
    vi.advanceTimersByTime(40);
    expect(grid.refreshServerSide).toHaveBeenCalledTimes(1);
  });

  it('treats getColumnState failures as unsorted', () => {
    const p = provider();
    const grid = api({
      getColumnState: () => { throw new Error('api'); },
    }, { 1: { id: '1' } });
    bindSsrmTicks(p, grid as never);
    p.emitTick({ kind: 'rowDelta', upserts: [{ id: '1' }] });
    expect(grid.applyServerSideTransactionAsync).toHaveBeenCalled();
  });
});

describe('bindSsrmTicks — row-count reconciliation', () => {
  it('refreshes when unloaded rows ticked and the engine count moved', async () => {
    vi.useFakeTimers();
    const p = provider(2);
    const grid = api({}, { 1: { id: '1' } });
    bindSsrmTicks(p, grid as never, { countCheckMs: 10 });
    p.emitTick({ kind: 'rowDelta', upserts: [{ id: '2' }] });
    expect(grid.applyServerSideTransactionAsync).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10);
    expect(p.getRowCount).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(grid.refreshServerSide).toHaveBeenCalledWith({ purge: false });
  });

  it('leaves the grid alone when the engine count matches', async () => {
    vi.useFakeTimers();
    const p = provider(1);
    const grid = api({}, { 1: { id: '1' } });
    bindSsrmTicks(p, grid as never, { countCheckMs: 10 });
    p.emitTick({ kind: 'rowDelta', upserts: [{ id: '2' }] });
    await vi.advanceTimersByTimeAsync(11);
    expect(p.getRowCount).toHaveBeenCalledTimes(1);
    expect(grid.refreshServerSide).not.toHaveBeenCalled();
  });

  it('forwards the live filter and quick filter to the count', async () => {
    vi.useFakeTimers();
    const p = provider(5);
    const grid = api({
      getFilterModel: () => ({ desk: { filterType: 'text', type: 'equals', filter: 'A' } }),
      getColumnState: () => [],
      getGridOption: (key: string) => (key === 'quickFilterText' ? 'ann' : undefined),
      getRowNode: () => undefined,
    }, {});
    bindSsrmTicks(p, grid as never, { countCheckMs: 10, positionalRefreshMs: 5 });
    // A filter is a key column, so unknown rows take the positional path —
    // and removals mark the count dirty as well.
    p.emitTick({ kind: 'rowDelta', upserts: [], removals: ['7'] });
    await vi.advanceTimersByTimeAsync(11);
    // Structural view: the slow positional refresh covers the count.
    expect(p.getRowCount).not.toHaveBeenCalled();
    expect(grid.refreshServerSide).toHaveBeenCalledWith({ purge: false });
  });

  it('skips the count check while grouped and after a purge', async () => {
    vi.useFakeTimers();
    const p = provider(9);
    const grid = api({ getRowGroupColumns: () => [{ getColId: () => 'desk' }] }, { 1: { id: '1' } });
    bindSsrmTicks(p, grid as never, { countCheckMs: 10, positionalRefreshMs: 1000 });
    p.emitTick({ kind: 'rowDelta', upserts: [{ id: '2' }] });
    p.emitStatus('ready');
    await vi.advanceTimersByTimeAsync(11);
    expect(p.getRowCount).not.toHaveBeenCalled();
  });
});
