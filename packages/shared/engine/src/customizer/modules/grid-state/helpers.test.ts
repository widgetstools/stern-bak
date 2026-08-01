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
