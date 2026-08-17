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
} from '@wellsfargo-starui/core';
import { applyGridState, applyQuickFilterText } from '@wellsfargo-starui/core';

export const GRID_STATE_MODULE_ID = 'grid-state';

export const gridStateModule: Module<GridStateState> = {
  id: GRID_STATE_MODULE_ID,
  name: 'Grid State',
  category: 'options',
  schemaVersion: GRID_STATE_SCHEMA_VERSION,
  priority: 200,

  getInitialState: () => ({ ...INITIAL_GRID_STATE }),

  activate(platform: PlatformHandle<GridStateState>): () => void {
    // Replay on grid-ready for the cold-mount case (profile loaded before
    // the grid existed).
    const disposeReady = platform.api.onReady((api) => {
      const state = platform.getState();
      if (state.saved) applyGridState(api, state.saved);
    });

    // Replay on profile:loaded — profile switched while the grid is live.
    const disposeProfile = platform.events.on('profile:loaded', () => {
      const api = platform.api.api;
      if (!api) return;
      const state = platform.getState();
      if (state.saved) {
        applyGridState(api, state.saved);
        return;
      }
      // Freshly-loaded / newly-created profile has no saved state —
      // reset the live grid so columns / sort / filters from the
      // previous profile don't leak through (AG-Grid owns native state,
      // not module transforms).
      try {
        api.setState({});
      } catch (err) {
        console.warn('[grid-state] failed to reset live grid:', err);
      }
      // Separate from setState's try: clearing the term has to purge under
      // the server-side row model, and a setState failure must not skip it.
      applyQuickFilterText(api, '');
    });

    return () => {
      disposeReady();
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

export { INITIAL_GRID_STATE, GRID_STATE_SCHEMA_VERSION } from '@wellsfargo-starui/core';
export type { GridStateState, SavedGridState } from '@wellsfargo-starui/core';
export {
  captureGridState,
  applyGridState,
  captureGridStateInto,
} from '@wellsfargo-starui/core';
