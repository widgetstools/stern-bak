import { describe, expect, it, vi } from 'vitest';
import { applyLabStreamDelta, diffRowUpdates } from './applyLabStreamDelta';
import type { LabRow } from './types';

function row(id: string, bid = 100): LabRow {
  return { id, bidPrice: bid, midPrice: bid, askPrice: bid + 0.1 } as LabRow;
}

describe('applyLabStreamDelta', () => {
  it('replaces snapshot and calls setGridOption on full snapshot', () => {
    const api = {
      setGridOption: vi.fn(),
      getRowNode: vi.fn(),
      applyTransactionAsync: vi.fn(),
    };
    const incoming = [row('a'), row('b')];
    const next = applyLabStreamDelta(api as never, [], incoming, true);
    expect(next).toHaveLength(2);
    expect(api.setGridOption).toHaveBeenCalledWith('rowData', incoming);
    expect(api.applyTransactionAsync).not.toHaveBeenCalled();
  });

  it('routes tick deltas through applyTransactionAsync', () => {
    const api = {
      setGridOption: vi.fn(),
      getRowNode: vi.fn((id: string) => (id === 'a' ? { id: 'a' } : null)),
      applyTransactionAsync: vi.fn(),
    };
    const snapshot = [row('a', 100), row('b', 50)];
    const incoming = [row('a', 101)];
    const next = applyLabStreamDelta(api as never, snapshot, incoming, false);
    expect(next[0].bidPrice).toBe(101);
    expect(api.applyTransactionAsync).toHaveBeenCalledWith({
      add: [],
      update: [incoming[0]],
    });
    expect(api.setGridOption).not.toHaveBeenCalled();
  });
});

describe('diffRowUpdates', () => {
  it('returns rows whose payload changed', () => {
    const before = [row('a', 100)];
    const after = [row('a', 105)];
    expect(diffRowUpdates(before, after)).toHaveLength(1);
    expect(diffRowUpdates(before, before)).toHaveLength(0);
  });
});
