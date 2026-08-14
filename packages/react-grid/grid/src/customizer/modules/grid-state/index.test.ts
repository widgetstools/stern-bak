import { describe, expect, it, vi } from 'vitest';
import { INITIAL_GRID_STATE } from '@wellsfargo-starui/core';
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
