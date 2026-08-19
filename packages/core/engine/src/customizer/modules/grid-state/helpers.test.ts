import { describe, expect, it, vi } from 'vitest';
import {
  applyGridState,
  captureGridState,
  captureGridStateInto,
} from './helpers';
import type { SavedGridState } from './state';
import { GRID_STATE_SCHEMA_VERSION } from './state';

function makeApi(overrides: Record<string, unknown> = {}) {
  const listeners = new Map<string, Set<() => void>>();
  return {
    getState: vi.fn(() => ({ columnOrder: { orderedColIds: ['a', 'b'] } })),
    getFirstDisplayedRowIndex: vi.fn(() => 3),
    getHorizontalPixelRange: vi.fn(() => ({ left: 120, right: 800 })),
    getAllDisplayedColumns: vi.fn(() => [
      { getColId: () => 'a', getLeft: () => 0, getActualWidth: () => 100 },
      { getColId: () => 'b', getLeft: () => 100, getActualWidth: () => 100 },
    ]),
    getGridOption: vi.fn(() => 'quick'),
    setState: vi.fn(),
    applyColumnState: vi.fn(),
    setGridOption: vi.fn(),
    getDisplayedRowCount: vi.fn(() => 10),
    ensureIndexVisible: vi.fn(),
    getColumn: vi.fn((id: string) => (id === 'b' ? { getColId: () => 'b' } : null)),
    ensureColumnVisible: vi.fn(),
    getColumns: vi.fn(() => [{ getColId: () => 'a' }, { getColId: () => 'b' }, { getColId: () => 'new' }]),
    addEventListener: vi.fn((evt: string, fn: () => void) => {
      const set = listeners.get(evt) ?? new Set();
      set.add(fn);
      listeners.set(evt, set);
    }),
    removeEventListener: vi.fn(),
    ...overrides,
  };
}

describe('captureGridState', () => {
  it('captures grid state, viewport anchor, and quick filter', () => {
    const saved = captureGridState(makeApi() as never);
    expect(saved.schemaVersion).toBe(GRID_STATE_SCHEMA_VERSION);
    expect(saved.viewportAnchor.firstRowIndex).toBe(3);
    expect(saved.viewportAnchor.leftColId).toBe('b');
    expect(saved.quickFilter).toBe('quick');
  });

  it('returns minimal snapshot when api methods throw', () => {
    const saved = captureGridState({
      getState: () => {
        throw new Error('fail');
      },
      getFirstDisplayedRowIndex: () => {
        throw new Error('fail');
      },
      getGridOption: () => {
        throw new Error('fail');
      },
    } as never);
    expect(saved.gridState).toEqual({});
    expect(saved.viewportAnchor.firstRowIndex).toBe(0);
  });
});

describe('applyGridState', () => {
  it('sanitises malformed set-filter entries before setState', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const api = makeApi();
    const saved: SavedGridState = {
      schemaVersion: GRID_STATE_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      gridState: {
        filter: {
          filterModel: {
            side: { filterType: 'set', values: 'not-an-array' },
            price: { filterType: 'number', type: 'greaterThan', filter: 10 },
          },
        },
        columnOrder: { orderedColIds: ['a'] },
      },
      viewportAnchor: { firstRowIndex: 0, leftColId: null, horizontalPixel: 0 },
    };
    applyGridState(api as never, saved);
    const passed = api.setState.mock.calls[0]?.[0] as {
      filter?: { filterModel?: Record<string, unknown> };
    };
    expect(passed.filter?.filterModel?.side).toBeUndefined();
    expect(passed.filter?.filterModel?.price).toBeDefined();
    warn.mockRestore();
  });

  it('no-ops on missing api or saved snapshot', () => {
    const api = makeApi();
    applyGridState(null as never, {} as SavedGridState);
    applyGridState(api as never, null as never);
    expect(api.setState).not.toHaveBeenCalled();
  });

  it('retries setState on a microtask and again on firstDataRendered (cold-mount race)', async () => {
    const api = makeApi();
    const saved: SavedGridState = {
      schemaVersion: GRID_STATE_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      gridState: { sort: { sortModel: [{ colId: 'ticker', sort: 'asc' }] } },
      viewportAnchor: { firstRowIndex: 0, leftColId: null, horizontalPixel: 0 },
    };

    applyGridState(api as never, saved);
    // Immediate synchronous call — covers the already-settled case.
    expect(api.setState).toHaveBeenCalledTimes(1);

    // Microtask attempt.
    await Promise.resolve();
    expect(api.setState).toHaveBeenCalledTimes(2);

    // A saved column (e.g. an SSRM-inferred one) doesn't exist yet at either
    // of the attempts above — simulate it finally arriving by firing
    // firstDataRendered, the same event the column-order restore below
    // waits on for exactly this reason.
    const fireFirstDataRendered = (api.addEventListener as ReturnType<typeof vi.fn>).mock.calls
      .find(([evt]) => evt === 'firstDataRendered')?.[1] as (() => void) | undefined;
    expect(fireFirstDataRendered).toBeDefined();
    fireFirstDataRendered!();
    expect(api.setState).toHaveBeenCalledTimes(3);
    // Every call carries the saved sort model — the column existing or not
    // is AG-Grid's problem to silently no-op on, not this function's.
    for (const call of api.setState.mock.calls) {
      expect((call[0] as { sort?: unknown }).sort).toEqual(saved.gridState.sort);
    }

    // One-shot intent: the listener removes itself after firing once.
    expect(api.removeEventListener).toHaveBeenCalledWith('firstDataRendered', fireFirstDataRendered);
  });

  it('retries the viewport anchor until the SSRM row model reaches it', async () => {
    // SSRM cold-mount timeline: at grid:ready the row count is the transient
    // loading-placeholder 1, and only later becomes the datasource total. The
    // saved anchor (row 390) is unreachable at the first attempt.
    let displayed = 1;
    let firstVisible = 0;
    const api = makeApi({
      getDisplayedRowCount: vi.fn(() => displayed),
      getFirstDisplayedRowIndex: vi.fn(() => firstVisible),
      getLastDisplayedRowIndex: vi.fn(() => firstVisible + 20),
    });
    // Scrolling only works once the model actually extends that far.
    (api.ensureIndexVisible as ReturnType<typeof vi.fn>).mockImplementation((idx: number) => {
      if (idx < displayed) firstVisible = idx;
    });

    const saved: SavedGridState = {
      schemaVersion: GRID_STATE_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      gridState: {},
      viewportAnchor: { firstRowIndex: 390, leftColId: null, horizontalPixel: 0 },
    };
    applyGridState(api as never, saved);

    // Microtask attempt lands while the count is still 1 — guard rejects it.
    await Promise.resolve();
    expect(api.ensureIndexVisible).not.toHaveBeenCalled();
    expect(firstVisible).toBe(0);

    const calls = (api.addEventListener as ReturnType<typeof vi.fn>).mock.calls;
    const onModelUpdated = calls.find(([evt]) => evt === 'modelUpdated')?.[1] as (() => void);
    // Regression guard: the old code bound `firstDataRendered` ONLY when the
    // initial count read 0, so an SSRM grid reporting 1 got no fallback at all.
    expect(calls.some(([evt]) => evt === 'firstDataRendered')).toBe(true);
    expect(onModelUpdated).toBeDefined();

    // A block lands but still doesn't cover row 390.
    displayed = 100;
    onModelUpdated();
    expect(firstVisible).toBe(0);

    // Datasource reports the real total — this attempt reaches the anchor.
    displayed = 3800;
    onModelUpdated();
    expect(firstVisible).toBe(390);

    // Settled: the next tick unbinds instead of re-scrolling over the user.
    const scrolls = (api.ensureIndexVisible as ReturnType<typeof vi.fn>).mock.calls.length;
    onModelUpdated();
    expect((api.ensureIndexVisible as ReturnType<typeof vi.fn>).mock.calls.length).toBe(scrolls);
    expect(api.removeEventListener).toHaveBeenCalledWith('modelUpdated', onModelUpdated);
  });

  it('survives a snapshot with no viewportAnchor', () => {
    // `deserialize` only validates `gridState`, so legacy / hand-edited rows
    // can arrive without an anchor. `activate` calls applyGridState unguarded,
    // so throwing here would take the entire profile restore down with it.
    const api = makeApi();
    const saved = {
      schemaVersion: GRID_STATE_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      gridState: { sort: { sortModel: [{ colId: 'a', sort: 'asc' }] } },
    } as unknown as SavedGridState;
    expect(() => applyGridState(api as never, saved)).not.toThrow();
    expect(api.setState).toHaveBeenCalled();
  });

  it('stops retrying the viewport once the attempt budget is spent', async () => {
    // Anchor that can never be reached (row since deleted / filtered out).
    const api = makeApi({
      getDisplayedRowCount: vi.fn(() => 10),
      getFirstDisplayedRowIndex: vi.fn(() => 0),
      getLastDisplayedRowIndex: vi.fn(() => 5),
    });
    const saved: SavedGridState = {
      schemaVersion: GRID_STATE_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      gridState: {},
      viewportAnchor: { firstRowIndex: 9999, leftColId: null, horizontalPixel: 0 },
    };
    applyGridState(api as never, saved);
    await Promise.resolve();

    const onModelUpdated = (api.addEventListener as ReturnType<typeof vi.fn>).mock.calls
      .find(([evt]) => evt === 'modelUpdated')?.[1] as (() => void);
    for (let i = 0; i < 40; i += 1) onModelUpdated();

    // Bounded, not forever — and it unbinds rather than fighting the user.
    expect(api.removeEventListener).toHaveBeenCalledWith('modelUpdated', onModelUpdated);
    expect((api.ensureIndexVisible as ReturnType<typeof vi.fn>).mock.calls.length)
      .toBeLessThanOrEqual(20);
  });

  it('cancels viewport retry when the user keyboard-navigates before restore settles', async () => {
    let displayed = 1;
    let firstVisible = 0;
    let focusedRow = 0;
    const api = makeApi({
      getDisplayedRowCount: vi.fn(() => displayed),
      getFirstDisplayedRowIndex: vi.fn(() => firstVisible),
      getLastDisplayedRowIndex: vi.fn(() => firstVisible + 5),
      getFocusedCell: vi.fn(() => ({ rowIndex: focusedRow, column: { getColId: () => 'a' } })),
    });

    const saved: SavedGridState = {
      schemaVersion: GRID_STATE_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      gridState: {},
      viewportAnchor: { firstRowIndex: 390, leftColId: null, horizontalPixel: 0 },
    };
    applyGridState(api as never, saved);
    await Promise.resolve();

    const onModelUpdated = (api.addEventListener as ReturnType<typeof vi.fn>).mock.calls
      .find(([evt]) => evt === 'modelUpdated')?.[1] as (() => void);
    const onCellFocused = (api.addEventListener as ReturnType<typeof vi.fn>).mock.calls
      .find(([evt]) => evt === 'cellFocused')?.[1] as (() => void);
    expect(onCellFocused).toBeDefined();

    // Initial focus stamp — should not cancel yet.
    onCellFocused();
    displayed = 50;
    onModelUpdated();

    // User arrow-keys down before the anchor is on screen.
    focusedRow = 1;
    onCellFocused();

    expect(api.removeEventListener).toHaveBeenCalledWith('modelUpdated', onModelUpdated);
    expect(api.removeEventListener).toHaveBeenCalledWith('cellFocused', onCellFocused);
  });
});

describe('captureGridStateInto', () => {
  it('writes captured state into the grid-state module slice', () => {
    const api = makeApi();
    const setModuleState = vi.fn();
    captureGridStateInto(
      { setModuleState } as never,
      api as never,
    );
    expect(setModuleState).toHaveBeenCalledWith('grid-state', expect.any(Function));
    const updater = setModuleState.mock.calls[0][1] as () => { saved: SavedGridState };
    expect(updater(undefined as never).saved.viewportAnchor.firstRowIndex).toBe(3);
  });

  it('warns on schema mismatch and restores column order with pinning and widths', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const api = makeApi({
      getDisplayedRowCount: vi.fn(() => 5),
      getColumns: vi.fn(() => [
        { getColId: () => 'a' },
        { getColId: () => 'b' },
        { getColId: () => 'new' },
      ]),
    });
    const saved: SavedGridState = {
      schemaVersion: 0,
      savedAt: new Date().toISOString(),
      gridState: {
        columnOrder: { orderedColIds: ['b', 'a'] },
        columnPinning: { leftColIds: ['a'], rightColIds: [] },
        columnSizing: { columnSizingModel: [{ colId: 'a', width: 120, flex: 1 }] },
      },
      viewportAnchor: { firstRowIndex: 1, leftColId: null, horizontalPixel: 50 },
      quickFilter: 'find',
    };
    applyGridState(api as never, saved);
    await new Promise<void>((r) => queueMicrotask(r));
    expect(api.applyColumnState).toHaveBeenCalled();
    expect(api.setGridOption).toHaveBeenCalledWith('quickFilterText', 'find');
    warn.mockRestore();
  });

  it('sanitizes malformed multi-filter sub entries', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const api = makeApi();
    applyGridState(api as never, {
      schemaVersion: GRID_STATE_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      gridState: {
        filter: {
          filterModel: {
            side: {
              filterType: 'multi',
              filterModels: [{ filterType: 'set', values: 'bad' }, { filterType: 'number', type: 'greaterThan', filter: 1 }],
            },
          },
        },
      },
      viewportAnchor: { firstRowIndex: 0, leftColId: null, horizontalPixel: 0 },
    });
    const passed = api.setState.mock.calls[0]?.[0] as {
      filter?: { filterModel?: Record<string, { filterModels?: unknown[] }> };
    };
    expect(passed.filter?.filterModel?.side?.filterModels?.[0]).toBeNull();
    expect(passed.filter?.filterModel?.side?.filterModels?.[1]).toBeTruthy();
    warn.mockRestore();
  });
});
