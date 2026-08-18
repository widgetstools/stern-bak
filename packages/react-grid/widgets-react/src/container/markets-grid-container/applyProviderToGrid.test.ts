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
  onApply?: (tx: { add?: Row[]; update?: Row[] }, cb?: (result: { add: { id: string }[] }) => void) => void;
} = {}): GridApi<Row> {
  const existing = opts.existingIds ?? new Set<string>();
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
    getRowNode: (id: string) => (existing.has(id) ? { id } as never : null),
  } as unknown as GridApi<Row>;
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

  it('markSnapshotLoaded enables getRowNode-free live ticks', () => {
    const state = createApplyProviderToGridState();
    const getRowNode = vi.fn(() => null);
    const api = { applyTransactionAsync: vi.fn(), getRowNode } as unknown as GridApi<Row>;

    state.markSnapshotLoaded([{ id: 'r1' }, { id: 'r2' }], 'id');
    state.applyTick(api, [{ id: 'r1', price: 9 }, { id: 'r2', price: 8 }], 'id');

    expect(getRowNode).not.toHaveBeenCalled();
    expect(api.applyTransactionAsync).toHaveBeenCalledWith({
      add: [],
      update: [{ id: 'r1', price: 9 }, { id: 'r2', price: 8 }],
    }, expect.any(Function));
  });
});

/**
 * The stateful half. Everything the state object does is bookkeeping around
 * one question — is this row already in the grid, already queued as an add, or
 * new — and the answers differ before and after the snapshot id index exists.
 */
describe('createApplyProviderToGridState', () => {
  /** A grid that runs the transaction callback synchronously. */
  function immediateApi(existingIds: string[] = []) {
    const applied: Array<{ add?: Row[]; update?: Row[] }> = [];
    const api = makeGridApi({
      existingIds: new Set(existingIds),
      onApply: (tx, cb) => {
        applied.push(tx);
        cb?.({ add: (tx.add ?? []).map((r) => ({ id: r.id })) });
      },
    });
    return { api, applied };
  }

  it('reports nothing to do for an empty tick', () => {
    const state = createApplyProviderToGridState();
    const { api, applied } = immediateApi();

    expect(state.applyTick(api, [], 'id')).toEqual({
      coalescedPending: 0,
      addCount: 0,
      updateCount: 0,
    });
    expect(applied).toEqual([]);
  });

  it('sends everything as an update when there is no id field', () => {
    // No identity means no way to tell an add from an update; AG Grid's own
    // getRowId is the only thing that can match, so update is the safe call.
    const state = createApplyProviderToGridState();
    const { api, applied } = immediateApi();

    expect(state.applyTick(api, [{ id: 'r1' }], undefined as never)).toMatchObject({
      updateCount: 1,
      addCount: 0,
    });
    expect(applied[0]).toEqual({ update: [{ id: 'r1' }] });
  });

  it('adds a row the grid has never seen', () => {
    const state = createApplyProviderToGridState();
    const { api, applied } = immediateApi();

    expect(state.applyTick(api, [{ id: 'r1' }], 'id')).toMatchObject({ addCount: 1 });
    expect(applied[0].add).toEqual([{ id: 'r1' }]);
  });

  it('updates a row the snapshot already carried', () => {
    const state = createApplyProviderToGridState();
    state.markSnapshotLoaded([{ id: 'r1' }], 'id');
    const { api, applied } = immediateApi();

    expect(state.applyTick(api, [{ id: 'r1', price: 9 }], 'id')).toMatchObject({
      updateCount: 1,
      addCount: 0,
    });
    expect(applied[0].update).toEqual([{ id: 'r1', price: 9 }]);
  });

  it('skips rows with no derivable id', () => {
    const state = createApplyProviderToGridState();
    const { api } = immediateApi();

    expect(state.applyTick(api, [{ price: 1 } as never], 'id')).toEqual({
      coalescedPending: 0,
      addCount: 0,
      updateCount: 0,
    });
  });

  it('clears the pending-add bookkeeping once the add lands', () => {
    const state = createApplyProviderToGridState();
    const { api } = immediateApi();

    state.applyTick(api, [{ id: 'r1' }], 'id');
    // The callback ran, so the row is known and no longer pending.
    expect(state.getPendingAddCount()).toBe(0);

    state.applyTick(api, [{ id: 'r1', price: 3 }], 'id');
    expect(state.getPendingAddCount()).toBe(0);
  });

  it('coalesces a second tick for a row whose add has not landed yet', () => {
    const state = createApplyProviderToGridState();
    const deferred: Array<(r: { add: { id: string }[] }) => void> = [];
    const applied: Array<{ add?: Row[]; update?: Row[] }> = [];
    const api = makeGridApi({
      onApply: (tx, cb) => {
        applied.push(tx);
        if (cb) deferred.push(cb);
      },
    });

    state.applyTick(api, [{ id: 'r1', price: 1 }], 'id');
    expect(state.getPendingAddCount()).toBe(1);

    // Second tick for the same row while the add is in flight — it must not
    // be added twice, and its newer value must not be lost.
    const second = state.applyTick(api, [{ id: 'r1', price: 2 }], 'id');
    expect(second).toMatchObject({ coalescedPending: 1, addCount: 0, updateCount: 0 });
    expect(applied).toHaveLength(1);

    deferred[0]({ add: [{ id: 'r1' }] });
    expect(applied[1]).toEqual({ update: [{ id: 'r1', price: 2 }] });
    expect(state.getPendingAddCount()).toBe(0);
  });

  it('applies no follow-up when nothing was coalesced', () => {
    const state = createApplyProviderToGridState();
    const { api, applied } = immediateApi();

    state.applyTick(api, [{ id: 'r1' }], 'id');
    expect(applied).toHaveLength(1);
  });

  it('forgets everything on clearPendingAdds', () => {
    const state = createApplyProviderToGridState();
    const api = makeGridApi({ onApply: () => undefined });
    state.applyTick(api, [{ id: 'r1' }], 'id');
    expect(state.getPendingAddCount()).toBe(1);

    state.clearPendingAdds();
    expect(state.getPendingAddCount()).toBe(0);
  });

  it('replaces the known-id index on each snapshot', () => {
    const state = createApplyProviderToGridState();
    state.markSnapshotLoaded([{ id: 'r1' }], 'id');
    state.markSnapshotLoaded([{ id: 'r2' }], 'id');
    const { api, applied } = immediateApi();

    state.applyTick(api, [{ id: 'r1' }, { id: 'r2' }], 'id');
    expect(applied[0].add).toEqual([{ id: 'r1' }]);
    expect(applied[0].update).toEqual([{ id: 'r2' }]);
  });

  it('drops snapshot rows with no derivable id', () => {
    const state = createApplyProviderToGridState();
    state.markSnapshotLoaded([{ id: 'r1' }, { price: 1 } as never], 'id');
    const { api, applied } = immediateApi();

    state.applyTick(api, [{ id: 'r1' }], 'id');
    expect(applied[0].update).toEqual([{ id: 'r1' }]);
  });
});

describe('createApplyProviderToGridState — resolver variants', () => {
  const resolve = (row: Row) => row.id ?? null;

  function immediateApi() {
    const applied: Array<{ add?: Row[]; update?: Row[] }> = [];
    const api = makeGridApi({
      onApply: (tx, cb) => {
        applied.push(tx);
        cb?.({ add: (tx.add ?? []).map((r) => ({ id: r.id })) });
      },
    });
    return { api, applied };
  }

  it('reports nothing to do for an empty tick', () => {
    const state = createApplyProviderToGridState();
    const { api } = immediateApi();

    expect(state.applyTickWithResolver(api, [], resolve)).toEqual({
      coalescedPending: 0,
      addCount: 0,
      updateCount: 0,
    });
  });

  it('adds a row the resolver names for the first time', () => {
    const state = createApplyProviderToGridState();
    const { api, applied } = immediateApi();

    expect(state.applyTickWithResolver(api, [{ id: 'r1' }], resolve)).toMatchObject({
      addCount: 1,
    });
    expect(applied[0].add).toEqual([{ id: 'r1' }]);
  });

  it('updates a row the snapshot resolver already indexed', () => {
    const state = createApplyProviderToGridState();
    state.markSnapshotLoadedWithResolver([{ id: 'r1' }], resolve);
    const { api, applied } = immediateApi();

    state.applyTickWithResolver(api, [{ id: 'r1', price: 5 }], resolve);
    expect(applied[0].update).toEqual([{ id: 'r1', price: 5 }]);
  });

  it('skips rows the resolver cannot identify', () => {
    const state = createApplyProviderToGridState();
    state.markSnapshotLoadedWithResolver([{ id: null } as never], () => null);
    const { api } = immediateApi();

    expect(state.applyTickWithResolver(api, [{ id: 'x' }], () => null)).toEqual({
      coalescedPending: 0,
      addCount: 0,
      updateCount: 0,
    });
  });

  it('exposes the split for a caller driving the transaction itself', () => {
    const state = createApplyProviderToGridState();
    state.markSnapshotLoaded([{ id: 'r1' }], 'id');
    const { api } = immediateApi();

    expect(state.splitRows([{ id: 'r1' }, { id: 'r2' }], 'id', api)).toMatchObject({
      updates: [{ id: 'r1' }],
      adds: [{ id: 'r2' }],
    });
  });
});

describe('clearPendingAddsFromTransaction', () => {
  it('ignores nodes AG Grid gave no id', () => {
    const pending = new Set(['r1']);
    const known = new Set<string>();

    clearPendingAddsFromTransaction(pending, { add: [{ id: undefined } as never] }, known);
    expect(pending.has('r1')).toBe(true);
    expect(known.size).toBe(0);
  });

  it('works without a known-id index', () => {
    const pending = new Set(['r1']);
    clearPendingAddsFromTransaction(pending, { add: [{ id: 'r1' } as never] });
    expect(pending.size).toBe(0);
  });
});
