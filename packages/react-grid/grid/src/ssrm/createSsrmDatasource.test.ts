import { describe, expect, it, vi } from 'vitest';
import type { IServerSideGetRowsParams } from 'ag-grid-community';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import { createSsrmDatasource } from './createSsrmDatasource.js';

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

    ds.getRows({
      request,
      success: vi.fn(),
      fail: vi.fn(),
      api: { isDestroyed: () => false },
    } as unknown as IServerSideGetRowsParams);
    await vi.waitFor(() => expect(getRows).toHaveBeenCalledTimes(1));
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
    ds.getRows({
      request: { startRow: 0, endRow: 10 },
      success: vi.fn(),
      fail: vi.fn(),
      api: { isDestroyed: () => false },
    } as unknown as IServerSideGetRowsParams);
    await vi.waitFor(() => expect(getRows).toHaveBeenCalledTimes(1));

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
