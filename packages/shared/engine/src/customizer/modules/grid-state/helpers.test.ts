import { describe, expect, it, vi } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import { applyGridState, captureGridState, captureGridStateInto } from './helpers.js';
import { GRID_STATE_SCHEMA_VERSION, type SavedGridState } from './state.js';

function saved(overrides: Partial<SavedGridState> = {}): SavedGridState {
  return {
    schemaVersion: GRID_STATE_SCHEMA_VERSION,
    savedAt: '2026-01-01T00:00:00Z',
    gridState: {},
    viewportAnchor: { firstRowIndex: 0, leftColId: null, horizontalPixel: 0 },
    ...overrides,
  };
}

describe('captureGridState', () => {
  it('reads grid state and viewport anchor from the api', () => {
    const api = {
      getState: () => ({ sort: { sortModel: [] } }),
      getFirstDisplayedRowIndex: () => 5,
      getHorizontalPixelRange: () => ({ left: 120, right: 800 }),
      getAllDisplayedColumns: () => [{
        getColId: () => 'price',
        getLeft: () => 100,
        getActualWidth: () => 80,
      }],
      getGridOption: (key: string) => (key === 'quickFilterText' ? 'USD' : undefined),
    } as unknown as GridApi;

    const snap = captureGridState(api);
    expect(snap.schemaVersion).toBe(GRID_STATE_SCHEMA_VERSION);
    expect(snap.gridState).toEqual({ sort: { sortModel: [] } });
    expect(snap.viewportAnchor).toEqual({
      firstRowIndex: 5,
      leftColId: 'price',
      horizontalPixel: 120,
    });
    expect(snap.quickFilter).toBe('USD');
  });

  it('swallows api errors and still returns a snapshot shell', () => {
    const api = {
      getState: () => {
        throw new Error('boom');
      },
      getFirstDisplayedRowIndex: () => {
        throw new Error('boom');
      },
      getGridOption: () => {
        throw new Error('boom');
      },
    } as unknown as GridApi;
    expect(captureGridState(api).gridState).toEqual({});
  });
});

describe('applyGridState', () => {
  it('sanitizes malformed set-filter entries before setState', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const setState = vi.fn();
    const api = {
      setState,
      getDisplayedRowCount: () => 0,
      addEventListener: vi.fn(),
    } as unknown as GridApi;

    applyGridState(api, saved({
      gridState: {
        filter: {
          filterModel: {
            status: { filterType: 'set', values: undefined },
            ok: { filterType: 'text', filter: 'x' },
          },
        },
      },
    }));

    expect(setState).toHaveBeenCalled();
    const passed = setState.mock.calls[0]?.[0] as {
      filter?: { filterModel?: Record<string, unknown> };
    };
    expect(passed.filter?.filterModel?.status).toBeUndefined();
    expect(passed.filter?.filterModel?.ok).toBeDefined();
    warn.mockRestore();
  });

  it('is a no-op for missing api or saved snapshot', () => {
    const api = { setState: vi.fn() } as unknown as GridApi;
    applyGridState(null as unknown as GridApi, saved());
    applyGridState(api, null as unknown as SavedGridState);
    expect(api.setState).not.toHaveBeenCalled();
  });

  it('captureGridStateInto writes into the store module slice', () => {
    const api = {
      getState: () => ({}),
      getFirstDisplayedRowIndex: () => 0,
      getGridOption: () => undefined,
    } as unknown as GridApi;
    const setModuleState = vi.fn();
    captureGridStateInto({ setModuleState } as never, api);
    expect(setModuleState).toHaveBeenCalledWith('grid-state', expect.any(Function));
    const reducer = setModuleState.mock.calls[0]?.[1] as () => { saved: SavedGridState };
    expect(reducer().saved.schemaVersion).toBe(GRID_STATE_SCHEMA_VERSION);
  });
});
