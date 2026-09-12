import { describe, expect, it, vi } from 'vitest';
import { applyForwardPatches, applyPatches } from './applyPatches.js';
import { attachSsrmEditWriter, lookupSsrmEditWriter } from './ssrmEditWriter.js';
import { buildRowUpdatesFromPatches } from './buildRowUpdates.js';

function mockWriter(rows: Record<string, Record<string, unknown>>) {
  return {
    getRowNode: (id: string) => ({ data: rows[id] }),
    applyTransactionAsync: vi.fn().mockResolvedValue(undefined),
  };
}

describe('buildRowUpdatesFromPatches', () => {
  it('merges patch into full row on redo', () => {
    const api = mockWriter({ r1: { id: 'r1', qty: 100, ticker: 'ABC' } });
    const updates = buildRowUpdatesFromPatches(
      api,
      [{ rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 100, newValue: 200 }],
      'redo',
    );
    expect(updates).toEqual([{ id: 'r1', qty: 200, ticker: 'ABC' }]);
  });

  it('restores old value on undo', () => {
    const api = mockWriter({ r1: { id: 'r1', qty: 200, ticker: 'ABC' } });
    const updates = buildRowUpdatesFromPatches(
      api,
      [{ rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 100, newValue: 200 }],
      'undo',
    );
    expect(updates[0]?.qty).toBe(100);
    expect(updates[0]?.ticker).toBe('ABC');
  });
});

describe('applyPatches', () => {
  it('calls applyTransactionAsync with merged rows', async () => {
    const api = mockWriter({ r1: { id: 'r1', qty: 100 } });
    await applyForwardPatches(api, [
      { rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 100, newValue: 50 },
    ]);
    expect(api.applyTransactionAsync).toHaveBeenCalledWith({
      update: [{ id: 'r1', qty: 50 }],
    });
  });

  it('returns 0 for empty patches', async () => {
    const api = mockWriter({});
    expect(await applyPatches(api, [], 'redo')).toBe(0);
    expect(api.applyTransactionAsync).not.toHaveBeenCalled();
  });

  it('synthesizes row object when row node is missing but still applies patches', async () => {
    const api = mockWriter({});
    const count = await applyPatches(api, [
      { rowId: 'missing', colId: 'qty', field: 'qty', oldValue: 1, newValue: 2 },
    ], 'redo');
    expect(count).toBe(1);
    expect(api.applyTransactionAsync).toHaveBeenCalledWith({
      update: [{ id: 'missing', qty: 2 }],
    });
  });

  // AG Grid ignores applyTransactionAsync under the server-side row model.
  it('routes SSRM grids through applyServerSideTransactionAsync', async () => {
    const api = {
      ...mockWriter({ r1: { id: 'r1', qty: 100 } }),
      applyServerSideTransactionAsync: vi.fn(),
      getGridOption: () => 'serverSide',
    };
    const count = await applyForwardPatches(api, [
      { rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 100, newValue: 50 },
    ]);
    expect(count).toBe(1);
    expect(api.applyServerSideTransactionAsync).toHaveBeenCalledWith({
      update: [{ id: 'r1', qty: 50 }],
    });
    expect(api.applyTransactionAsync).not.toHaveBeenCalled();
  });

  it('persists SSRM edits through the attached engine writer — undo included', async () => {
    const api = {
      ...mockWriter({ r1: { id: 'r1', qty: 100, px: 9 }, r2: { id: 'r2', qty: 7 } }),
      applyServerSideTransactionAsync: vi.fn(),
      getGridOption: () => 'serverSide',
    };
    const writer = vi.fn().mockResolvedValue({ applied: 2 });
    attachSsrmEditWriter(api, writer);
    expect(lookupSsrmEditWriter(api)).toBe(writer);

    await applyForwardPatches(api, [
      { rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 100, newValue: 50 },
      { rowId: 'r1', colId: 'px', field: 'px', oldValue: 9, newValue: 10 },
      { rowId: 'r2', colId: 'qty', field: 'qty', oldValue: 7, newValue: 8 },
    ]);
    // Whole rows for the engine's whole-row upsert, PLUS exactly the edited
    // columns so the worker overlay holds only what the user touched.
    expect(writer).toHaveBeenCalledWith(
      [{ id: 'r1', qty: 50, px: 10 }, { id: 'r2', qty: 8 }],
      [['qty', 'px'], ['qty']],
    );

    // Undo flows through the same seam with the OLD values — this is what
    // makes journal undo persist engine-side (phase C2).
    await applyPatches(api, [
      { rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 100, newValue: 50 },
    ], 'undo');
    expect(writer).toHaveBeenLastCalledWith([{ id: 'r1', qty: 100, px: 9 }], [['qty']]);

    attachSsrmEditWriter(api, null);
    expect(lookupSsrmEditWriter(api)).toBeUndefined();
  });

  it('stays paint-only under SSRM without a writer, and survives a writer rejection', async () => {
    const api = {
      ...mockWriter({ r1: { id: 'r1', qty: 100 } }),
      applyServerSideTransactionAsync: vi.fn(),
      getGridOption: () => 'serverSide',
    };
    // No writer attached: the pre-C1 behaviour, unchanged.
    await applyForwardPatches(api, [
      { rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 100, newValue: 50 },
    ]);
    expect(api.applyServerSideTransactionAsync).toHaveBeenCalledTimes(1);

    // A failing writer warns; the local paint already happened.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    attachSsrmEditWriter(api, vi.fn().mockRejectedValue(new Error('engine down')));
    await applyForwardPatches(api, [
      { rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 50, newValue: 60 },
    ]);
    await new Promise((r) => setTimeout(r, 0));
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('edit did not reach the engine'),
      expect.any(Error),
    );
    warn.mockRestore();
  });

  it('keeps the client-side transaction for clientSide grids', async () => {
    const api = {
      ...mockWriter({ r1: { id: 'r1', qty: 100 } }),
      applyServerSideTransactionAsync: vi.fn(),
      getGridOption: () => 'clientSide',
    };
    await applyForwardPatches(api, [
      { rowId: 'r1', colId: 'qty', field: 'qty', oldValue: 100, newValue: 50 },
    ]);
    expect(api.applyServerSideTransactionAsync).not.toHaveBeenCalled();
    expect(api.applyTransactionAsync).toHaveBeenCalled();
  });
});
