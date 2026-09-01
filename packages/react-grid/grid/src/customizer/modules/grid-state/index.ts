/**
 * Grid State module — persists the native AG-Grid state (column order /
 * visibility / width / sort / filter / column groups / pagination / sidebar /
 * focus / selection) plus a viewport anchor + quick-filter text.
 *
 * Capture happens ONLY on explicit Save (see `captureGridStateInto`).
 * Replay fires on grid-ready (cold mount with a pre-loaded profile) and
 * on `profile:loaded` (profile switch while the grid is already mounted).
 *
 * Priority 200 — runs AFTER every column-structure module so replay sees
 * the final column set before re-applying colIds in the saved state.
 *
 * AG-Grid's `GridStateModule` must be registered globally — it ships in
 * `AllEnterpriseModule`, which MarketsGrid already registers.
 */
import type { Module, PlatformHandle } from '@wellsfargo-starui/core';
import {
  GRID_STATE_SCHEMA_VERSION,
  INITIAL_GRID_STATE,
  type GridStateState,
  type SavedGridState,
} from './state';
import { applyGridState } from './helpers';

export const GRID_STATE_MODULE_ID = 'grid-state';

export const gridStateModule: Module<GridStateState> = {
  id: GRID_STATE_MODULE_ID,
  name: 'Grid State',
  schemaVersion: GRID_STATE_SCHEMA_VERSION,
  priority: 200,

  getInitialState: () => ({ ...INITIAL_GRID_STATE }),

  activate(platform: PlatformHandle<GridStateState>): () => void {
    // The snapshot most recently handed to `applyGridState`, compared by
    // IDENTITY. Both replay paths below can fire for the same load — a full
    // `ProfileManager.load()` runs `deserializeAll` (which emits
    // `module:stateChanged` per module) and then emits `profile:loaded`, so
    // without this the state would be applied twice, and `applyGridState`
    // restores scroll position — a visible double jump, not just wasted work.
    // A scoped sync produces a fresh object from `deserialize`, so it never
    // collides with this guard.
    let lastApplied: SavedGridState | null = null;
    const applyOnce = (api: Parameters<typeof applyGridState>[0], saved: SavedGridState): void => {
      if (saved === lastApplied) return;
      lastApplied = saved;
      applyGridState(api, saved);
    };

    // Replay on grid-ready for the cold-mount case (profile loaded before
    // the grid existed).
    const disposeReady = platform.api.onReady((api) => {
      const state = platform.getState();
      if (state.saved) applyOnce(api, state.saved);
    });

    // Replay on a SCOPED module sync — the assistant (or another window)
    // writing just this module's slice. `ProfileManager.syncModules` calls
    // `deserializeOne`, which sets module state and emits this event but
    // never re-applies it to the live grid; without this listener a
    // grid-state write only showed up after a full reload, which is exactly
    // what scoped sync exists to avoid. This is what makes sort, filters,
    // quick filter and row-group expansion applicable live.
    const disposeSync = platform.events.on('module:stateChanged', (e) => {
      if (e.moduleId !== GRID_STATE_MODULE_ID) return;
      const api = platform.api.api;
      if (!api) return;
      const state = platform.getState();
      if (state.saved) applyOnce(api, state.saved);
    });

    // Replay on profile:loaded — profile switched while the grid is live.
    const disposeProfile = platform.events.on('profile:loaded', () => {
      const api = platform.api.api;
      if (!api) return;
      const state = platform.getState();
      if (state.saved) {
        applyOnce(api, state.saved);
        return;
      }
      lastApplied = null;
      // Freshly-loaded / newly-created profile has no saved state —
      // reset the live grid so columns / sort / filters from the
      // previous profile don't leak through (AG-Grid owns native state,
      // not module transforms).
      try {
        api.setState({});
        api.setGridOption('quickFilterText', '');
      } catch (err) {
        console.warn('[grid-state] failed to reset live grid:', err);
      }
    });

    return () => {
      disposeReady();
      disposeSync();
      disposeProfile();
    };
  },

  // On-disk shape matches the standalone `agGridStateManager.ts` format —
  // a snapshot captured by either path can be loaded by the other.
  serialize: (state) => state.saved,

  deserialize: (raw) => {
    if (!raw || typeof raw !== 'object') return { saved: null };
    const candidate = raw as SavedGridState;
    if (typeof candidate.gridState !== 'object' || candidate.gridState === null) {
      return { saved: null };
    }
    return { saved: candidate };
  },
};

export { INITIAL_GRID_STATE, GRID_STATE_SCHEMA_VERSION } from './state';
export type { GridStateState, SavedGridState } from './state';
export {
  captureGridState,
  applyGridState,
  captureGridStateInto,
} from './helpers';
