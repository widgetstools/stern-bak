import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IServerSideGetRowsParams, IServerSideGetRowsRequest } from 'ag-grid-community';
import type { Table, View, ViewConfigUpdate } from '@perspective-dev/client';
import { PerspectiveSsrmDatasource } from './datasource.js';
import type { FeedTableEvent } from './feedTable.js';
import { CHILD_COUNT_FIELD, ROW_ID_FIELD, ROW_PATH } from './rows.js';
import { INDEX_COLUMN, type PerspectiveSchema } from './schema.js';

const schema: PerspectiveSchema = {
  desk: 'string',
  pnl: 'float',
  [INDEX_COLUMN]: 'string',
};
const leafColumns = Object.keys(schema);

type Responder = (config: ViewConfigUpdate) => {
  columns: Record<string, unknown[]>;
  numRows: number;
};

function fakeTable(respond: Responder): { table: Promise<Table>; viewConfigs: ViewConfigUpdate[] } {
  const viewConfigs: ViewConfigUpdate[] = [];
  const table = {
    view: async (config: ViewConfigUpdate): Promise<View> => {
      viewConfigs.push(config);
      const view = {
        to_columns: async (window?: { start_row?: number; end_row?: number }) => {
          void window;
          return respond(config).columns;
        },
        num_rows: async () => respond(config).numRows,
        column_paths: async () => Object.keys(respond(config).columns),
        delete: async () => {},
      };
      return view as unknown as View;
    },
  };
  return { table: Promise.resolve(table as unknown as Table), viewConfigs };
}

function fakeFeed(): {
  feed: { subscribe: (l: (e: FeedTableEvent) => void) => () => void; getRow: (id: string) => Record<string, unknown> | undefined };
  emit: (e: FeedTableEvent) => void;
  rows: Map<string, Record<string, unknown>>;
} {
  const listeners = new Set<(e: FeedTableEvent) => void>();
  const rows = new Map<string, Record<string, unknown>>();
  return {
    feed: {
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      getRow: (id) => rows.get(id),
    },
    emit: (event) => {
      for (const listener of listeners) listener(event);
    },
    rows,
  };
}

function fakeApi() {
  return {
    isDestroyed: () => false,
    getRenderedNodes: vi.fn(() => [] as unknown[]),
    refreshServerSide: vi.fn(),
    retryServerSideLoads: vi.fn(),
    getRowNode: vi.fn(() => null),
  };
}

function request(over: Partial<IServerSideGetRowsRequest> = {}): IServerSideGetRowsRequest {
  return {
    startRow: 0,
    endRow: 200,
    rowGroupCols: [],
    valueCols: [],
    pivotCols: [],
    pivotMode: false,
    groupKeys: [],
    filterModel: null,
    sortModel: [],
    ...over,
  } as unknown as IServerSideGetRowsRequest;
}

function loadParams(
  api: ReturnType<typeof fakeApi>,
  req: IServerSideGetRowsRequest,
): IServerSideGetRowsParams & { success: ReturnType<typeof vi.fn>; fail: ReturnType<typeof vi.fn> } {
  return {
    request: req,
    parentNode: null,
    api,
    success: vi.fn(),
    fail: vi.fn(),
  } as unknown as IServerSideGetRowsParams & { success: ReturnType<typeof vi.fn>; fail: ReturnType<typeof vi.fn> };
}

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe('PerspectiveSsrmDatasource — block loads', () => {
  it('serves a leaf block as row objects with the exact row count', async () => {
    const { table } = fakeTable(() => ({
      columns: { desk: ['Rates', 'Credit'], pnl: [1, 2], [INDEX_COLUMN]: ['A', 'B'] },
      numRows: 17,
    }));
    const { feed } = fakeFeed();
    const ds = new PerspectiveSsrmDatasource({ table, feed, schema, leafColumns });
    const params = loadParams(fakeApi(), request());
    ds.getRows(params);
    await settle();
    expect(params.fail).not.toHaveBeenCalled();
    const result = params.success.mock.calls[0][0];
    expect(result.rowCount).toBe(17);
    expect(result.rowData).toEqual([
      { desk: 'Rates', pnl: 1, [INDEX_COLUMN]: 'A' },
      { desk: 'Credit', pnl: 2, [INDEX_COLUMN]: 'B' },
    ]);
    ds.destroy();
  });

  it('serves a group level with child counts and stamped group row ids', async () => {
    const { table } = fakeTable(() => ({
      columns: { [ROW_PATH]: [['Rates']], pnl: [10], [CHILD_COUNT_FIELD]: [3] },
      numRows: 1,
    }));
    const { feed } = fakeFeed();
    const ds = new PerspectiveSsrmDatasource({ table, feed, schema, leafColumns });
    const params = loadParams(
      fakeApi(),
      request({ rowGroupCols: [{ id: 'desk', displayName: 'desk', field: 'desk' }] }),
    );
    ds.getRows(params);
    await settle();
    const result = params.success.mock.calls[0][0];
    expect(result.rowData[0].desk).toBe('Rates');
    expect(result.rowData[0][CHILD_COUNT_FIELD]).toBe(3);
    expect(typeof result.rowData[0][ROW_ID_FIELD]).toBe('string');
    ds.destroy();
  });

  it('answers an unmatchable filter with an empty block and no view at all', async () => {
    const { table, viewConfigs } = fakeTable(() => ({ columns: {}, numRows: 0 }));
    const { feed } = fakeFeed();
    const ds = new PerspectiveSsrmDatasource({ table, feed, schema, leafColumns });
    const params = loadParams(
      fakeApi(),
      request({ filterModel: { desk: { filterType: 'set', values: [] } } }),
    );
    ds.getRows(params);
    await settle();
    expect(params.success).toHaveBeenCalledWith({ rowData: [], rowCount: 0 });
    expect(viewConfigs).toHaveLength(0);
    ds.destroy();
  });

  it('fails the block when the engine read throws', async () => {
    const { table } = fakeTable(() => {
      throw new Error('engine exploded');
    });
    const { feed } = fakeFeed();
    const ds = new PerspectiveSsrmDatasource({ table, feed, schema, leafColumns });
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const params = loadParams(fakeApi(), request());
      ds.getRows(params);
      await settle();
      expect(params.fail).toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
    ds.destroy();
  });
});

describe('PerspectiveSsrmDatasource — live updates', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a snapshot event retries failed loads and refreshes open blocks', async () => {
    const { table } = fakeTable(() => ({ columns: { [INDEX_COLUMN]: [] }, numRows: 0 }));
    const { feed, emit } = fakeFeed();
    const ds = new PerspectiveSsrmDatasource({ table, feed, schema, leafColumns });
    const api = fakeApi();
    ds.getRows(loadParams(api, request()));
    emit({ type: 'snapshot' });
    expect(api.retryServerSideLoads).toHaveBeenCalled();
    expect(api.refreshServerSide).toHaveBeenCalledWith({ purge: false });
    ds.destroy();
  });

  it("'refresh' mode debounces updates into refreshServerSide", async () => {
    const { table } = fakeTable(() => ({ columns: { [INDEX_COLUMN]: [] }, numRows: 0 }));
    const { feed, emit } = fakeFeed();
    const ds = new PerspectiveSsrmDatasource({
      table,
      feed,
      schema,
      leafColumns,
      liveUpdates: 'refresh',
      liveUpdateDebounceMs: 100,
    });
    const api = fakeApi();
    const params = loadParams(api, request());
    ds.getRows(params);
    await vi.advanceTimersByTimeAsync(1);
    emit({ type: 'update', rows: new Map([['A', { pnl: 1 }]]) });
    emit({ type: 'update', rows: new Map([['A', { pnl: 2 }]]) });
    expect(api.refreshServerSide).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(150);
    expect(api.refreshServerSide).toHaveBeenCalledTimes(1);
    ds.destroy();
  });

  it("'patch' mode writes ticked rows into rendered leaf nodes without touching the engine", async () => {
    let rootCount = 5;
    const { table } = fakeTable(() => ({
      columns: { desk: [], pnl: [], [INDEX_COLUMN]: [] },
      numRows: rootCount,
    }));
    const { feed, emit } = fakeFeed();
    const ds = new PerspectiveSsrmDatasource({
      table,
      feed,
      schema,
      leafColumns,
      liveUpdateDebounceMs: 50,
    });
    const api = fakeApi();
    const updateData = vi.fn();
    api.getRenderedNodes.mockReturnValue([
      { group: false, data: { [INDEX_COLUMN]: 'A', pnl: 1 }, updateData },
    ]);
    const params = loadParams(api, request());
    ds.getRows(params);
    await vi.advanceTimersByTimeAsync(1);

    const ticked = { [INDEX_COLUMN]: 'A', desk: 'Rates', pnl: 9 };
    emit({ type: 'update', rows: new Map([['A', ticked]]) });
    await vi.advanceTimersByTimeAsync(80);
    expect(updateData).toHaveBeenCalledWith(ticked);
    // Row count unchanged → no reload.
    expect(api.refreshServerSide).not.toHaveBeenCalled();

    // When the top-level count changes, the shape is stale → one reload.
    rootCount = 6;
    emit({ type: 'update', rows: new Map([['A', ticked]]) });
    await vi.advanceTimersByTimeAsync(80);
    expect(api.refreshServerSide).toHaveBeenCalledWith({ purge: false });
    ds.destroy();
  });

  it('patches a row that scrolled back into view from the feed cache', async () => {
    const { table } = fakeTable(() => ({
      columns: { desk: [], pnl: [], [INDEX_COLUMN]: [] },
      numRows: 0,
    }));
    const { feed, emit, rows } = fakeFeed();
    const ds = new PerspectiveSsrmDatasource({
      table,
      feed,
      schema,
      leafColumns,
      liveUpdateDebounceMs: 50,
    });
    const api = fakeApi();
    const updateData = vi.fn();
    rows.set('B', { [INDEX_COLUMN]: 'B', pnl: 42 });
    // 'B' was NOT rendered at the last flush, so it reads as newly visible.
    api.getRenderedNodes.mockReturnValue([
      { group: false, data: { [INDEX_COLUMN]: 'B', pnl: 1 }, updateData },
    ]);
    ds.getRows(loadParams(api, request()));
    await vi.advanceTimersByTimeAsync(1);
    emit({ type: 'update', rows: new Map([['other', { [INDEX_COLUMN]: 'other' }]]) });
    await vi.advanceTimersByTimeAsync(80);
    expect(updateData).toHaveBeenCalledWith({ [INDEX_COLUMN]: 'B', pnl: 42 });
    ds.destroy();
  });
});
