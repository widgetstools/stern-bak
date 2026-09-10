/**
 * Set-filter values for the server-side row model.
 *
 * A set filter builds its checkbox list by scanning row data. Under SSRM there
 * is no row data on the main thread, so AG Grid requires `filterParams.values`
 * to be supplied — otherwise the list renders empty and the column looks
 * broken while every other filter type works.
 *
 * Two entry points, because AG Grid resolves a column's filter from two
 * places and `filterParams` does NOT deep-merge between them:
 *   - {@link withSsrmSetFilterValues} walks the column defs (including
 *     `agMultiColumnFilter` sub-filter slots and column groups).
 *   - {@link withSsrmSetFilterDefaults} covers columns that inherit
 *     `filter: true` from `defaultColDef` and never name a filter themselves —
 *     with Enterprise registered, `filter: true` IS the set filter.
 *
 * Columns that already declare their own `values` are left alone: an explicit
 * list from the provider config wins.
 *
 * Two AG Grid filter params come along with the callback:
 *   - `refreshValuesOnOpen` — the cache is a live feed, so re-run the callback
 *     each time the user opens the list rather than refreshing lists nobody is
 *     looking at on every tick.
 *   - `suppressClearModelOnRefreshValues` — that refresh must not wipe the
 *     user's current selection, matching AG Grid's own server-side example.
 */
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';

/** Subset of AG Grid's `SetFilterValuesFuncParams` we rely on. */
interface SetFilterValuesFuncParams {
  success: (values: unknown[]) => void;
  column?: { getColId?: () => string };
  colDef?: { colId?: string; field?: string };
  api?: { getFilterModel?: () => Record<string, unknown> };
}

interface AnyFilterParams {
  values?: unknown;
  filters?: AnySubFilter[];
  suppressClearModelOnRefreshValues?: boolean;
  refreshValuesOnOpen?: boolean;
  [key: string]: unknown;
}

interface AnySubFilter {
  filter?: string;
  filterParams?: AnyFilterParams;
  [key: string]: unknown;
}

interface AnyColDef {
  colId?: string;
  field?: string;
  cellDataType?: unknown;
  filter?: unknown;
  filterParams?: AnyFilterParams;
  children?: AnyColDef[];
  [key: string]: unknown;
}

export interface WithSsrmSetFilterValuesOptions {
  /** Cap per column. Defaults to the worker's own limit. */
  limit?: number;
  /** Overridable for tests. See {@link VALUES_TIMEOUT_MS}. */
  timeoutMs?: number;
}

/**
 * How long to wait for a column's value list before giving up on it.
 *
 * This is a load-bearing timeout, not a nicety. AG Grid will not apply a
 * set-filter model until the filter's list has arrived, so an active
 * saved-filter pill puts the values lookup in front of the FIRST BLOCK: a
 * lookup that never settles is a grid that never shows a row. The worker RPC
 * has no timeout of its own, and "never settles" is the exact failure a
 * saturated worker — or one left over from a previous page load that predates
 * the RPC — produces.
 *
 * Falling back to an empty list degrades the checkbox list, not the grid, and
 * `suppressClearModelOnRefreshValues` keeps the empty list from discarding the
 * user's selection, so the pill still filters.
 */
export const VALUES_TIMEOUT_MS = 5000;

const SET_FILTER = 'agSetColumnFilter';
const MULTI_FILTER = 'agMultiColumnFilter';

/** Slot 1 of a multi filter, by cell data type — mirrors `buildColumnDefs`. */
function dataTypeFilter(cellDataType: unknown): string {
  switch (cellDataType) {
    case 'number': return 'agNumberColumnFilter';
    case 'date':
    case 'dateString': return 'agDateColumnFilter';
    default: return 'agTextColumnFilter';
  }
}

/**
 * AG Grid's implicit Multi Filter composition, made explicit.
 *
 * `agMultiColumnFilter` with no `filters` array renders a type filter plus a
 * Set Filter anyway — and the column-customization editor emits exactly that
 * shape whenever the user picks a Multi kind without hand-listing sub-filters.
 * There is no colDef to hang `values` on in that case, so the set list comes
 * up empty. Materialising the default composition gives it one, and also gives
 * the stream-safe floating filters the sub-filter slots they route models
 * through (`readColumnContext` finds none in an absent array).
 */
function defaultMultiFilters(def: AnyColDef): AnySubFilter[] {
  return [{ filter: dataTypeFilter(def.cellDataType) }, { filter: SET_FILTER }];
}

/**
 * `true` when AG Grid would build a set filter list for this column and no
 * explicit list was configured. `filter: true` counts — Enterprise resolves it
 * to the set filter — and a `values` callback on a column that turns out to be
 * a text filter is simply ignored.
 */
function needsValues(filter: unknown, params: AnyFilterParams | undefined): boolean {
  return (filter === SET_FILTER || filter === true) && params?.values === undefined;
}

/**
 * The values callback. Reads its column from the params rather than a closure
 * so the SAME function can serve `defaultColDef`, where there is no one
 * column, as well as a single colDef.
 */
function makeValuesGetter(
  provider: ISsrmDataProvider,
  limit: number | undefined,
  fallbackColumn?: string,
  timeoutMs: number = VALUES_TIMEOUT_MS,
): (params: SetFilterValuesFuncParams) => void {
  return (params) => {
    const column = params.column?.getColId?.()
      ?? params.colDef?.colId
      ?? params.colDef?.field
      ?? fallbackColumn;
    if (!column) {
      params.success([]);
      return;
    }

    // AG Grid holds the filter — and so the first block — until `success`
    // runs, so it must run on every path, exactly once.
    let settled = false;
    const succeed = (values: unknown[]): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      params.success(values);
    };
    const timer = setTimeout(() => {
      // eslint-disable-next-line no-console
      console.warn(
        `[ssrm] set filter values for "${column}" timed out after ${timeoutMs}ms — showing an empty list. The worker is saturated or does not answer "ssrm-column-values" (a SharedWorker outlives a reload; close every tab to replace it).`,
      );
      succeed([]);
    }, timeoutMs);

    // Honour the other columns' filters so the list only offers values that
    // are actually reachable — AG Grid re-invokes this on filter changes.
    const filterModel = params.api?.getFilterModel?.() ?? null;
    void provider
      .getColumnValues({ column, filterModel, ...(limit ? { limit } : {}) })
      .then((result) => { succeed([...result.values]); })
      .catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.error(`[ssrm] set filter values failed for "${column}"`, err);
        // An empty list keeps the filter usable rather than leaving it
        // spinning forever on a rejected promise.
        succeed([]);
      });
  };
}

function withValues(
  params: AnyFilterParams | undefined,
  getter: (p: SetFilterValuesFuncParams) => void,
): AnyFilterParams {
  return {
    ...params,
    values: getter,
    // Live feed — re-read the list when the user opens it.
    refreshValuesOnOpen: params?.refreshValuesOnOpen ?? true,
    // ...but that refresh must not drop the user's selection.
    suppressClearModelOnRefreshValues: params?.suppressClearModelOnRefreshValues ?? true,
  };
}

function transformColDef(
  def: AnyColDef,
  provider: ISsrmDataProvider,
  options: WithSsrmSetFilterValuesOptions,
): AnyColDef {
  if (def.children?.length) {
    return { ...def, children: def.children.map((c) => transformColDef(c, provider, options)) };
  }

  const column = def.colId ?? (typeof def.field === 'string' ? def.field : undefined);
  if (!column) return def;
  const getter = makeValuesGetter(provider, options.limit, column, options.timeoutMs);

  if (needsValues(def.filter, def.filterParams)) {
    return { ...def, filterParams: withValues(def.filterParams, getter) };
  }

  // Multi filter: only the set slot needs a list; text/number slots don't.
  if (def.filter === MULTI_FILTER) {
    const filters = Array.isArray(def.filterParams?.filters)
      ? def.filterParams.filters
      : defaultMultiFilters(def);
    if (!filters.some((sub) => needsValues(sub?.filter, sub?.filterParams))) return def;
    return {
      ...def,
      filterParams: {
        ...def.filterParams,
        filters: filters.map((sub) => (
          needsValues(sub?.filter, sub?.filterParams)
            ? { ...sub, filterParams: withValues(sub.filterParams, getter) }
            : sub
        )),
      },
    };
  }

  return def;
}

/** Column defs with async set-filter value lists wired to the provider. */
export function withSsrmSetFilterValues<T>(
  columnDefs: readonly T[],
  provider: ISsrmDataProvider,
  options: WithSsrmSetFilterValuesOptions = {},
): T[] {
  return (columnDefs as readonly AnyColDef[]).map(
    (def) => transformColDef(def, provider, options),
  ) as T[];
}

/**
 * `defaultColDef` with an async set-filter value list, for columns that
 * inherit `filter: true` and declare no `filterParams` of their own.
 */
export function withSsrmSetFilterDefaults<T extends object | undefined>(
  defaultColDef: T,
  provider: ISsrmDataProvider,
  options: WithSsrmSetFilterValuesOptions = {},
): T {
  const def = (defaultColDef ?? {}) as AnyColDef;
  if (!needsValues(def.filter, def.filterParams)) return defaultColDef;
  return {
    ...def,
    filterParams: withValues(
      def.filterParams,
      makeValuesGetter(provider, options.limit, undefined, options.timeoutMs),
    ),
  } as T;
}
