/**
 * Minimal `GridCoreLike` — the shape panels / toolbars receive as a
 * prop when they need `getGridApi()` but don't warrant a full
 * `useGridPlatform()` binding.
 *
 * The v2-era `useGridCore()` + `useGridStore()` hooks that wrapped the
 * platform in this shape are GONE as of phase 4 — every module panel
 * migrated to `useModuleState(id)` / `useModuleDraft` / the platform
 * `useGridColumns()` hook, so the runtime shims had zero callers. This
 * file keeps the `GridCoreLike` type because the markets-grid
 * `FormattingToolbar` still threads `{ getGridApi, gridId }` through
 * its 40+ pure helpers as a prop rather than reading the platform
 * context from every helper.
 */
import type { GridApi } from 'ag-grid-community';

export interface GridCoreLike {
  readonly gridId: string;
  getGridApi(): GridApi | null;
}
