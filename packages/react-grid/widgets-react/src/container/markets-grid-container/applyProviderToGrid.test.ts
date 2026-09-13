import { describe, expect, it, vi } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import {
  clearPendingAddsFromTransaction,
  createApplyProviderToGridState,
  splitProviderRowsForGrid,
} from './applyProviderToGrid.js';

type Row = { id: string; price?: number };

function makeGridApi(opts: {
  existingIds?: Set<string>;
  /** Node data per existing id (defaults to `{ id }`); the object identity matters for the in-place path. */
  data?: Map<string, Row>;
  rendered?: string[];
  sort?: string[];
  onApply?: (tx: { add?: Row[]; update?: Row[] }, cb?: (result: { add: { id: string }[] }) => void) => void;
} = {}): GridApi<Row> & { refreshCells: ReturnType<typeof vi.fn> } {
  const existing = opts.existingIds ?? new Set<string>();
  const nodes = new Map<string, { id: string; data: Row; group: boolean }>();
  const nodeFor = (id: string) => {
    let n = nodes.get(id);
    if (!n) { n = { id, data: opts.data?.get(id) ?? { id }, group: false }; nodes.set(id, n); }
    return n;
  };
  const applyTransactionAsync = vi.fn((
    tx: { add?: Row[]; update?: Row[] },
    cb?: (result: { add: { id: string }[] }) => void,
  ) => {
    if (opts.onApply) {
      opts.onApply(tx, cb);
      return;
    }
    // Default: defer callback so pending-add bookkeeping is observable.
  });

  return {
    applyTransactionAsync,
    getRowNode: (id: string) => (existing.has(id) ? nodeFor(id) as never : null),
    getRenderedNodes: () => (opts.rendered ?? []).filter((id) => existing.has(id)).map(nodeFor),
    refreshCells: vi.fn(),
    getGridOption: () => undefined,
    isPivotMode: () => false,
    getAdvancedFilterModel: () => null,
    getColumnState: () => (opts.sort ?? []).map((colId) => ({ colId, sort: 'asc' })),
    getFilterModel: () => ({}),
    getRowGroupColumns: () => [],
    getValueColumns: () => [],
    getCellValue: ({ rowNode, colKey }: { rowNode: { data: Row }; colKey: string }) =>
      (rowNode.data as unknown as Record<string, unknown>)[colKey],
  } as unknown as GridApi<Row> & { refreshCells: ReturnType<typeof vi.fn> };
}

describe('splitProviderRowsForGrid', () => {
  it('routes existing grid rows to updates', () => {
    const pending = new Set<string>();
    const api = makeGridApi({ existingIds: new Set(['r1']) });

    const { adds, updates, coalescedPending } = splitProviderRowsForGrid(
      [{ id: 'r1', price: 2 }],
      'id',
      api,
      pending,
    );

    expect(adds).toEqual([]);
    expect(updates).toEqual([{ id: 'r1', price: 2 }]);
    expect(coalescedPending).toBe(0);
    expect(pending.size).toBe(0);
  });

  it('queues new rows as adds and tracks pending ids', () => {
    const pending = new Set<string>();
    const api = makeGridApi();

    const { adds, updates, coalescedPending } = splitProviderRowsForGrid(
      [{ id: 'r1' }, { id: 'r2' }],
      'id',
      api,
      pending,
    );

    expect(adds).toEqual([{ id: 'r1' }, { id: 'r2' }]);
    expect(updates).toEqual([]);
    expect(coalescedPending).toBe(0);
    expect(pending).toEqual(new Set(['r1', 'r2']));
  });

  it('coalesces duplicate ticks for ids with a pending add', () => {
    const pending = new Set<string>(['r1']);
    const latest = new Map<string, Row>();
    const api = makeGridApi();

    const { adds, updates, coalescedPending } = splitProviderRowsForGrid(
      [{ id: 'r1', price: 99 }],
      'id',
      api,
      pending,
      latest,
    );

    expect(adds).toEqual([]);
    expect(updates).toEqual([]);
    expect(coalescedPending).toBe(1);
    expect(latest.get('r1')).toEqual({ id: 'r1', price: 99 });
  });

  it('prefers getRowNode over pendingAddIds when the row is already in the grid', () => {
    const pending = new Set<string>(['r1']);
    const api = makeGridApi({ existingIds: new Set(['r1']) });

    const { adds, updates, coalescedPending } = splitProviderRowsForGrid(
      [{ id: 'r1', price: 3 }],
      'id',
      api,
      pending,
    );

    expect(adds).toEqual([]);
    expect(updates).toEqual([{ id: 'r1', price: 3 }]);
    expect(coalescedPending).toBe(0);
  });

  it('uses knownRowIds instead of getRowNode on the live-tick hot path', () => {
    const pending = new Set<string>();
    const known = new Set(['r1', 'r2']);
    const getRowNode = vi.fn(() => null);
    const api = { getRowNode } as unknown as GridApi<Row>;

    const { adds, updates } = splitProviderRowsForGrid(
      [{ id: 'r1', price: 1 }, { id: 'r2', price: 2 }],
      'id',
      api,
      pending,
      undefined,
      known,
    );

    expect(updates).toEqual([{ id: 'r1', price: 1 }, { id: 'r2', price: 2 }]);
    expect(adds).toEqual([]);
    expect(getRowNode).not.toHaveBeenCalled();
  });

  it('queues brand-new ids as adds when knownRowIds is populated', () => {
    const pending = new Set<string>();
    const known = new Set(['r1']);
    const api = makeGridApi();

    const { adds, updates } = splitProviderRowsForGrid(
      [{ id: 'r1', price: 1 }, { id: 'r2', price: 2 }],
      'id',
      api,
      pending,
      undefined,
      known,
    );

    expect(updates).toEqual([{ id: 'r1', price: 1 }]);
    expect(adds).toEqual([{ id: 'r2', price: 2 }]);
    expect(pending).toEqual(new Set(['r2']));
  });
});

describe('createApplyProviderToGridState', () => {
  it('applies all rows as updates when rowIdField is missing', () => {
    const state = createApplyProviderToGridState();
    const api = makeGridApi();
    const rows = [{ id: 'r1' }, { id: 'r2' }];

    state.applyTick(api, rows, undefined);

    expect(api.applyTransactionAsync).toHaveBeenCalledWith({ update: rows });
  });

  it('applies split add/update transaction and clears pending on callback', () => {
    const state = createApplyProviderToGridState();
    const api = makeGridApi();

    state.applyTick(api, [{ id: 'r1' }], 'id');
    expect(state.getPendingAddCount()).toBe(1);

    const cb = vi.mocked(api.applyTransactionAsync).mock.calls[0][1]!;
    cb({ add: [{ id: 'r1' } as never], update: [], remove: [] });

    expect(state.getPendingAddCount()).toBe(0);
  });

  it('applies coalesced updates after pending adds land', () => {
    const state = createApplyProviderToGridState();
    const api = makeGridApi();

    state.applyTick(api, [{ id: 'r1', price: 1 }], 'id');
    state.applyTick(api, [{ id: 'r1', price: 99 }], 'id');

    const cb = vi.mocked(api.applyTransactionAsync).mock.calls[0][1]!;
    cb({ add: [{ id: 'r1' } as never], update: [], remove: [] });

    expect(api.applyTransactionAsync).toHaveBeenCalledTimes(2);
    expect(api.applyTransactionAsync).toHaveBeenLastCalledWith({
      update: [{ id: 'r1', price: 99 }],
    });
  });

  it('clearPendingAdds resets pending bookkeeping', () => {
    const pending = new Set<string>(['r1', 'r2']);
    const known = new Set<string>(['r1']);
    clearPendingAddsFromTransaction(pending, { add: [{ id: 'r1' } as never] }, known);
    expect(pending).toEqual(new Set(['r2']));
    expect(known).toEqual(new Set(['r1']));

    const state = createApplyProviderToGridState();
    state.applyTick(makeGridApi(), [{ id: 'x' }], 'id');
    expect(state.getPendingAddCount()).toBe(1);
    state.clearPendingAdds();
    expect(state.getPendingAddCount()).toBe(0);
  });

  it('after the snapshot, value updates refresh rendered rows in place instead of riding a transaction', () => {
    const r1: Row = { id: 'r1', price: 1 };
    const r2: Row = { id: 'r2', price: 2 };
    const timers: Array<() => void> = [];
    const noteRowsChanged = vi.fn();
    const state = createApplyProviderToGridState({
      getRowChangeFeed: () => ({ noteRowsChanged }),
      setTimer: (fn) => { timers.push(fn); return 1; },
    });
    const api = makeGridApi({
      existingIds: new Set(['r1', 'r2']),
      data: new Map([['r1', r1], ['r2', r2]]),
      rendered: ['r1'],
    });

    state.markSnapshotLoaded([r1, r2], 'id');
    r1.price = 9; r2.price = 8; // patched in place before the tick, as thin deltas do
    const result = state.applyTick(api, [r1, r2], 'id');

    expect(result).toEqual({ coalescedPending: 0, addCount: 0, updateCount: 2 });
    expect(api.applyTransactionAsync).not.toHaveBeenCalled();
    expect(noteRowsChanged).toHaveBeenCalledTimes(1);
    expect((noteRowsChanged.mock.calls[0][0] as { id: string }[]).map((n) => n.id)).toEqual(['r1', 'r2']);
    timers.splice(0).forEach((fn) => fn());
    expect(api.refreshCells).toHaveBeenCalledTimes(1);
    const params = api.refreshCells.mock.calls[0][0] as { rowNodes: { id: string }[]; force?: boolean };
    expect(params.rowNodes.map((n) => n.id)).toEqual(['r1']);
    expect(params).not.toHaveProperty('force');
  });

  it('an update that changes a sorted column still rides a transaction', () => {
    const r1: Row = { id: 'r1', price: 1 };
    const state = createApplyProviderToGridState({ setTimer: () => 1 });
    const api = makeGridApi({ existingIds: new Set(['r1']), data: new Map([['r1', r1]]), sort: ['price'] });

    state.markSnapshotLoaded([r1], 'id');
    state.applyTick(api, [r1], 'id'); // first touch under a sort: snapshot taken via a transaction
    expect(api.applyTransactionAsync).toHaveBeenLastCalledWith({ add: [], update: [r1] }, expect.any(Function));

    state.applyTick(api, [r1], 'id'); // unchanged key → in place
    expect(api.applyTransactionAsync).toHaveBeenCalledTimes(1);

    r1.price = 5;
    state.applyTick(api, [r1], 'id');
    expect(api.applyTransactionAsync).toHaveBeenCalledTimes(2);
  });

  it('dispose cancels a pending rendered-row refresh', () => {
    const r1: Row = { id: 'r1' };
    const clearTimer = vi.fn();
    const state = createApplyProviderToGridState({ setTimer: () => 42, clearTimer });
    const api = makeGridApi({ existingIds: new Set(['r1']), data: new Map([['r1', r1]]), rendered: ['r1'] });
    state.markSnapshotLoaded([r1], 'id');
    state.applyTick(api, [r1], 'id');
    state.dispose();
    expect(clearTimer).toHaveBeenCalledWith(42);
  });
});
