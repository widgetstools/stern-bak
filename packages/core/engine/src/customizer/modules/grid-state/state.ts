/**
 * Grid State — captures the native AG-Grid state (column order / visibility /
 * width / sort / filter / column-groups / pagination / sidebar / focus /
 * selection / etc.) plus a viewport anchor + quick filter text, so that the
 * user's exact configuration is restored when a profile is reloaded.
 *
 * Unlike every other v2 module, this one's state is NOT authored in a
 * settings panel — it's captured from the live grid API when the user
 * explicitly clicks Save (see `captureGridStateInto` in ./helpers). The
 * module then replays it through `api.setState()` on `grid:ready` or
 * `profile:loaded`.
 *
 * The `GridState` type comes from ag-grid-community and is already JSON-safe.
 */
import type { GridState } from 'ag-grid-community';

export const GRID_STATE_SCHEMA_VERSION = 3;

/**
 * Exact on-disk shape. Mirrors the reference `SavedGridState` from
 * `agGridStateManager.ts` — kept compatible so a snapshot captured with the
 * standalone helper can be loaded through the module and vice versa.
 */
export interface SavedGridState {
  schemaVersion: number;
  savedAt: string;
  gridState: GridState;
  viewportAnchor: {
    firstRowIndex: number;
    leftColId: string | null;
    horizontalPixel: number;
  };
  quickFilter?: string;
}

export interface GridStateState {
  /** Most recent capture — null until the user clicks Save for the first time
   *  (or until a profile with saved state is loaded). */
  saved: SavedGridState | null;
}

export const INITIAL_GRID_STATE: GridStateState = { saved: null };
