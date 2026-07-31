import { describe, expect, it, vi } from 'vitest';
import { applyForwardPatches, applyPatches } from './applyPatches.js';
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
});
