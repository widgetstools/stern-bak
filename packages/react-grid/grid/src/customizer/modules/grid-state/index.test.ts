import { describe, expect, it, vi } from 'vitest';
import { INITIAL_GRID_STATE } from './state';
import { gridStateModule, GRID_STATE_MODULE_ID } from './index';

describe('gridStateModule', () => {
  it('registers with high replay priority', () => {
    expect(gridStateModule.id).toBe(GRID_STATE_MODULE_ID);
    expect(gridStateModule.priority).toBe(200);
  });

  it('getInitialState returns saved null', () => {
    expect(gridStateModule.getInitialState()).toEqual(INITIAL_GRID_STATE);
  });

  it('deserialize rejects malformed snapshots', () => {
    expect(gridStateModule.deserialize!(null)).toEqual({ saved: null });
    expect(gridStateModule.deserialize!({ gridState: null })).toEqual({ saved: null });
  });

  it('deserialize accepts valid saved state', () => {
    const saved = { gridState: { columnOrder: { orderedColIds: ['a'] } }, viewportAnchor: null, quickFilterText: '' };
    expect(gridStateModule.deserialize!(saved)).toEqual({ saved });
  });

  it('serialize returns saved snapshot only', () => {
    const state = { saved: { gridState: {}, viewportAnchor: null, quickFilterText: '' } };
    expect(gridStateModule.serialize!(state)).toBe(state.saved);
  });

  it('activate replays saved state on grid ready', () => {
    const setState = vi.fn();
    const setGridOption = vi.fn();
    const applyColumnState = vi.fn();
    const api = { setState, setGridOption, applyColumnState };
    const readyCb: Array<(api: typeof api) => void> = [];
    const platform = {
      getState: () => ({
        saved: {
          gridState: { version: 3, columnOrder: { orderedColIds: ['a'] } },
          viewportAnchor: { firstRowIndex: 0, leftColId: null, horizontalPixel: 0 },
          quickFilter: 'find',
        },
      }),
      api: {
        api,
        onReady: (cb: (api: typeof api) => void) => {
          readyCb.push(cb);
          return () => {};
        },
      },
      events: { on: () => () => {} },
    };

    gridStateModule.activate!(platform as never);
    readyCb[0]?.(api);
    expect(setState).toHaveBeenCalled();
    expect(setGridOption).toHaveBeenCalledWith('quickFilterText', 'find');
  });

  it('activate resets live grid when profile loads without saved state', () => {
    const setState = vi.fn();
    const setGridOption = vi.fn();
    const api = { setState, setGridOption };
    const profileHandlers: Array<() => void> = [];
    const platform = {
      getState: () => ({ saved: null }),
      api: { api, onReady: () => () => {} },
      events: {
        on: (evt: string, cb: () => void) => {
          if (evt === 'profile:loaded') profileHandlers.push(cb);
          return () => {};
        },
      },
    };

    gridStateModule.activate!(platform as never);
    profileHandlers[0]?.();
    expect(setState).toHaveBeenCalledWith({});
    expect(setGridOption).toHaveBeenCalledWith('quickFilterText', '');
  });
});

/**
 * A scoped module sync (`ProfileManager.syncModules` → `deserializeOne`) sets
 * this module's state and emits `module:stateChanged`, but used to re-apply
 * nothing — so a grid-state write from the assistant only appeared after a
 * full reload. These cover the listener that closes that gap, and the
 * double-apply guard it needs.
 */
describe('gridStateModule — live re-apply on scoped sync', () => {
  function harness(savedSeq: Array<unknown>) {
    const setState = vi.fn();
    const setGridOption = vi.fn();
    const applyColumnState = vi.fn();
    const api = { setState, setGridOption, applyColumnState };
    const handlers: Record<string, Array<(e?: unknown) => void>> = {};
    let index = 0;
    const platform = {
      getState: () => ({ saved: savedSeq[Math.min(index, savedSeq.length - 1)] }),
      api: { api, onReady: () => () => {} },
      events: {
        on: (evt: string, cb: (e?: unknown) => void) => {
          (handlers[evt] ??= []).push(cb);
          return () => {};
        },
      },
    };
    gridStateModule.activate!(platform as never);
    return {
      setState,
      fireSync: (moduleId: string) => handlers['module:stateChanged']?.forEach((h) => h({ moduleId })),
      fireProfileLoaded: () => handlers['profile:loaded']?.forEach((h) => h()),
      advance: () => { index += 1; },
    };
  }

  const snap = (colId: string) => ({
    gridState: { version: 3, columnOrder: { orderedColIds: [colId] } },
    viewportAnchor: { firstRowIndex: 0, leftColId: null, horizontalPixel: 0 },
  });

  it('applies the saved state when this module is scope-synced', () => {
    const h = harness([snap('a')]);
    h.fireSync(GRID_STATE_MODULE_ID);
    expect(h.setState).toHaveBeenCalledTimes(1);
  });

  it('ignores a scope-sync of a different module', () => {
    const h = harness([snap('a')]);
    h.fireSync('conditional-styling');
    h.fireSync('column-customization');
    expect(h.setState).not.toHaveBeenCalled();
  });

  /**
   * The guard that matters: a full `ProfileManager.load()` runs
   * `deserializeAll` (emitting module:stateChanged) AND then emits
   * `profile:loaded`. Applying twice would replay the scroll/viewport
   * restore twice — a visible jump.
   */
  it('does not re-apply the same snapshot twice across both replay paths', () => {
    const h = harness([snap('a')]);
    h.fireSync(GRID_STATE_MODULE_ID);
    h.fireProfileLoaded();
    expect(h.setState).toHaveBeenCalledTimes(1);
  });

  it('does apply again when the snapshot is genuinely a new one', () => {
    const h = harness([snap('a'), snap('b')]);
    h.fireSync(GRID_STATE_MODULE_ID);
    h.advance();
    h.fireSync(GRID_STATE_MODULE_ID);
    expect(h.setState).toHaveBeenCalledTimes(2);
  });

  it('no-ops when the grid is not ready yet', () => {
    const handlers: Record<string, Array<(e?: unknown) => void>> = {};
    const platform = {
      getState: () => ({ saved: snap('a') }),
      api: { api: null, onReady: () => () => {} },
      events: {
        on: (evt: string, cb: (e?: unknown) => void) => {
          (handlers[evt] ??= []).push(cb);
          return () => {};
        },
      },
    };
    gridStateModule.activate!(platform as never);
    expect(() => handlers['module:stateChanged']?.forEach((h) => h({ moduleId: GRID_STATE_MODULE_ID }))).not.toThrow();
  });
});
