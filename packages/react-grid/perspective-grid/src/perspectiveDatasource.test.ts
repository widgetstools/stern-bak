import { describe, expect, it, vi } from 'vitest';
import {
  cloneRequest,
  columnsToRows,
  createPerspectiveDatasource,
  type PerspectiveViewLike,
  type ServerSideGetRowsParamsLike,
} from './perspectiveDatasource.js';

function makeParams(request: ServerSideGetRowsParamsLike['request'] = { startRow: 0, endRow: 100 }) {
  const success = vi.fn();
  const fail = vi.fn();
  return { request, success, fail } as ServerSideGetRowsParamsLike & {
    success: ReturnType<typeof vi.fn>;
    fail: ReturnType<typeof vi.fn>;
  };
}

function makeView(rows: number, cols = ['positionId', 'price']): PerspectiveViewLike {
  return {
    to_columns: vi.fn(async (w) => {
      const start = w?.start_row ?? 0;
      const end = Math.min(w?.end_row ?? rows, rows);
      const n = Math.max(0, end - start);
      const out: Record<string, unknown[]> = {};
      for (const c of cols) {
        out[c] = Array.from({ length: n }, (_, i) => `${c}${start + i}`);
      }
      return out;
    }),
    num_rows: vi.fn(async () => rows),
  };
}

describe('columnsToRows', () => {
  it('pivots columnar output into row objects', () => {
    expect(columnsToRows({ a: [1, 2], b: ['x', 'y'] })).toEqual([
      { a: 1, b: 'x' },
      { a: 2, b: 'y' },
    ]);
  });

  it('returns [] for an empty column set', () => {
    expect(columnsToRows({})).toEqual([]);
  });

  it('sizes off the LONGEST column so an all-null column cannot truncate the block', () => {
    // `b` is short; the block must still be 3 rows, with b undefined past its end.
    expect(columnsToRows({ a: [1, 2, 3], b: ['x'] })).toEqual([
      { a: 1, b: 'x' },
      { a: 2, b: undefined },
      { a: 3, b: undefined },
    ]);
  });
});

describe('cloneRequest', () => {
  it('deep-copies sortModel/filterModel so AG mutating its shared params cannot corrupt ours', () => {
    const sortModel = [{ colId: 'price', sort: 'asc' }];
    const filterModel = { price: { type: 'greaterThan', filter: 5 } };
    const snapshot = cloneRequest({ startRow: 0, endRow: 10, sortModel, filterModel });

    // AG mutates the SAME objects in place between requests.
    sortModel[0].sort = 'desc';
    (filterModel.price as { filter: number }).filter = 999;

    expect(snapshot.sortModel).toEqual([{ colId: 'price', sort: 'asc' }]);
    expect(snapshot.filterModel).toEqual({ price: { type: 'greaterThan', filter: 5 } });
  });

  it('deep-copies the group fields, which the group levels are rebuilt from', () => {
    const rowGroupCols = [{ id: 'sector' }, { id: 'book' }];
    const valueCols = [{ id: 'pnl', aggFunc: 'sum' }];
    const groupKeys = ['Energy'];
    const snapshot = cloneRequest({ startRow: 0, endRow: 10, rowGroupCols, valueCols, groupKeys });

    rowGroupCols[0].id = 'trader';
    rowGroupCols.length = 1;
    valueCols[0].aggFunc = 'avg';
    groupKeys[0] = 'Technology';

    expect(snapshot.rowGroupCols).toEqual([
      { id: 'sector', field: undefined, displayName: undefined },
      { id: 'book', field: undefined, displayName: undefined },
    ]);
    expect(snapshot.valueCols).toEqual([{ id: 'pnl', field: undefined, aggFunc: 'sum' }]);
    expect(snapshot.groupKeys).toEqual(['Energy']);
  });

  it('leaves the group fields undefined when the request has none (flat blotter)', () => {
    const snapshot = cloneRequest({ startRow: 0, endRow: 10 });
    expect(snapshot.rowGroupCols).toBeUndefined();
    expect(snapshot.valueCols).toBeUndefined();
    expect(snapshot.groupKeys).toBeUndefined();
  });
});

describe('createPerspectiveDatasource', () => {
  it('reads the requested window and returns rows', async () => {
    const view = makeView(1000);
    const ds = createPerspectiveDatasource({ getView: async () => view });
    const params = makeParams({ startRow: 100, endRow: 200 });

    ds.getRows(params);
    await vi.waitFor(() => expect(params.success).toHaveBeenCalled());

    expect(view.to_columns).toHaveBeenCalledWith({ start_row: 100, end_row: 200 });
    const arg = params.success.mock.calls[0][0];
    expect(arg.rowData).toHaveLength(100);
    expect(arg.rowData[0]).toEqual({ positionId: 'positionId100', price: 'price100' });
    // The MEASURED total travels with every block. Withholding it (the old
    // behaviour) left `lastRowIndexKnown: false`, so the store sized itself to
    // what had loaded and the scrollbar spanned ~125 rows of a 20,000-row book.
    expect(arg.rowCount).toBe(1000);
    expect(params.fail).not.toHaveBeenCalled();
  });

  it('finalizes the row count via success({rowCount}) on a short block', async () => {
    const view = makeView(150);
    const ds = createPerspectiveDatasource({ getView: async () => view });
    const params = makeParams({ startRow: 100, endRow: 200 });

    ds.getRows(params);
    await vi.waitFor(() => expect(params.success).toHaveBeenCalled());

    const arg = params.success.mock.calls[0][0];
    expect(arg.rowData).toHaveLength(50);
    expect(arg.rowCount).toBe(150);
  });

  // RULE 1 — a leaked getRows permanently deadlocks the ENTIRE grid, because
  // AG's outboundRequests counter is only decremented inside success/fail.
  it('resolves (never leaks) when the view is null', async () => {
    const ds = createPerspectiveDatasource({ getView: async () => null });
    const params = makeParams();

    ds.getRows(params);
    await vi.waitFor(() => expect(params.success).toHaveBeenCalled());

    // Empty, and crucially NO rowCount — a forced 0 would cap the store forever.
    expect(params.success).toHaveBeenCalledWith({ rowData: [] });
    expect(params.fail).not.toHaveBeenCalled();
  });

  it('resolves (never leaks) when the generation fence is stale', async () => {
    let generation = 1;
    const ds = createPerspectiveDatasource({
      getView: async () => {
        generation = 2; // a refresh landed while this block was in flight
        return makeView(1000);
      },
      getGeneration: () => generation,
    });
    const params = makeParams();

    ds.getRows(params);
    await vi.waitFor(() => expect(params.success).toHaveBeenCalled());

    expect(params.success).toHaveBeenCalledWith({ rowData: [] });
    expect(params.fail).not.toHaveBeenCalled();
  });

  it('calls fail() exactly once when the view throws, releasing the bandwidth counter', async () => {
    const onError = vi.fn();
    const ds = createPerspectiveDatasource({
      getView: async () => ({
        to_columns: async () => {
          throw new Error('view deleted mid-read');
        },
        num_rows: async () => 0,
      }),
      onError,
    });
    const params = makeParams();

    ds.getRows(params);
    await vi.waitFor(() => expect(params.fail).toHaveBeenCalled());

    expect(params.fail).toHaveBeenCalledTimes(1);
    expect(params.success).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
  });

  it('resolves exactly once per getRows across every path', async () => {
    const cases = [
      { getView: async () => makeView(1000) },
      { getView: async () => null },
      {
        getView: async () => {
          throw new Error('boom');
        },
      },
    ];

    for (const opts of cases) {
      const ds = createPerspectiveDatasource({ ...opts, onError: () => {} });
      const params = makeParams();
      ds.getRows(params);
      await vi.waitFor(() =>
        expect(params.success.mock.calls.length + params.fail.mock.calls.length).toBe(1),
      );
      expect(params.success.mock.calls.length + params.fail.mock.calls.length).toBe(1);
    }
  });
});

describe('createPerspectiveDatasource — grand total', () => {
  it('attaches grandTotalData to a root-level block', async () => {
    const view = makeView(1000);
    const params = makeParams({ startRow: 0, endRow: 100, groupKeys: [] });
    const datasource = createPerspectiveDatasource({
      getView: async () => view,
      getGrandTotal: async () => ({ pnl: 42 }),
    });

    datasource.getRows(params);
    await vi.waitFor(() => expect(params.success).toHaveBeenCalled());

    expect(params.success.mock.calls[0][0].grandTotalData).toEqual({ pnl: 42 });
  });

  it('does not ask for a total on a nested group level — there is only one', async () => {
    const view = makeView(1000);
    const getGrandTotal = vi.fn(async () => ({ pnl: 42 }));
    const params = makeParams({ startRow: 0, endRow: 100, groupKeys: ['Energy'] });
    const datasource = createPerspectiveDatasource({ getView: async () => view, getGrandTotal });

    datasource.getRows(params);
    await vi.waitFor(() => expect(params.success).toHaveBeenCalled());

    expect(getGrandTotal).not.toHaveBeenCalled();
    expect(params.success.mock.calls[0][0].grandTotalData).toBeUndefined();
  });

  it('still settles the rows when the total fails — a total must never cost a block', async () => {
    const view = makeView(1000);
    const onError = vi.fn();
    const params = makeParams({ startRow: 0, endRow: 100 });
    const datasource = createPerspectiveDatasource({
      getView: async () => view,
      getGrandTotal: async () => {
        throw new Error('totals view died');
      },
      onError,
    });

    datasource.getRows(params);
    await vi.waitFor(() => expect(params.success).toHaveBeenCalled());

    expect(params.success).toHaveBeenCalledTimes(1);
    expect(params.fail).not.toHaveBeenCalled();
    expect(params.success.mock.calls[0][0].rowData).toHaveLength(100);
    expect(params.success.mock.calls[0][0].grandTotalData).toBeUndefined();
    expect(onError).toHaveBeenCalled();
  });

  it('omits grandTotalData when the supplier returns null, rather than sending null', async () => {
    const view = makeView(1000);
    const params = makeParams({ startRow: 0, endRow: 100 });
    const datasource = createPerspectiveDatasource({
      getView: async () => view,
      getGrandTotal: async () => null,
    });

    datasource.getRows(params);
    await vi.waitFor(() => expect(params.success).toHaveBeenCalled());
    expect(params.success.mock.calls[0][0]).not.toHaveProperty('grandTotalData');
  });
});

describe('createPerspectiveDatasource — row count', () => {
  // THE scrollbar bug: without a total, AG leaves `lastRowIndexKnown: false`
  // and sizes the store to what has loaded, so dragging the thumb to the
  // bottom lands ~125 rows into a 20,000-row book instead of at the end.
  it('reports the measured total on a mid-book block, not just the last one', async () => {
    const view = makeView(20_000);
    const ds = createPerspectiveDatasource({ getView: async () => view });
    const params = makeParams({ startRow: 5_000, endRow: 5_100 });

    ds.getRows(params);
    await vi.waitFor(() => expect(params.success).toHaveBeenCalled());

    expect(params.success.mock.calls[0][0].rowCount).toBe(20_000);
  });

  it('falls back to the short-block signal when the view cannot report a total', async () => {
    const view: PerspectiveViewLike = {
      to_columns: async () => ({ positionId: ['a', 'b'] }),
      num_rows: async () => {
        throw new Error('num_rows unavailable');
      },
    };
    const ds = createPerspectiveDatasource({ getView: async () => view });
    const params = makeParams({ startRow: 100, endRow: 200 });

    ds.getRows(params);
    await vi.waitFor(() => expect(params.success).toHaveBeenCalled());

    // 2 rows for a 100-row request => the book ends at 102.
    expect(params.success.mock.calls[0][0].rowCount).toBe(102);
  });

  it('still omits rowCount on an empty resolution, which would cap the store', async () => {
    // A fabricated total is the trap; a measured one is the fix. Stale and
    // missing views must keep fabricating nothing.
    const ds = createPerspectiveDatasource({ getView: async () => null });
    const params = makeParams({ startRow: 300, endRow: 400 });

    ds.getRows(params);
    await vi.waitFor(() => expect(params.success).toHaveBeenCalled());

    expect(params.success).toHaveBeenCalledWith({ rowData: [] });
  });
});
