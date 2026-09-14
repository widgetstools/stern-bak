import { describe, expect, it, vi } from 'vitest';
import type { IServerSideGetRowsParams } from 'ag-grid-community';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import { createSsrmDatasource } from './createSsrmDatasource.js';
import { SsrmBlockCache, ssrmViewKey } from './SsrmBlockCache.js';

const liveApi = () => ({
  isDestroyed: () => false,
  getGridOption: (k: string) => (k === 'getRowId' ? (p: { data: { id: string } }) => p.data.id : undefined),
  applyServerSideTransactionAsync: vi.fn(),
  refreshServerSide: vi.fn(),
});

describe('createSsrmDatasource — block cache', () => {
  const rowsFor = (start: number, end: number, rowCount = 1000) => ({
    rowData: Array.from({ length: Math.min(end, rowCount) - start }, (_, i) => ({ id: `r${start + i}`, px: 1 })),
    rowCount,
  });

  it('serves a warm block without a provider round trip, re-reads it in the background and warms the next block', async () => {
    const getRows = vi.fn(async (req: { startRow?: number; endRow?: number }) => rowsFor(req.startRow ?? 0, req.endRow ?? 0));
    const cache = new SsrmBlockCache();
    const ds = createSsrmDatasource(provider({ getRows }), { cache, prefetchBlocks: 1 });
    const api = liveApi();
    const first = vi.fn();
    ds.getRows({ request: { startRow: 0, endRow: 200 }, success: first, fail: vi.fn(), api } as unknown as IServerSideGetRowsParams);
    await vi.waitFor(() => expect(first).toHaveBeenCalled());
    // The block itself plus the prefetch of the next one.
    await vi.waitFor(() => expect(getRows).toHaveBeenCalledTimes(2));
    expect(getRows.mock.calls[1][0]).toMatchObject({ startRow: 200, endRow: 400 });
    await vi.waitFor(() => expect(cache.has(ssrmViewKey({}), 200)).toBe(true));

    // Scrolling onto the prefetched block: served from cache, then revalidated, then block 400 warmed.
    getRows.mockClear();
    const second = vi.fn();
    ds.getRows({ request: { startRow: 200, endRow: 400 }, success: second, fail: vi.fn(), api } as unknown as IServerSideGetRowsParams);
    await vi.waitFor(() => expect(second).toHaveBeenCalled());
    expect(second.mock.calls[0][0].rowData[0]).toEqual({ id: 'r200', px: 1 });
    await vi.waitFor(() => expect(getRows).toHaveBeenCalledTimes(2));
    expect(getRows.mock.calls.map((c) => c[0].startRow).sort()).toEqual([200, 400]);
  });

  it('patches rows that drifted between the cached copy and the re-read', async () => {
    let px = 1;
    const getRows = vi.fn(async (req: { startRow?: number; endRow?: number }) => ({
      rowData: [{ id: 'a', px }, { id: 'b', px: 1 }],
      rowCount: 2,
    }));
    const cache = new SsrmBlockCache();
    const ds = createSsrmDatasource(provider({ getRows }), { cache, prefetchBlocks: 0 });
    const api = liveApi();
    const first = vi.fn();
    ds.getRows({ request: { startRow: 0, endRow: 200 }, success: first, fail: vi.fn(), api } as unknown as IServerSideGetRowsParams);
    await vi.waitFor(() => expect(first).toHaveBeenCalled());
    px = 7;
    const second = vi.fn();
    ds.getRows({ request: { startRow: 0, endRow: 200 }, success: second, fail: vi.fn(), api } as unknown as IServerSideGetRowsParams);
    await vi.waitFor(() => expect(second).toHaveBeenCalled());
    expect(second.mock.calls[0][0].rowData[0]).toEqual({ id: 'a', px: 1 }); // served warm
    await vi.waitFor(() => expect(api.applyServerSideTransactionAsync).toHaveBeenCalledWith({ update: [{ id: 'a', px: 7 }] }));
    expect(cache.get(ssrmViewKey({}), 0)?.rowData[0]).toEqual({ id: 'a', px: 7 });
  });

  it('holds the first read while the provider is still loading', async () => {
    const statusHandlers = new Set<(s: string) => void>();
    let status = 'loading';
    const getRows = vi.fn(async () => ({ rowData: [{ id: '1' }], rowCount: 1 }));
    const p = provider({
      getRows,
      onStatus: vi.fn((h: (s: string) => void) => { statusHandlers.add(h); return () => statusHandlers.delete(h); }),
    });
    Object.defineProperty(p, 'status', { get: () => status });
    const ds = createSsrmDatasource(p, { readyTimeoutMs: 5000 });
    const success = vi.fn();
    ds.getRows({ request: { startRow: 0, endRow: 10 }, success, fail: vi.fn(), api: liveApi() } as unknown as IServerSideGetRowsParams);
    await new Promise((r) => setTimeout(r, 20));
    expect(getRows).not.toHaveBeenCalled();
    status = 'ready';
    for (const h of statusHandlers) h('ready');
    await vi.waitFor(() => expect(success).toHaveBeenCalled());
    // Later blocks are not held.
    ds.getRows({ request: { startRow: 10, endRow: 20 }, success: vi.fn(), fail: vi.fn(), api: liveApi() } as unknown as IServerSideGetRowsParams);
    await vi.waitFor(() => expect(getRows).toHaveBeenCalledTimes(2));
  });
});

function provider(impl: Partial<ISsrmDataProvider> = {}): ISsrmDataProvider {
  return {
    id: 'p1',
    start: vi.fn(),
    stop: vi.fn(),
    restart: vi.fn(),
    getConfig: vi.fn(),
    getColumnDefs: vi.fn(() => []),
    getRows: vi.fn(async () => ({ rowData: [{ id: '1' }], rowCount: 1 })),
    getColumnValues: vi.fn(async () => ({ column: 'c', values: [], truncated: false })),
    getRowCount: vi.fn(async () => ({ rowCount: 0 })),
    getAggregates: vi.fn(async () => ({ values: {} })),
    watchGroups: vi.fn(),
    onSsrmTick: vi.fn(() => () => undefined),
    onRowsReceived: vi.fn(() => () => undefined),
    onStatus: vi.fn(() => () => undefined),
    onError: vi.fn(() => () => undefined),
    ...impl,
  };
}

describe('createSsrmDatasource', () => {
  it('calls success with rowData and rowCount', async () => {
    const ds = createSsrmDatasource(provider());
    const success = vi.fn();
    const fail = vi.fn();
    ds.getRows({
      request: { startRow: 0, endRow: 100 },
      success,
      fail,
      api: { isDestroyed: () => false },
    } as unknown as IServerSideGetRowsParams);
    await vi.waitFor(() => expect(success).toHaveBeenCalled());
    expect(success.mock.calls[0][0]).toMatchObject({ rowCount: 1, rowData: [{ id: '1' }] });
    expect(fail).not.toHaveBeenCalled();
  });

  it('calls fail when getRows rejects', async () => {
    const ds = createSsrmDatasource(provider({
      getRows: vi.fn(async () => { throw new Error('boom'); }),
    }));
    const success = vi.fn();
    const fail = vi.fn();
    ds.getRows({
      request: { startRow: 0, endRow: 100 },
      success,
      fail,
      api: { isDestroyed: () => false },
    } as unknown as IServerSideGetRowsParams);
    await vi.waitFor(() => expect(fail).toHaveBeenCalled());
    expect(success).not.toHaveBeenCalled();
  });

  it('maps groupData onto groupLevelInfo and forwards grand totals', async () => {
    const ds = createSsrmDatasource(provider({
      getRows: vi.fn(async () => ({
        rowData: [{ desk: 'A' }],
        rowCount: 1,
        groupData: { childCount: 4 },
        grandTotalData: { qty: 10 },
        pivotResultFields: ['p1'],
      })),
    }));
    const success = vi.fn();
    ds.getRows({
      request: { startRow: 0, endRow: 100 },
      success,
      fail: vi.fn(),
      api: { isDestroyed: () => false },
    } as unknown as IServerSideGetRowsParams);
    await vi.waitFor(() => expect(success).toHaveBeenCalled());
    expect(success.mock.calls[0][0]).toMatchObject({
      groupLevelInfo: { childCount: 4 },
      grandTotalData: { qty: 10 },
      pivotResultFields: ['p1'],
    });
  });

  it('holds the filter off the first block so grouped rows can paint', async () => {
    const getRows = vi.fn(async () => ({ rowData: [{ trader: 'Ann' }], rowCount: 1 }));
    const ds = createSsrmDatasource(provider({ getRows }));
    const request = {
      startRow: 0,
      endRow: 100,
      rowGroupCols: [{ id: 'trader' }],
      filterModel: { desk: { filterType: 'set', values: ['Govies'] } },
    };

    const firstSuccess = vi.fn();
    ds.getRows({
      request,
      success: firstSuccess,
      fail: vi.fn(),
      api: { isDestroyed: () => false },
    } as unknown as IServerSideGetRowsParams);
    // The datasource only arms after the first block SUCCEEDS, not after the
    // read is issued.
    await vi.waitFor(() => expect(firstSuccess).toHaveBeenCalled());
    expect(getRows.mock.calls[0][0].filterModel).toBeNull();

    ds.getRows({
      request,
      success: vi.fn(),
      fail: vi.fn(),
      api: { isDestroyed: () => false },
    } as unknown as IServerSideGetRowsParams);
    await vi.waitFor(() => expect(getRows).toHaveBeenCalledTimes(2));
    expect(getRows.mock.calls[1][0].filterModel).toEqual({
      desk: { filterType: 'set', values: ['Govies'] },
    });
  });

  it('drops an empty set-filter slot so a stale values callback cannot zero the grid', async () => {
    const getRows = vi.fn(async () => ({ rowData: [], rowCount: 0 }));
    const ds = createSsrmDatasource(provider({ getRows }));
    // First block arms the datasource.
    const firstSuccess = vi.fn();
    ds.getRows({
      request: { startRow: 0, endRow: 10 },
      success: firstSuccess,
      fail: vi.fn(),
      api: { isDestroyed: () => false },
    } as unknown as IServerSideGetRowsParams);
    await vi.waitFor(() => expect(firstSuccess).toHaveBeenCalled());

    ds.getRows({
      request: {
        startRow: 0,
        endRow: 10,
        filterModel: { desk: { filterType: 'set', values: [] } },
      },
      success: vi.fn(),
      fail: vi.fn(),
      api: { isDestroyed: () => false },
    } as unknown as IServerSideGetRowsParams);
    await vi.waitFor(() => expect(getRows).toHaveBeenCalledTimes(2));
    expect(getRows.mock.calls[1][0].filterModel).toBeNull();
  });

  it('keeps text / number conditions and the quick filter on the first block, dropping only set slots', async () => {
    const getRows = vi.fn(async () => ({ rowData: [], rowCount: 0 }));
    const ds = createSsrmDatasource(provider({ getRows }), { getQuickFilterText: () => 'ann' });
    ds.getRows({
      request: {
        startRow: 0,
        endRow: 10,
        filterModel: {
          desk: { filterType: 'set', values: ['Govies'] },
          px: { filterType: 'number', type: 'greaterThan', filter: 1 },
          trader: {
            filterType: 'multi',
            filterModels: [
              { filterType: 'text', type: 'contains', filter: 'x' },
              { filterType: 'set', values: ['B'] },
            ],
          },
          region: { filterType: 'multi', filterModels: [null, { filterType: 'set', values: ['EMEA'] }] },
        },
      },
      success: vi.fn(),
      fail: vi.fn(),
      api: { isDestroyed: () => false },
    } as unknown as IServerSideGetRowsParams);
    await vi.waitFor(() => expect(getRows).toHaveBeenCalledTimes(1));
    expect(getRows.mock.calls[0][0]).toMatchObject({
      quickFilterText: 'ann',
      filterModel: {
        px: { filterType: 'number', type: 'greaterThan', filter: 1 },
        trader: {
          filterType: 'multi',
          filterModels: [{ filterType: 'text', type: 'contains', filter: 'x' }, null],
        },
      },
    });
    expect(getRows.mock.calls[0][0].filterModel).not.toHaveProperty('desk');
    expect(getRows.mock.calls[0][0].filterModel).not.toHaveProperty('region');
  });

  it('retries a failed read before failing the block', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let calls = 0;
    const getRows = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error('worker hiccup');
      return { rowData: [{ id: '1' }], rowCount: 1 };
    });
    const ds = createSsrmDatasource(provider({ getRows }), { retryBackoffMs: 0 });
    const success = vi.fn();
    const fail = vi.fn();
    ds.getRows({
      request: { startRow: 0, endRow: 100 },
      success,
      fail,
      api: { isDestroyed: () => false },
    } as unknown as IServerSideGetRowsParams);
    await vi.waitFor(() => expect(success).toHaveBeenCalled());
    expect(getRows).toHaveBeenCalledTimes(2);
    expect(fail).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('retrying'), expect.any(Error));
    warn.mockRestore();
  });

  it('fails the block once a read that never settles has exhausted its attempts', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const getRows = vi.fn(() => new Promise<never>(() => undefined));
    const ds = createSsrmDatasource(provider({ getRows }), {
      requestTimeoutMs: 5,
      maxAttempts: 2,
      retryBackoffMs: 0,
    });
    const success = vi.fn();
    const fail = vi.fn();
    ds.getRows({
      request: { startRow: 200, endRow: 400 },
      success,
      fail,
      api: { isDestroyed: () => false },
    } as unknown as IServerSideGetRowsParams);
    await vi.waitFor(() => expect(fail).toHaveBeenCalled());
    expect(getRows).toHaveBeenCalledTimes(2);
    expect(success).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('warns once per set of filter conditions the engine could not apply', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ds = createSsrmDatasource(provider({
      getRows: vi.fn(async () => ({
        rowData: [],
        rowCount: 0,
        unsupportedFilters: ['desk: weird (text)'],
      })),
    }));
    const params = {
      request: { startRow: 0, endRow: 10 },
      success: vi.fn(),
      fail: vi.fn(),
      api: { isDestroyed: () => false },
    } as unknown as IServerSideGetRowsParams;
    ds.getRows(params);
    ds.getRows(params);
    await vi.waitFor(() => expect(params.success).toHaveBeenCalledTimes(2));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('MORE rows'), ['desk: weird (text)']);
    warn.mockRestore();
  });

  it('includes quickFilterText when the getter returns a value', async () => {
    const getRows = vi.fn(async () => ({ rowData: [], rowCount: 0 }));
    const ds = createSsrmDatasource(provider({ getRows }), { getQuickFilterText: () => ' ann ' });
    const params = {
      request: { startRow: 0, endRow: 50 },
      success: vi.fn(),
      fail: vi.fn(),
      api: { isDestroyed: () => false },
    } as unknown as IServerSideGetRowsParams;
    ds.getRows(params);
    await vi.waitFor(() => expect(getRows).toHaveBeenCalledTimes(1));
    ds.getRows(params);
    await vi.waitFor(() => expect(getRows).toHaveBeenCalledTimes(2));
    expect(getRows.mock.calls[1][0]).toMatchObject({ quickFilterText: ' ann ' });
  });

  it('does not call success or fail after the grid is destroyed', async () => {
    const ds = createSsrmDatasource(provider());
    const success = vi.fn();
    const fail = vi.fn();
    ds.getRows({
      request: { startRow: 0, endRow: 100 },
      success,
      fail,
      api: { isDestroyed: () => true },
    } as unknown as IServerSideGetRowsParams);
    await vi.waitFor(() => expect(success).not.toHaveBeenCalled());
    expect(fail).not.toHaveBeenCalled();

    const failing = createSsrmDatasource(provider({
      getRows: vi.fn(async () => { throw new Error('boom'); }),
    }));
    failing.getRows({
      request: { startRow: 0, endRow: 100 },
      success,
      fail,
      api: { isDestroyed: () => true },
    } as unknown as IServerSideGetRowsParams);
    await vi.waitFor(() => expect(fail).not.toHaveBeenCalled());
    ds.destroy?.();
  });
});
