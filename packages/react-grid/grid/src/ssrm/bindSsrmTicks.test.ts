import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import { bindSsrmTicks } from './bindSsrmTicks.js';

afterEach(() => {
  vi.useRealTimers();
});

function provider() {
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
  getRowCount: vi.fn(() => Promise.resolve({ rowCount: 0 })),
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

function api(overrides: Record<string, unknown> = {}) {
  return {
    refreshServerSide: vi.fn(),
    applyServerSideTransactionAsync: vi.fn(),
    getColumnState: vi.fn(() => []),
    getRowGroupColumns: vi.fn(() => []),
    isDestroyed: vi.fn(() => false),
    ...overrides,
  };
}

describe('bindSsrmTicks', () => {
  it('purges the SSRM cache when the provider becomes ready', () => {
    const p = provider();
    const grid = api();
    bindSsrmTicks(p, grid as never);
    p.emitStatus('ready');
    expect(grid.refreshServerSide).toHaveBeenCalledWith({ purge: true });
  });

  it('purges when the provider signals a refresh (Refresh view / Reload from source)', () => {
    const p = provider();
    const grid = api();
    const off = bindSsrmTicks(p, grid as never);
    p.emitRefresh();
    expect(grid.refreshServerSide).toHaveBeenCalledWith({ purge: true });

    off();
    grid.refreshServerSide.mockClear();
    p.emitRefresh();
    expect(grid.refreshServerSide).not.toHaveBeenCalled();
  });

  it('applies leaf upserts as a server-side transaction', () => {
    const p = provider();
    const grid = api();
    bindSsrmTicks(p, grid as never);
    p.emitTick({ kind: 'rowDelta', upserts: [{ id: '1' }] });
    expect(grid.applyServerSideTransactionAsync).toHaveBeenCalledWith({ update: [{ id: '1' }] });
  });

  it('soft-refreshes when a sort is active instead of applying a transaction', () => {
    vi.useFakeTimers();
    const p = provider();
    const grid = api({ getColumnState: () => [{ sort: 'asc' }] });
    bindSsrmTicks(p, grid as never, { refreshThrottleMs: 10 });
    p.emitTick({ kind: 'rowDelta', upserts: [{ id: '1' }] });
    expect(grid.applyServerSideTransactionAsync).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10);
    expect(grid.refreshServerSide).toHaveBeenCalledWith({ purge: false });
  });

  it('schedules a refresh for group deltas and resets', () => {
    vi.useFakeTimers();
    const p = provider();
    const grid = api();
    bindSsrmTicks(p, grid as never, { refreshThrottleMs: 10 });
    p.emitTick({ kind: 'groupDelta', groups: [] });
    p.emitTick({ kind: 'rowDelta', reset: true, upserts: [{ id: '1' }] });
    vi.advanceTimersByTime(10);
    expect(grid.refreshServerSide).toHaveBeenCalledTimes(1);
  });

  it('refreshes after a leaf update when the grid is grouped', () => {
    vi.useFakeTimers();
    const p = provider();
    const grid = api({ getRowGroupColumns: () => [{ getColId: () => 'desk' }] });
    bindSsrmTicks(p, grid as never, { refreshThrottleMs: 10 });
    p.emitTick({ kind: 'rowDelta', upserts: [{ id: '1' }] });
    vi.advanceTimersByTime(10);
    expect(grid.refreshServerSide).toHaveBeenCalledWith({ purge: false });
  });

  it('falls back to a soft refresh when apply throws', () => {
    vi.useFakeTimers();
    const p = provider();
    const grid = api({
      applyServerSideTransactionAsync: vi.fn(() => { throw new Error('gone'); }),
    });
    bindSsrmTicks(p, grid as never, { refreshThrottleMs: 10 });
    p.emitTick({ kind: 'rowDelta', upserts: [{ id: '1' }] });
    vi.advanceTimersByTime(10);
    expect(grid.refreshServerSide).toHaveBeenCalledWith({ purge: false });
  });

  it('ignores empty upserts and ticks after unbind / destroy', () => {
    const p = provider();
    const grid = api();
    const off = bindSsrmTicks(p, grid as never);
    p.emitTick({ kind: 'rowDelta', upserts: [] });
    expect(grid.applyServerSideTransactionAsync).not.toHaveBeenCalled();
    off();
    p.emitTick({ kind: 'rowDelta', upserts: [{ id: '1' }] });
    p.emitStatus('ready');
    expect(grid.applyServerSideTransactionAsync).not.toHaveBeenCalled();
    expect(grid.refreshServerSide).not.toHaveBeenCalled();
  });

  it('treats getColumnState failures as unsorted', () => {
    const p = provider();
    const grid = api({
      getColumnState: () => { throw new Error('api'); },
    });
    bindSsrmTicks(p, grid as never);
    p.emitTick({ kind: 'rowDelta', upserts: [{ id: '1' }] });
    expect(grid.applyServerSideTransactionAsync).toHaveBeenCalled();
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
