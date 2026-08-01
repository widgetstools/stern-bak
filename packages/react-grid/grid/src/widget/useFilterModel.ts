/**
 * useFilterModel — owns the saved-filter model state for FiltersToolbar.
 *
 * Subscribes to the platform's `filterChanged` event (via the typed
 * ApiHub, which auto-disposes its handlers) and exposes the live saved-
 * filter list + per-pill row counts + a `hasNewFilter` flag plus all
 * imperative handlers the toolbar's JSX wires to.
 *
 * Why a hook: extracts ~400 LOC of state, effects, and event wiring out
 * of `FiltersToolbar.tsx` so the toolbar reduces to pure JSX. The hook
 * is the single source of `filterChanged` subscription truth — old code
 * registered the watcher inside the component body, so an in-flight
 * filter event arriving past unmount would dispatch into a stale React
 * setter. The disposers returned from `platform.api.on(...)` close that
 * window.
 *
 * Internal-only — not exported from the package barrel.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { GridApi, IRowNode } from 'ag-grid-community';
import type { RowChange } from '@wellsfargo-starui/core';
import {
  useGridApi,
  useGridPlatform,
  useModuleState,
  type SavedFiltersState,
} from '../customizer/index.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import {
  doesRowMatchFilterModel,
  generateLabel,
  isNewFilter,
  makeId,
  mergeFilterModels,
  subtractFilterModel,
} from './filtersToolbarLogic';
import type { SavedFilter } from './types';

// ─── AG-Grid v35 shape repair ──────────────────────────────────────────
//
// Drop / repair per-column entries whose shape would crash AG-Grid v35's
// filter handlers. The known landmine: `agSetColumnFilter`'s
// `validateModel` iterates `entry.values` and throws
// `TypeError: model.values is not iterable` when `values` isn't an
// array — taking down the whole `<FiltersToolbar>` subtree mid-render
// and leaving the grid in a corrupt filter state where floating-filter
// inputs no longer accept keystrokes.

/**
 * Walk a single column-entry and clean up shapes that would crash
 * AG-Grid's filter handlers. Returns either the (possibly repaired)
 * entry, or `null` if the entry is unsalvageable and must be dropped.
 *
 * Handled cases:
 *   - top-level set filter w/ non-array `values` → repair (coerce
 *     `{0:..,1:..}` back to an array; default to `[]`)
 *   - bare object with `values` that isn't an array (quacks like a
 *     set filter even though no `filterType` is set) → same repair
 *   - multi-filter envelope (`filterType:'multi'`, `filterModels:[...]`)
 *     → recurse into each child; surviving slot positions are
 *     preserved (AG-Grid tolerates `null` slots)
 */
function sanitizeFilterEntry(colId: string, entry: unknown): unknown | null {
  if (!entry || typeof entry !== 'object') return entry;
  const e = entry as { filterType?: string; values?: unknown; filterModels?: unknown[] };

  if (e.filterType === 'multi' && Array.isArray(e.filterModels)) {
    const cleaned: unknown[] = [];
    let dropped = false;
    for (const child of e.filterModels) {
      const sane = sanitizeFilterEntry(colId, child);
      if (sane == null && child != null) {
        dropped = true;
        continue;
      }
      cleaned.push(sane);
    }
    if (dropped) {
      const rebuilt = e.filterModels.map((child) => sanitizeFilterEntry(colId, child));
      return { ...e, filterModels: rebuilt };
    }
    return { ...e, filterModels: cleaned };
  }

  const looksLikeSet = e.filterType === 'set' || (e.values !== undefined && e.filterType == null);
  if (looksLikeSet && !Array.isArray(e.values)) {
    let recovered: unknown[] = [];
    if (e.values && typeof e.values === 'object') {
      const vs = e.values as Record<string, unknown>;
      const numericKeys = Object.keys(vs).every((k) => /^\d+$/.test(k));
      if (numericKeys) recovered = Object.values(vs);
    }
    // eslint-disable-next-line no-console
    console.warn(
      `[FiltersToolbar] repairing malformed set-filter entry for col "${colId}" — coerced \`values\` to array (${recovered.length} item${recovered.length === 1 ? '' : 's'}).`,
      { original: entry, recovered },
    );
    return { ...e, values: recovered };
  }

  return entry;
}

function sanitizeFilterModel(
  model: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (model == null) return null;
  const out: Record<string, unknown> = {};
  for (const [colId, entry] of Object.entries(model)) {
    const sane = sanitizeFilterEntry(colId, entry);
    if (sane == null) continue;
    out[colId] = sane;
  }
  return out;
}

function filterCountsEqual(
  a: Readonly<Record<string, number>>,
  b: Readonly<Record<string, number>>,
): boolean {
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  for (const k of keysA) {
    if (a[k] !== b[k]) return false;
  }
  return true;
}

/**
 * Equality check for AG-Grid filter models. Top-level keys are column ids
 * whose entries are filter-shape objects (operator/type/value/...). Fast
 * path: Object.is on each entry — hits whenever sanitize/merge preserved
 * references (the common case). Slow path: JSON compare per drifted key —
 * O(entry size) only for the entries that actually differ.
 */
function filterModelsEqual(
  a: Record<string, unknown> | null,
  b: Record<string, unknown> | null,
): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  for (const k of keysA) {
    if (Object.is(a[k], b[k])) continue;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return false;
  }
  return true;
}

export interface UseFilterModelResult {
  /** Saved filter pills as normalized records. Stable identity per filters list. */
  readonly filters: readonly SavedFilter[];
  /** Per-pill row-count badges, keyed by filter id. */
  readonly filterCounts: Readonly<Record<string, number>>;
  /** True when the live grid filter is genuinely new (enables the "+" button). */
  readonly hasNewFilter: boolean;
  /** Capture the live grid's net-new filter as a new pill. No-op when nothing new. */
  addFromLive(): void;
  /** Toggle a pill active/inactive. */
  toggle(id: string): void;
  /** Remove a pill. */
  remove(id: string): void;
  /** Rename a pill. Empty / whitespace trims to no-op. */
  rename(id: string, label: string): void;
  /** Deactivate every pill (UI's "Clear all filters" button). */
  deactivateAll(): void;
  /** Replace a pill's underlying filterModel (the JSON editor's Save). */
  editFilterModel(id: string, nextModel: Record<string, unknown>): void;
}

/**
 * Normalises the saved-filters module state into a clean SavedFilter[] +
 * exposes a setter that re-normalises previous state for functional
 * updates. Internal building block for useFilterModel — keeps the v1→v2
 * shape-repair concern in one place.
 */
function useFilterNormalization(): {
  filters: SavedFilter[];
  setFilters: (next: SavedFilter[] | ((prev: SavedFilter[]) => SavedFilter[])) => void;
} {
  const [filtersState, setFiltersState] = useModuleState<SavedFiltersState>('saved-filters');

  // Normalize a raw record off the store: coerce `active`, default
  // missing `filterModel`, and run AG-Grid-shape repair so a stale
  // pill from an older profile (set-filter `values` serialized as
  // `{0:..,1:..}` or undefined, multi-filter children with malformed
  // children, etc.) doesn't crash AG-Grid mid-render. Idempotent —
  // safe to run on every render and on every write back.
  const normalizeFilter = useCallback((raw: unknown): SavedFilter | null => {
    if (!raw || typeof raw !== 'object') return null;
    const r = raw as Partial<SavedFilter> & Record<string, unknown>;
    if (typeof r.id !== 'string' || r.id.length === 0) return null;
    if (typeof r.label !== 'string' || r.label.length === 0) return null;
    const rawModel = (r.filterModel ?? {}) as Record<string, unknown> | null;
    const cleanModel = sanitizeFilterModel(rawModel) ?? {};
    return {
      id: r.id,
      label: r.label,
      active: Boolean(r.active),
      filterModel: cleanModel,
    };
  }, []);

  const filters = useMemo<SavedFilter[]>(() => {
    const raw = (filtersState?.filters ?? []) as unknown[];
    const out: SavedFilter[] = [];
    for (const item of raw) {
      const f = normalizeFilter(item);
      if (f) out.push(f);
    }
    return out;
  }, [filtersState, normalizeFilter]);

  const setFilters = useCallback(
    (next: SavedFilter[] | ((prev: SavedFilter[]) => SavedFilter[])) => {
      setFiltersState((prev) => {
        // Normalize prev before handing it to functional updaters so
        // toggle/remove/rename always operate on clean records, even
        // when the store still holds legacy entries from before the
        // module's v1→v2 migration ran.
        const prevList: SavedFilter[] = [];
        for (const item of (prev?.filters ?? []) as unknown[]) {
          const f = normalizeFilter(item);
          if (f) prevList.push(f);
        }
        const resolved = typeof next === 'function'
          ? (next as (p: SavedFilter[]) => SavedFilter[])(prevList)
          : next;
        return { ...prev, filters: resolved };
      });
    },
    [setFiltersState, normalizeFilter],
  );

  return { filters, setFilters };
}

/**
 * Per-pill row counts. Each pill renders a small count badge showing
 * how many rows this filter would match if applied. Recomputes on:
 *  - the filters list changing (new pill, renamed pill — label stays;
 *    count stays too unless the filter model changed, which it does
 *    here because pills are immutable once captured)
 *  - structural row changes (`RowChange.full` — sort / filter / setRowData)
 *  - incremental delta updates on streaming ticks (changed rows only)
 *  - `firstDataRendered` (cold-mount: data arrives after the
 *    toolbar renders once with empty counts)
 */
function useFilterCounts(filters: readonly SavedFilter[]): Record<string, number> {
  const platform = useGridPlatform();
  const [filterCounts, setFilterCounts] = useState<Record<string, number>>({});
  const filterCountsRef = useRef<Record<string, number>>({});
  const matchSetsRef = useRef<Map<string, Set<string>>>(new Map());

  useEffect(() => {
    const disposers: Array<() => void> = [];
    disposers.push(
      platform.api.onReady((liveApi) => {
        const clearCounts = () => {
          if (Object.keys(filterCountsRef.current).length === 0) return;
          matchSetsRef.current = new Map();
          filterCountsRef.current = {};
          setFilterCounts({});
        };

        const fullRecompute = () => {
          if (filters.length === 0) {
            clearCounts();
            return;
          }
          const matchSets = new Map<string, Set<string>>();
          const next: Record<string, number> = {};
          for (const f of filters) {
            matchSets.set(f.id, new Set());
            next[f.id] = 0;
          }
          try {
            liveApi.forEachNode((n) => {
              const data = n.data as Record<string, unknown> | undefined;
              const rowId = n.id;
              if (!data || typeof rowId !== 'string') return;
              for (const f of filters) {
                if (doesRowMatchFilterModel(data, f.filterModel)) {
                  matchSets.get(f.id)!.add(rowId);
                  next[f.id] += 1;
                }
              }
            });
          } catch {
            /* api mid-teardown */
          }
          matchSetsRef.current = matchSets;
          if (filterCountsEqual(filterCountsRef.current, next)) return;
          filterCountsRef.current = next;
          setFilterCounts(next);
        };

        const applyRowChange = (change: RowChange) => {
          if (filters.length === 0) {
            clearCounts();
            return;
          }
          if (change.full || matchSetsRef.current.size === 0) {
            fullRecompute();
            return;
          }

          const matchSets = matchSetsRef.current;
          const next = { ...filterCountsRef.current };
          let changed = false;

          const touchNode = (node: IRowNode, removed: boolean) => {
            const rowId = node.id;
            if (typeof rowId !== 'string') return;
            const data = node.data as Record<string, unknown> | undefined;
            for (const f of filters) {
              const set = matchSets.get(f.id);
              if (!set) continue;
              const was = set.has(rowId);
              const now = !removed && !!data && doesRowMatchFilterModel(data, f.filterModel);
              if (was === now) continue;
              changed = true;
              if (now) {
                set.add(rowId);
                next[f.id] = (next[f.id] ?? 0) + 1;
              } else {
                set.delete(rowId);
                next[f.id] = Math.max(0, (next[f.id] ?? 0) - 1);
              }
            }
          };

          for (const node of change.removed) touchNode(node, true);
          for (const node of change.added) touchNode(node, false);
          for (const node of change.updated) touchNode(node, false);

          if (!changed) return;
          if (filterCountsEqual(filterCountsRef.current, next)) return;
          filterCountsRef.current = next;
          setFilterCounts(next);
        };

        fullRecompute();
        disposers.push(platform.rows.subscribe(applyRowChange));
        disposers.push(platform.api.on('firstDataRendered', fullRecompute));
      }),
    );
    return () => { for (const d of disposers) d(); };
  }, [platform, filters]);

  return filterCounts;
}

/**
 * Pushes the merged active filter into AG-Grid on every relevant trigger
 * (filter-list change, profile:loaded, firstDataRendered) and watches
 * `filterChanged` to flag user-initiated filter drift via `hasNewFilter`.
 *
 * `hasNewFilter` is true when the live AG-Grid filter model contains
 * something the active saved-filter pills haven't already captured. The
 * "+" button is enabled ONLY when true — without this guard, the button
 * stays enabled whenever any filter is applied (including already-saved
 * ones) and clicking duplicates the active saved filter(s) into a new pill.
 */
function useFilterModelSync(filters: readonly SavedFilter[]): boolean {
  const platform = useGridPlatform();
  const api = useGridApi();
  const [hasNewFilter, setHasNewFilter] = useState(false);

  // Latest filters captured in a ref so platform-level listeners
  // (profile:loaded, firstDataRendered) can reach the freshest list
  // without re-registering on every change.
  const filtersRef = useRef(filters);
  useEffect(() => { filtersRef.current = filters; }, [filters]);

  // Compute and push the merged active filter model into a live api.
  // Centralised so the React effect, profile:loaded listener, and
  // firstDataRendered listener all use the exact same code path.
  const pushActiveFilterModel = useCallback((liveApi: GridApi) => {
    const syncHasNewFilter = () => {
      const raw = liveApi.getFilterModel() as Record<string, unknown> | null;
      const live = sanitizeFilterModel(raw);
      setHasNewFilter(isNewFilter(live, filtersRef.current));
    };

    const list = filtersRef.current;
    const active = list.filter((f) => f.active);
    let model: Record<string, unknown> | null;
    if (active.length === 0) model = null;
    else if (active.length === 1) model = active[0].filterModel;
    else model = mergeFilterModels(active.map((f) => f.filterModel));
    try {
      // Guard: AG-Grid v35's SetFilterHandler.validateModel iterates
      // `model.values` and crashes uncaught if it isn't an array. A
      // malformed pill (set-filter entry whose `values` got serialized
      // as undefined / object / string) would take down the whole grid
      // mount. Sanitize first; on throw, log and skip so the grid stays
      // usable.
      const nextModel = sanitizeFilterModel(model);
      const currentModel = sanitizeFilterModel(
        liveApi.getFilterModel() as Record<string, unknown> | null,
      );
      if (filterModelsEqual(nextModel, currentModel)) {
        syncHasNewFilter();
        return;
      }
      liveApi.setFilterModel(nextModel);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[FiltersToolbar] setFilterModel threw — ignoring this push so the grid stays usable.', { model, err });
    }
    syncHasNewFilter();
  }, []);

  // ─── Push the merged filter into AG-Grid whenever the active set changes ─
  // Handles in-session edits (toggle, add, remove, rename, edit-model).
  useEffect(() => {
    if (!api) return;
    pushActiveFilterModel(api);
  }, [api, filters, pushActiveFilterModel]);

  // ─── Re-push on profile:loaded ──────────────────────────────────────────
  // The `grid-state` module restores AG-Grid's *native* filter model via
  // `api.setState(savedGridState)` on `profile:loaded`. When the loaded
  // profile has no captured grid-state (state.saved === null), grid-state
  // calls `api.setState({})` which CLEARS the filter — so the saved-filter
  // pills' active set must be re-pushed AFTER that runs. Listener
  // registration here happens after `grid-state.activate()` (modules
  // activate before child components mount), and the event bus fires
  // listeners in registration order — so this listener runs after
  // grid-state's, guaranteeing the saved-filter model wins.
  useEffect(() => {
    return platform.events.on('profile:loaded', () => {
      const liveApi = platform.api.api;
      if (liveApi) pushActiveFilterModel(liveApi);
    });
  }, [platform, pushActiveFilterModel]);

  // ─── Re-push once on firstDataRendered ──────────────────────────────────
  // Cold-mount safety net: at first profile-load, setFilterModel may run
  // before AG-Grid has fully registered its columns (column transforms
  // can race with profile deserialize). Re-applying once after AG-Grid
  // signals firstDataRendered ensures the active pill's filter is live
  // by the time the user sees rows.
  useEffect(() => {
    let fired = false;
    const dispose = platform.api.on('firstDataRendered', () => {
      if (fired) return;
      fired = true;
      const liveApi = platform.api.api;
      if (liveApi) pushActiveFilterModel(liveApi);
    });
    return dispose;
  }, [platform, pushActiveFilterModel]);

  // ─── Watch AG-Grid for user-initiated filter edits ──────────────────────
  //
  // `filterChanged` fires any time the filter model mutates — including
  // when we push the saved-filters model in programmatically. We filter
  // out echoes AND duplicates-of-inactive-pills via `isNewFilter`, which
  // compares the live model against EVERY saved pill (active + inactive)
  // plus the merged-active echo. Only a genuinely-unseen filter enables
  // the + button; re-entering a previously-saved (even deactivated)
  // filter keeps + disabled so it can't be duplicated.
  useEffect(() => {
    const disposers: Array<() => void> = [];
    disposers.push(
      platform.api.onReady((liveApi) => {
        const check = () => {
          const raw = liveApi.getFilterModel() as Record<string, unknown> | null;
          const live = sanitizeFilterModel(raw);
          const next = isNewFilter(live, filtersRef.current);
          setHasNewFilter((prev) => (prev === next ? prev : next));
        };
        disposers.push(platform.api.on('filterChanged', check));
        // Run once up front so the flag reflects any model the grid
        // already carries at mount (e.g. after profile load restored it).
        check();
      }),
    );
    return () => { for (const d of disposers) d(); };
  }, [platform, filters]);

  return hasNewFilter;
}

/**
 * Owns saved-filter state + the wiring between AG-Grid's live filter
 * and the per-profile `saved-filters` module. Returns a stable
 * imperative surface for FiltersToolbar.
 *
 * Thin composition of three sibling hooks:
 *  - useFilterNormalization → cleaned filters list + setFilters
 *  - useFilterCounts        → per-pill row-count badges
 *  - useFilterModelSync     → AG-Grid push/watch effects + hasNewFilter
 *
 * The orchestrator below adds only the imperative actions that mutate the
 * filters list (the toolbar buttons' click handlers).
 */
export function useFilterModel(): UseFilterModelResult {
  const api = useGridApi();
  const { filters, setFilters } = useFilterNormalization();
  const filterCounts = useFilterCounts(filters);
  const hasNewFilter = useFilterModelSync(filters);

  // ─── Imperative handlers ───────────────────────────────────────────────

  const addFromLive = useCallback(() => {
    if (!api) return;
    const liveModel = api.getFilterModel() as Record<string, unknown> | null;
    if (!liveModel || Object.keys(liveModel).length === 0) return;

    setFilters((prev) => {
      // Belt-and-braces: even if a race let the + button render enabled,
      // drop the click when the live model would duplicate any existing
      // pill (active OR inactive).
      if (!isNewFilter(liveModel, prev)) return prev;

      // Capture ONLY the net-new criterion — subtract the merged model of
      // currently-active pills from `liveModel`. Otherwise the new pill
      // would carry every active pill's filter in addition to the new
      // one, which duplicates that criterion and breaks toggle semantics.
      const active = prev.filter((f) => f.active);
      const activeMerged = active.length === 0
        ? {}
        : active.length === 1
          ? active[0].filterModel
          : mergeFilterModels(active.map((f) => f.filterModel));
      const delta = subtractFilterModel(liveModel, activeMerged);

      if (Object.keys(delta).length === 0) return prev;

      const next: SavedFilter = {
        id: makeId(),
        label: generateLabel(delta, prev.length),
        filterModel: delta,
        active: true,
      };
      return [...prev, next];
    });
  }, [api, setFilters]);

  const toggle = useCallback(
    (id: string) =>
      setFilters((prev) => prev.map((f) => (f.id === id ? { ...f, active: !f.active } : f))),
    [setFilters],
  );

  const remove = useCallback(
    (id: string) => setFilters((prev) => prev.filter((f) => f.id !== id)),
    [setFilters],
  );

  const rename = useCallback(
    (id: string, label: string) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      setFilters((prev) => prev.map((f) => (f.id === id ? { ...f, label: trimmed } : f)));
    },
    [setFilters],
  );

  const deactivateAll = useCallback(
    () => setFilters((prev) => prev.map((f) => ({ ...f, active: false }))),
    [setFilters],
  );

  const editFilterModel = useCallback(
    (id: string, nextModel: Record<string, unknown>) => {
      setFilters((prev) =>
        prev.map((f) => (f.id === id ? { ...f, filterModel: nextModel } : f)),
      );
    },
    [setFilters],
  );

  return useMemo(
    () => ({
      filters,
      filterCounts,
      hasNewFilter,
      addFromLive,
      toggle,
      remove,
      rename,
      deactivateAll,
      editFilterModel,
    }),
    [
      filters,
      filterCounts,
      hasNewFilter,
      addFromLive,
      toggle,
      remove,
      rename,
      deactivateAll,
      editFilterModel,
    ],
  );
}
