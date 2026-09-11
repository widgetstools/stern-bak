import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import { bindSsrmEdits, ssrmPasteTarget } from './bindSsrmEdits.js';

afterEach(() => {
  vi.useRealTimers();
});

function api() {
  const listeners = new Map<string, Set<(e: unknown) => void>>();
  return {
    addEventListener: vi.fn((evt: string, fn: (e: unknown) => void) => {
      if (!listeners.has(evt)) listeners.set(evt, new Set());
      listeners.get(evt)!.add(fn);
    }),
    removeEventListener: vi.fn((evt: string, fn: (e: unknown) => void) => {
      listeners.get(evt)?.delete(fn);
    }),
    getGridOption: vi.fn(() => undefined),
    isDestroyed: () => false,
    fire(evt: string, e: unknown = {}) {
      for (const fn of listeners.get(evt) ?? []) fn(e);
    },
  };
}

function provider(applyEdits?: (req: { rows: unknown[] }) => Promise<{ applied: number }>) {
  return { applyEdits } as unknown as ISsrmDataProvider;
}

const edit = (id: string, data: Record<string, unknown>, oldValue: unknown, newValue: unknown) => ({
  node: { id, data, group: false },
  oldValue,
  newValue,
});

describe('bindSsrmEdits', () => {
  it('coalesces cell edits per row and writes whole rows to the engine', () => {
    vi.useFakeTimers();
    const applyEdits = vi.fn(async () => ({ applied: 1 }));
    const grid = api();
    bindSsrmEdits(provider(applyEdits), grid as never, { flushMs: 10 });
    const row = { id: 'r1', px: 2, qty: 5 };
    grid.fire('cellValueChanged', edit('r1', row, 1, 2));
    row.qty = 7;
    grid.fire('cellValueChanged', edit('r1', row, 5, 7));
    grid.fire('cellValueChanged', edit('r2', { id: 'r2', px: 3 }, 2, 3));
    expect(applyEdits).not.toHaveBeenCalled();
    vi.advanceTimersByTime(10);
    expect(applyEdits).toHaveBeenCalledTimes(1);
    expect(applyEdits).toHaveBeenCalledWith({ rows: [{ id: 'r1', px: 2, qty: 7 }, { id: 'r2', px: 3 }] });
  });

  it('flushes at once when a paste finishes', () => {
    vi.useFakeTimers();
    const applyEdits = vi.fn(async () => ({ applied: 1 }));
    const grid = api();
    bindSsrmEdits(provider(applyEdits), grid as never, { flushMs: 1000 });
    grid.fire('cellValueChanged', edit('r1', { id: 'r1', px: 2 }, 1, 2));
    grid.fire('pasteEnd');
    expect(applyEdits).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(applyEdits).toHaveBeenCalledTimes(1);
  });

  it('ignores unchanged values, group rows and rows without data', () => {
    vi.useFakeTimers();
    const applyEdits = vi.fn(async () => ({ applied: 0 }));
    const grid = api();
    bindSsrmEdits(provider(applyEdits), grid as never, { flushMs: 1 });
    grid.fire('cellValueChanged', edit('r1', { id: 'r1' }, 2, 2));
    grid.fire('cellValueChanged', { node: { id: 'g', data: { desk: 'A' }, group: true }, oldValue: 1, newValue: 2 });
    grid.fire('cellValueChanged', { node: { id: 'stub', data: undefined, group: false }, oldValue: 1, newValue: 2 });
    vi.advanceTimersByTime(5);
    expect(applyEdits).not.toHaveBeenCalled();
  });

  it('reports a failed write and leaves the grid alone', async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const grid = api();
    bindSsrmEdits(provider(async () => { throw new Error('engine down'); }), grid as never, { flushMs: 1, onError });
    grid.fire('cellValueChanged', edit('r1', { id: 'r1', px: 2 }, 1, 2));
    await vi.advanceTimersByTimeAsync(2);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'engine down' }));
  });

  it('is a no-op for a provider without a write path, and flushes on unbind', () => {
    vi.useFakeTimers();
    const grid = api();
    const off = bindSsrmEdits(provider(undefined), grid as never);
    expect(grid.addEventListener).not.toHaveBeenCalled();
    off();

    const applyEdits = vi.fn(async () => ({ applied: 1 }));
    const grid2 = api();
    const off2 = bindSsrmEdits(provider(applyEdits), grid2 as never, { flushMs: 1000 });
    grid2.fire('cellValueChanged', edit('r1', { id: 'r1', px: 2 }, 1, 2));
    off2();
    expect(applyEdits).toHaveBeenCalledTimes(1);
    expect(grid2.removeEventListener).toHaveBeenCalledWith('cellValueChanged', expect.any(Function));
  });
});

describe('ssrmPasteTarget', () => {
  const rows: Record<number, { stub?: boolean; group?: boolean; data?: unknown }> = {
    0: { data: {} }, 1: { data: {} }, 2: { stub: true }, 3: { group: true, data: {} }, 4: { data: {} },
  };
  const pasteApi = (ranges: Array<[number, number]>, focusedRow: number | null = null) => ({
    getCellRanges: () => ranges.map(([a, b]) => ({ startRow: { rowIndex: a }, endRow: { rowIndex: b } })),
    getFocusedCell: () => (focusedRow == null ? null : { rowIndex: focusedRow }),
    getDisplayedRowAtIndex: (i: number) => rows[i],
  });

  it('counts unloaded rows inside the selected ranges', () => {
    expect(ssrmPasteTarget(pasteApi([[0, 1]]) as never, 5)).toEqual({ rows: 2, unloaded: 0 });
    expect(ssrmPasteTarget(pasteApi([[1, 3]]) as never, 1)).toEqual({ rows: 3, unloaded: 2 });
    expect(ssrmPasteTarget(pasteApi([[4, 0]]) as never, 1)).toEqual({ rows: 5, unloaded: 2 });
  });

  it('falls back to the focused cell and the pasted row count', () => {
    expect(ssrmPasteTarget(pasteApi([], 0) as never, 2)).toEqual({ rows: 2, unloaded: 0 });
    expect(ssrmPasteTarget(pasteApi([], 1) as never, 3)).toEqual({ rows: 3, unloaded: 2 });
    expect(ssrmPasteTarget(pasteApi([], 3) as never, 5)).toEqual({ rows: 5, unloaded: 4 });
    expect(ssrmPasteTarget(pasteApi([]) as never, 5)).toEqual({ rows: 0, unloaded: 0 });
  });
});
