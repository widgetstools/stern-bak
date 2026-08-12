/**
 * Pure helpers — capture/apply grid state against a live GridApi.
 *
 * Extracted from `agGridStateManager.ts` and kept framework-free so they can
 * be imported by the module's lifecycle hooks AND by the host (for the
 * "capture on explicit Save" wiring in MarketsGrid).
 */
import type { GridApi } from 'ag-grid-community';
// Relative on purpose — package self-imports create a barrel cycle.
import type { Store } from '../../../platform/types';
import {
  GRID_STATE_SCHEMA_VERSION,
  type GridStateState,
  type SavedGridState,
} from './state';

/**
 * Strip filter-model entries that would crash AG-Grid's per-handler
 * validateModel. The known landmine is `agSetColumnFilter` —
 * SetFilterHandler.validateModel iterates `model.values` without a null
 * check, so an entry whose `values` is anything other than an array
 * blows up the whole api.setState call. We drop just that entry, log
 * which colId was bad, and let the rest of the profile restore cleanly.
 *
 * Recurses into multi-filter envelopes so a malformed set sub-filter
 * inside a multi-filter is dropped too. Returns a fresh object —
 * doesn't mutate the input.
 */
function sanitizeGridState(state: unknown): unknown {
  if (!state || typeof state !== 'object') return state;
  const cloned = JSON.parse(JSON.stringify(state)) as {
    filter?: { filterModel?: Record<string, unknown> };
  };
  const fm = cloned.filter?.filterModel;
  if (fm && typeof fm === 'object') {
    cloned.filter!.filterModel = sanitizeFilterModel(fm);
  }
  return cloned;
}

function sanitizeFilterModel(
  model: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [colId, raw] of Object.entries(model)) {
    const sanitized = sanitizeFilterEntry(raw, colId);
    if (sanitized !== undefined) out[colId] = sanitized;
  }
  return out;
}

function sanitizeFilterEntry(entry: unknown, colId: string): unknown {
  if (!entry || typeof entry !== 'object') return entry;
  const e = entry as { filterType?: string; values?: unknown; filterModels?: unknown[] };
  if (e.filterType === 'set' && !Array.isArray(e.values)) {
    console.warn(
      `[grid-state] dropping malformed set-filter entry for col "${colId}" — \`values\` is not an array; would crash AG-Grid validateModel.`,
      entry,
    );
    return undefined;
  }
  if (e.filterType === 'multi' && Array.isArray(e.filterModels)) {
    // Recurse into sub-filter slots; drop bad ones (replace with null).
    const cleanedSubs = e.filterModels.map((sub, i) =>
      sanitizeFilterEntry(sub, `${colId}.sub${i}`) ?? null,
    );
    return { ...e, filterModels: cleanedSubs };
  }
  return entry;
}

/**
 * Read the current grid state off a live api. Safe to call any time after
 * `onGridReady`. Never throws — on API shape drift returns a minimal
 * snapshot with empty gridState so the caller can still persist *something*.
 */
export function captureGridState(api: GridApi): SavedGridState {
  const gridState = (() => {
    try {
      return api.getState();
    } catch {
      return {} as ReturnType<GridApi['getState']>;
    }
  })();

  // Viewport anchor — persisted so the user returns to the row + column they
  // were looking at. Persisting a colId rather than raw pixels survives
  // column resize/reorder; we keep the raw pixel as a fallback.
  let firstRowIndex = 0;
  let leftColId: string | null = null;
  let horizontalPixel = 0;
  try {
    firstRowIndex = api.getFirstDisplayedRowIndex();
    const hRange = api.getHorizontalPixelRange?.();
    if (hRange) {
      horizontalPixel = hRange.left;
      const displayed = api.getAllDisplayedColumns();
      const hit = displayed.find((c) => {
        const left = c.getLeft();
        return left != null && left + c.getActualWidth() > hRange.left;
      });
      leftColId = hit?.getColId() ?? null;
    }
  } catch {
    /* best-effort — leave anchor at defaults */
  }

  let quickFilter: string | undefined;
  try {
    const q = api.getGridOption('quickFilterText');
    if (q) quickFilter = q;
  } catch {
    /* ignore */
  }

  return {
    schemaVersion: GRID_STATE_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    gridState,
    viewportAnchor: { firstRowIndex, leftColId, horizontalPixel },
    quickFilter,
  };
}

/**
 * Apply a previously-captured snapshot to a live grid. `api.setState()`
 * handles columns/filters/sort/pagination/selection etc. natively; the
 * viewport anchor and quick-filter are replayed separately.
 */
export function applyGridState(api: GridApi, saved: SavedGridState): void {
  if (!api || !saved) return;
  if (saved.schemaVersion !== GRID_STATE_SCHEMA_VERSION) {
    console.warn(
      `[grid-state] schema mismatch (saved=${saved.schemaVersion}, ` +
        `current=${GRID_STATE_SCHEMA_VERSION}); attempting best-effort restore.`,
    );
  }

  // Sanitise the filter slice before handing to setState. AG-Grid 35.1's
  // SetFilterHandler.validateModel iterates `model.values` without a null
  // check — a malformed pill (set-filter entry whose `values` got
  // serialized as undefined / non-array) crashes the entire restore and
  // takes the rest of the saved state down with it. Strip the bad
  // entries so the rest of the profile loads cleanly. Same defensive
  // shape as FiltersToolbar's sanitizeFilterModel.
  const cleanedState = sanitizeGridState(saved.gridState);

  try {
    api.setState(cleanedState as Parameters<typeof api.setState>[0]);
  } catch (err) {
    console.warn('[grid-state] api.setState failed:', err);
  }

  // Explicit column-state restore — AG-Grid's `setState` silently drops
  // both the position AND the pinning of the auto-generated selection
  // column (colId `ag-Grid-SelectionColumn`). Saving a layout with the
  // checkbox column pinned to the far left, reloading, then watching it
  // snap back to the center zone is the symptom that led us here.
  //
  // Re-issue order + pinning via `applyColumnState` — that's the API
  // the docs recommend for programmatic column-state updates, and it
  // does correctly reorder / repin the selection column. Build each
  // entry from the three saved slices (columnOrder + columnPinning),
  // so passing `{ colId }` alone doesn't inadvertently reset pinning
  // to null.
  //
  // IMPORTANT — must run AFTER the grid's initial layout settles.
  // Calling inside `onGridReady` (synchronously with setState) is a
  // no-op for the selection column because AG-Grid hasn't finished
  // injecting + positioning auto-generated columns yet. Defer to the
  // next microtask AND bind a one-shot `firstDataRendered` listener as
  // a fallback for the "rows arrive later" cold-mount case.
  const orderedColIds = (saved.gridState as { columnOrder?: { orderedColIds?: string[] } })
    .columnOrder?.orderedColIds;
  const pinning = (saved.gridState as {
    columnPinning?: { leftColIds?: string[]; rightColIds?: string[] };
  }).columnPinning;
  // Build a colId → width map from the saved columnSizingModel. When we
  // re-issue applyColumnState for order + pinning, we pass the saved width
  // along with each entry. Without it, downstream columnDefs re-derivations
  // (driven by `maintainColumnOrder` → React re-render → AG-Grid reconciling
  // new prop references) can reset virtual columns back to their
  // `initialWidth`, silently clobbering the user's resize. Passing width
  // explicitly makes the restore idempotent.
  const sizingModel = (saved.gridState as {
    columnSizing?: { columnSizingModel?: Array<{ colId: string; width: number; flex?: number }> };
  }).columnSizing?.columnSizingModel;
  const savedWidth = new Map<string, number>();
  const savedFlex = new Map<string, number>();
  if (Array.isArray(sizingModel)) {
    for (const entry of sizingModel) {
      if (typeof entry.colId === 'string' && typeof entry.width === 'number') {
        savedWidth.set(entry.colId, entry.width);
      }
      if (typeof entry.colId === 'string' && typeof entry.flex === 'number') {
        savedFlex.set(entry.colId, entry.flex);
      }
    }
  }
  if (Array.isArray(orderedColIds) && orderedColIds.length > 0) {
    const leftPinned = new Set(pinning?.leftColIds ?? []);
    const rightPinned = new Set(pinning?.rightColIds ?? []);
    const reorder = () => {
      try {
        // Merge the saved column order with the grid's current column set
        // so columns that exist at reload time but weren't present when
        // the snapshot was captured (e.g. a newly-added calculated
        // column) still render. Without this, `applyColumnState` with
        // only the saved IDs effectively hides those new columns — the
        // user sees an empty column slot or no column at all.
        //
        // Resolution rule: preserve the saved order first, then append
        // any live column id not in the saved list in the order AG-Grid
        // currently has them.
        const saved = new Set(orderedColIds);
        const liveIds = api
          .getColumns?.()
          ?.map((c) => c.getColId())
          ?? [];
        const merged: string[] = [...orderedColIds];
        for (const id of liveIds) {
          if (!saved.has(id)) merged.push(id);
        }
        const nextState = merged.map((colId) => {
          const entry: {
            colId: string;
            pinned: 'left' | 'right' | null;
            width?: number;
            flex?: number;
          } = {
            colId,
            pinned: leftPinned.has(colId)
              ? 'left'
              : rightPinned.has(colId)
                ? 'right'
                : null,
          };
          // Re-assert the saved width/flex alongside order+pinning. AG-Grid's
          // `applyColumnState` treats unspecified properties as unchanged,
          // but a subsequent React-driven columnDefs re-derivation CAN
          // still reset them back to `initialWidth` for virtual columns —
          // passing width here keeps the saved value pinned down.
          const w = savedWidth.get(colId);
          if (typeof w === 'number') entry.width = w;
          const f = savedFlex.get(colId);
          if (typeof f === 'number') entry.flex = f;
          return entry;
        });
        api.applyColumnState({ state: nextState, applyOrder: true });
      } catch (err) {
        console.warn('[grid-state] applyColumnState restore failed:', err);
      }
    };
    // First attempt on the next microtask — covers the common case
    // where the grid's first render has already settled by the time
    // `applyGridState` is called (profile:loaded after grid:ready).
    queueMicrotask(reorder);
    // Second attempt on `firstDataRendered` — covers cold-mount where
    // row data arrives after applyGridState. One-shot listener so we
    // don't re-apply every time new data is paged in.
    try {
      const onFDR = () => {
        reorder();
        try {
          api.removeEventListener('firstDataRendered', onFDR);
        } catch {
          /* ignore */
        }
      };
      api.addEventListener('firstDataRendered', onFDR);
    } catch {
      /* ignore — non-blocking */
    }
  }

  if (saved.quickFilter !== undefined) {
    try {
      api.setGridOption('quickFilterText', saved.quickFilter);
    } catch {
      /* ignore */
    }
  }

  // Viewport — wait for rows to render so ensureIndexVisible has something
  // to scroll to.
  const restoreViewport = () => {
    try {
      const { firstRowIndex, leftColId, horizontalPixel } = saved.viewportAnchor;
      if (firstRowIndex >= 0 && firstRowIndex < api.getDisplayedRowCount()) {
        api.ensureIndexVisible(firstRowIndex, 'top');
      }
      if (leftColId && api.getColumn(leftColId)) {
        api.ensureColumnVisible(leftColId, 'start');
      } else if (horizontalPixel > 0) {
        // AG Grid 36 renamed `.ag-body-viewport` -> `.ag-grid-viewport`.
        const body = document.querySelector<HTMLElement>('.ag-grid-viewport');
        if (body) body.scrollLeft = horizontalPixel;
      }
    } catch {
      /* best-effort */
    }
  };

  try {
    if (api.getDisplayedRowCount() > 0) {
      queueMicrotask(restoreViewport);
    } else {
      const handler = () => {
        restoreViewport();
        try {
          api.removeEventListener('firstDataRendered', handler);
        } catch {
          /* ignore */
        }
      };
      api.addEventListener('firstDataRendered', handler);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Host-facing helper. Captures the current grid state and writes it into the
 * grid-state module slice on the store. Called by MarketsGrid's Save button
 * handler immediately before `profiles.saveActiveProfile()` — the subsequent
 * `core.serializeAll()` that runs inside `persistSnapshot` then picks up the
 * just-captured state and persists it alongside every other module's state.
 */
export function captureGridStateInto(store: Store, api: GridApi): void {
  const saved = captureGridState(api);
  store.setModuleState<GridStateState>('grid-state', () => ({ saved }));
}
