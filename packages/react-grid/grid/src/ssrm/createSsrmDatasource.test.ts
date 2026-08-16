import { describe, expect, it, vi } from 'vitest';
import type { IServerSideGetRowsParams } from 'ag-grid-community';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import { createSsrmDatasource } from './createSsrmDatasource.js';

type ViewportCall = Parameters<ISsrmDataProvider['setViewport']>;

function harness(rowData: Record<string, unknown>[] = [{ id: 'a' }]) {
  const viewportCalls: ViewportCall[] = [];
  const provider = {
    getRows: vi.fn(async () => ({ rowData, rowCount: rowData.length })),
    setViewport: vi.fn(async (...args: ViewportCall) => {
      viewportCalls.push(args);
    }),
  } as unknown as ISsrmDataProvider;

  const ds = createSsrmDatasource(provider, { keyColumn: 'id' });

  const load = (request: Record<string, unknown>) => {
    const params = {
      request,
      api: { isDestroyed: () => false },
      success: vi.fn(),
      fail: vi.fn(),
    } as unknown as IServerSideGetRowsParams;
    ds.getRows(params);
    // Let the provider promise settle.
    return new Promise((r) => setTimeout(r, 0));
  };

  return { provider, viewportCalls, load };
}

const baseRequest = {
  startRow: 0,
  endRow: 100,
  filterModel: {},
  sortModel: [],
  groupKeys: [],
  rowGroupCols: [],
  valueCols: [],
  pivotCols: [],
  pivotMode: false,
};

describe('createSsrmDatasource viewport scope', () => {
  it('identifies each block so interest accumulates instead of replacing', async () => {
    const { viewportCalls, load } = harness();

    await load({ ...baseRequest, startRow: 0, endRow: 100 });
    await load({ ...baseRequest, startRow: 100, endRow: 200 });

    expect(viewportCalls).toHaveLength(2);
    const [, firstScope] = viewportCalls[0];
    const [, secondScope] = viewportCalls[1];
    expect(firstScope?.blockKey).toBeDefined();
    expect(secondScope?.blockKey).toBeDefined();
    // Different blocks of the same query.
    expect(firstScope?.blockKey).not.toBe(secondScope?.blockKey);
    expect(firstScope?.queryId).toBe(secondScope?.queryId);
  });

  it('changes the query id when the filter model changes', async () => {
    const { viewportCalls, load } = harness();

    await load({ ...baseRequest });
    await load({
      ...baseRequest,
      filterModel: { book: { filterType: 'text', type: 'equals', filter: 'A' } },
    });

    expect(viewportCalls[0][1]?.queryId).not.toBe(viewportCalls[1][1]?.queryId);
  });

  it('changes the query id when the sort model changes', async () => {
    const { viewportCalls, load } = harness();

    await load({ ...baseRequest });
    await load({ ...baseRequest, sortModel: [{ colId: 'pnl', sort: 'desc' }] });

    expect(viewportCalls[0][1]?.queryId).not.toBe(viewportCalls[1][1]?.queryId);
  });

  it('keeps the same query id when only the block range moves', async () => {
    const { viewportCalls, load } = harness();

    await load({ ...baseRequest, startRow: 0, endRow: 100 });
    await load({ ...baseRequest, startRow: 200, endRow: 300 });

    expect(viewportCalls[0][1]?.queryId).toBeDefined();
    expect(viewportCalls[0][1]?.queryId).toBe(viewportCalls[1][1]?.queryId);
  });

  it('reports no filter for an unfiltered query', async () => {
    const { viewportCalls, load } = harness();

    await load({ ...baseRequest });

    expect(viewportCalls[0][1]?.hasFilter).toBe(false);
  });

  it('reports a filter when a column filter is set', async () => {
    const { viewportCalls, load } = harness();

    await load({
      ...baseRequest,
      filterModel: { book: { filterType: 'text', type: 'equals', filter: 'A' } },
    });

    expect(viewportCalls[0][1]?.hasFilter).toBe(true);
  });

  it('reports a filter when only the quick filter is set', async () => {
    const provider = {
      getRows: vi.fn(async () => ({ rowData: [{ id: 'a' }], rowCount: 1 })),
      setViewport: vi.fn(async () => {}),
    } as unknown as ISsrmDataProvider;
    const ds = createSsrmDatasource(provider, {
      keyColumn: 'id',
      getQuickFilterText: () => 'abc',
    });

    ds.getRows({
      request: baseRequest,
      api: { isDestroyed: () => false },
      success: vi.fn(),
      fail: vi.fn(),
    } as unknown as IServerSideGetRowsParams);
    await new Promise((r) => setTimeout(r, 0));

    const scope = (provider.setViewport as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][1] as { hasFilter?: boolean };
    expect(scope.hasFilter).toBe(true);
  });

  it('scopes group-level blocks by their group keys', async () => {
    const { viewportCalls, load } = harness();

    await load({ ...baseRequest, groupKeys: ['A'] });
    await load({ ...baseRequest, groupKeys: ['B'] });

    expect(viewportCalls[0][1]?.blockKey).not.toBe(
      viewportCalls[1][1]?.blockKey,
    );
  });
});

// ─── Request hygiene (roadmap Phase 1) ─────────────────────────────────────

/**
 * The request AG Grid hands over is not always postable. `createStoreParams`
 * builds `valueCols` with `aggFunc: col.aggFunc` — the column's LIVE value,
 * which for a custom aggregation is a compiled closure. A function cannot be
 * structured-cloned, so posting it to the SharedWorker threw `DataCloneError`
 * and every block of the grid failed to load.
 */
function requestHarness(options: Parameters<typeof createSsrmDatasource>[1] = {}) {
  const provider = {
    getRows: vi.fn(async () => ({ rowData: [{ id: 'a' }], rowCount: 1 })),
    setViewport: vi.fn(async () => {}),
  } as unknown as ISsrmDataProvider;
  const ds = createSsrmDatasource(provider, { keyColumn: 'id', ...options });

  const load = (request: Record<string, unknown>, api: Record<string, unknown> = {}) => {
    ds.getRows({
      request,
      api: { isDestroyed: () => false, ...api },
      success: vi.fn(),
      fail: vi.fn(),
    } as unknown as IServerSideGetRowsParams);
    return new Promise((r) => setTimeout(r, 0));
  };

  const sent = () =>
    (provider.getRows as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as
      | Record<string, unknown>
      | undefined;

  return { provider, load, sent };
}

describe('createSsrmDatasource request hygiene', () => {
  it('drops a value column whose aggFunc is a compiled closure', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { load, sent } = requestHarness();

    await load({
      ...baseRequest,
      valueCols: [
        { id: 'px', field: 'px', aggFunc: 'sum' },
        { id: 'spread', field: 'spread', aggFunc: () => 42 },
      ],
    });

    expect(sent()?.valueCols).toEqual([{ id: 'px', field: 'px', aggFunc: 'sum' }]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('spread');
    warn.mockRestore();
  });

  it('warns once per column, not once per block', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { load } = requestHarness();
    const request = {
      ...baseRequest,
      valueCols: [{ id: 'spread', field: 'spread', aggFunc: () => 42 }],
    };
    await load(request);
    await load({ ...request, startRow: 100, endRow: 200 });
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('leaves an ordinary valueCols array untouched', async () => {
    const { load, sent } = requestHarness();
    const valueCols = [{ id: 'px', field: 'px', aggFunc: 'sum' }];
    await load({ ...baseRequest, valueCols });
    expect(sent()?.valueCols).toBe(valueCols);
  });

  it('sends the visible column scope with an active quick filter', async () => {
    const { load, sent } = requestHarness({ getQuickFilterText: () => 'abc' });
    await load({ ...baseRequest }, {
      getGridOption: () => false,
      getAllDisplayedColumns: () => [
        { getColId: () => 'book', getColDef: () => ({ field: 'book' }) },
      ],
      getColumns: () => [
        { getColId: () => 'book', getColDef: () => ({ field: 'book' }) },
        { getColId: () => 'hidden', getColDef: () => ({ field: 'hidden' }) },
      ],
    });
    expect(sent()?.quickFilterText).toBe('abc');
    expect(sent()?.quickFilterColumns).toEqual(['book']);
  });

  it('sends no column scope when no quick filter is running', async () => {
    const { load, sent } = requestHarness();
    await load({ ...baseRequest }, {
      getGridOption: () => false,
      getAllDisplayedColumns: () => [
        { getColId: () => 'book', getColDef: () => ({ field: 'book' }) },
      ],
    });
    expect(sent()).not.toHaveProperty('quickFilterColumns');
    expect(sent()).not.toHaveProperty('quickFilterText');
  });
});

describe('createSsrmDatasource result and failure paths', () => {
  it('defaults the key column and falls back to the group key for interest', async () => {
    const provider = {
      getRows: vi.fn(async () => ({
        rowData: [{ id: 'a' }, { __ssrmGroupKey: 'GRP' }, { neither: 1 }],
        rowCount: 3,
        grandTotalData: { px: 7 },
        pivotResultFields: ['A_px'],
      })),
      setViewport: vi.fn(async () => {}),
    } as unknown as ISsrmDataProvider;
    const ds = createSsrmDatasource(provider); // no keyColumn, no pivot separator
    const success = vi.fn();
    ds.getRows({
      request: baseRequest,
      api: { isDestroyed: () => false },
      success,
      fail: vi.fn(),
    } as unknown as IServerSideGetRowsParams);
    await new Promise((r) => setTimeout(r, 0));

    const keys = (provider.setViewport as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as string[];
    expect(keys).toEqual(['a', 'GRP']);
    expect(success).toHaveBeenCalledWith(
      expect.objectContaining({
        rowCount: 3,
        groupData: { px: 7 },
        pivotResultFields: ['A_px'],
      }),
    );
  });

  it('sends no column scope when the grid cannot report its columns', async () => {
    const { load, sent } = requestHarness({ getQuickFilterText: () => 'abc' });
    await load({ ...baseRequest }, {
      getGridOption: () => false,
      getAllDisplayedColumns: () => [],
    });
    expect(sent()?.quickFilterText).toBe('abc');
    expect(sent()).not.toHaveProperty('quickFilterColumns');
  });

  it('names an unlabelled value column in the custom-aggregation warning', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { load, sent } = requestHarness();
    await load({ ...baseRequest, valueCols: [{ aggFunc: () => 1 }] });
    expect(sent()?.valueCols).toEqual([]);
    expect(String(warn.mock.calls[0][0])).toContain('unnamed column');
    warn.mockRestore();
  });

  it('fails the block when the provider rejects, and reports why', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const provider = {
      getRows: vi.fn(async () => {
        throw new Error('This grid filters on the server, which does not support…');
      }),
      setViewport: vi.fn(async () => {}),
    } as unknown as ISsrmDataProvider;
    const ds = createSsrmDatasource(provider, { keyColumn: 'id' });
    const fail = vi.fn();
    ds.getRows({
      request: baseRequest,
      api: { isDestroyed: () => false },
      success: vi.fn(),
      fail,
    } as unknown as IServerSideGetRowsParams);
    await new Promise((r) => setTimeout(r, 0));

    expect(fail).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('stays silent for a superseded request and for a destroyed grid', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const make = (message: string, destroyed: boolean) => {
      const provider = {
        getRows: vi.fn(async () => {
          throw new Error(message);
        }),
        setViewport: vi.fn(async () => {}),
      } as unknown as ISsrmDataProvider;
      const fail = vi.fn();
      createSsrmDatasource(provider, { keyColumn: 'id' }).getRows({
        request: baseRequest,
        api: { isDestroyed: () => destroyed },
        success: vi.fn(),
        fail,
      } as unknown as IServerSideGetRowsParams);
      return fail;
    };
    const superseded = make('superseded', false);
    const destroyed = make('anything', true);
    await new Promise((r) => setTimeout(r, 0));

    expect(superseded).not.toHaveBeenCalled();
    expect(destroyed).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('drops a resolved block for a grid destroyed while it was in flight', async () => {
    let destroyed = false;
    const provider = {
      getRows: vi.fn(async () => ({ rowData: [{ id: 'a' }], rowCount: 1 })),
      setViewport: vi.fn(async () => {}),
    } as unknown as ISsrmDataProvider;
    const success = vi.fn();
    createSsrmDatasource(provider, { keyColumn: 'id' }).getRows({
      request: baseRequest,
      api: { isDestroyed: () => destroyed },
      success,
      fail: vi.fn(),
    } as unknown as IServerSideGetRowsParams);
    destroyed = true;
    await new Promise((r) => setTimeout(r, 0));
    expect(success).not.toHaveBeenCalled();
  });
});
