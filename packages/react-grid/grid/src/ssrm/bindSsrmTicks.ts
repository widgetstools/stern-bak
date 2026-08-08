import type { GridApi } from 'ag-grid-community';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import {
  buildQuickFilterText,
  parseQuickFilter,
  rowPassesFilter,
  rowPassesQuickFilter,
  type Row,
} from '@wellsfargo-starui/data/runtime';

export interface BindSsrmTicksOptions {
  purgeOnSnapshot?: boolean;
  /** Min ms between refreshServerSide calls (group totals / fallback). Default 400. */
  refreshThrottleMs?: number;
  /**
   * Throttle for refreshes needed to re-apply SSRM sort after live updates.
   * Defaults to `min(refreshThrottleMs, 50)` for near-CSRM reshuffle feel.
   */
  sortRefreshThrottleMs?: number;
  keyColumn?: string;
  /**
   * Flash updated cells via `flashCells`.
   * When the tick includes `columns`, only those cells flash (not the whole row).
   * Default true.
   */
  flash?: boolean;
  /** Current quick-filter text (for empty-viewport "row entered filter" checks). */
  getQuickFilterText?: () => string;
}

type TickApi = Pick<
  GridApi,
  | 'refreshServerSide'
  | 'applyServerSideTransaction'
  | 'flashCells'
  | 'getRowNode'
  | 'getDisplayedRowCount'
  | 'getFilterModel'
  | 'getRowGroupColumns'
  | 'getColumnState'
  | 'getColumns'
  | 'getColumnFilterHandler'
  | 'getColumnFilterInstance'
> & {
  /** AG Grid 31+ — skip API calls after the grid is torn down. */
  isDestroyed?: () => boolean;
};

/** Refresh every set-filter's value list (call after snapshot completes). */
function refreshAllSetFilterValues(api: TickApi): void {
  const cols = api.getColumns?.() ?? [];
  for (const col of cols) {
    const colId = col.getColId();
    try {
      const handler = api.getColumnFilterHandler?.(colId) as
        | { refreshFilterValues?: () => void }
        | null
        | undefined;
      if (handler?.refreshFilterValues) {
        handler.refreshFilterValues();
        continue;
      }
    } catch {
      /* fall through */
    }
    void api.getColumnFilterInstance?.(colId)?.then((inst) => {
      const filter = inst as {
        refreshFilterValues?: () => void;
        getHandler?: () => { refreshFilterValues?: () => void };
      } | null;
      filter?.refreshFilterValues?.();
      filter?.getHandler?.()?.refreshFilterValues?.();
    });
  }
}

/**
 * Subscribe to provider SSRM ticks and push live updates into the grid.
 *
 * Prefers `applyServerSideTransaction` for visible leaf rows when unsorted.
 * Cleanup clears any pending refresh timer and unsubscribes so tab switches
 * never call API methods on a destroyed grid.
 */
export function bindSsrmTicks(
  provider: ISsrmDataProvider,
  api: TickApi,
  options?: BindSsrmTicksOptions,
): () => void {
  const throttleMs = options?.refreshThrottleMs ?? 400;
  const sortThrottleMs =
    options?.sortRefreshThrottleMs ?? Math.min(throttleMs, 50);
  const keyColumn = options?.keyColumn ?? 'positionId';
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingPurge = false;
  let unbound = false;

  const alive = (): boolean =>
    !unbound && api.isDestroyed?.() !== true;

  const scheduleRefresh = (purge: boolean, delayMs = throttleMs) => {
    if (!alive()) return;
    pendingPurge = pendingPurge || purge;
    if (refreshTimer != null) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      const purgeNow = pendingPurge;
      pendingPurge = false;
      if (!alive()) return;
      try {
        api.refreshServerSide({ purge: purgeNow });
      } catch {
        /* grid may have been destroyed between the check and the call */
      }
    }, delayMs);
  };

  const filterModel = (): Record<string, unknown> | null => {
    if (!alive()) return null;
    try {
      const fm = api.getFilterModel?.() as Record<string, unknown> | null;
      return fm && Object.keys(fm).length ? fm : null;
    } catch {
      return null;
    }
  };

  const hasActiveSort = (): boolean => {
    if (!alive()) return false;
    try {
      return (api.getColumnState?.() ?? []).some((c) => c.sort != null);
    } catch {
      return false;
    }
  };

  const rowPassesView = (row: Row, fm: Record<string, unknown> | null): boolean => {
    const parts = parseQuickFilter(options?.getQuickFilterText?.() ?? '');
    if (
      parts.length
      && !rowPassesQuickFilter(buildQuickFilterText(row), parts)
    ) {
      return false;
    }
    return !fm || rowPassesFilter(row, fm);
  };

  const flashUpdatedCells = (
    rowNodes: NonNullable<
      ReturnType<TickApi['applyServerSideTransaction']>
    >['update'],
    columns: string[] | undefined,
  ) => {
    if (!alive() || options?.flash === false || !rowNodes?.length) return;
    const cols = columns?.filter((c) => c && !c.startsWith('__'));
    try {
      if (cols?.length) {
        api.flashCells?.({ rowNodes, columns: cols });
      } else {
        api.flashCells?.({ rowNodes });
      }
    } catch {
      /* destroyed */
    }
  };

  const offTick = provider.onSsrmTick(({ event, interestedKeys }) => {
    if (!alive()) return;

    if (event.type === 'snapshot') {
      scheduleRefresh(options?.purgeOnSnapshot ?? true);
      if (alive()) {
        try {
          refreshAllSetFilterValues(api);
        } catch {
          /* destroyed */
        }
      }
      return;
    }

    if (event.type !== 'rows' && event.type !== 'aggregates') {
      return;
    }

    let displayed = 0;
    let grouping = false;
    try {
      displayed = api.getDisplayedRowCount?.() ?? 0;
      grouping = (api.getRowGroupColumns?.()?.length ?? 0) > 0;
    } catch {
      return;
    }
    const sorting = hasActiveSort();
    const fm = filterModel();
    const hasQuick = Boolean(
      parseQuickFilter(options?.getQuickFilterText?.() ?? '').length,
    );
    const hasViewFilter = Boolean(fm) || hasQuick;
    const rows = (event.rows ?? []) as Row[];

    // Filtered to zero rows: never churn refreshServerSide on live ticks.
    if (displayed === 0 && hasViewFilter) {
      const entered =
        rows.length > 0 && rows.some((r) => rowPassesView(r, fm));
      if (entered) scheduleRefresh(false);
      return;
    }

    if (event.type === 'rows' && rows.length > 0) {
      const interested = new Set(interestedKeys);
      const visibleRows =
        interestedKeys.length > 0
          ? rows.filter((r) => interested.has(String(r[keyColumn] ?? '')))
          : [];

      // Unsorted: patch visible leaves in place (no re-query).
      if (visibleRows.length > 0 && !sorting) {
        try {
          if (!alive()) return;
          const result = api.applyServerSideTransaction({
            update: visibleRows,
          });
          flashUpdatedCells(result?.update, event.columns);
          if (grouping) scheduleRefresh(false, sortThrottleMs);
          return;
        } catch {
          scheduleRefresh(false);
          return;
        }
      }

      // Sorted: soft-refresh so rows reshuffle; patch visible cells first.
      if (sorting) {
        if (visibleRows.length > 0) {
          try {
            if (!alive()) return;
            const result = api.applyServerSideTransaction({
              update: visibleRows,
            });
            flashUpdatedCells(result?.update, event.columns);
          } catch {
            /* refresh recovers */
          }
        }
        scheduleRefresh(false, sortThrottleMs);
        return;
      }
    }

    if (interestedKeys.length === 0) {
      if (hasViewFilter) {
        const affectsFilter =
          rows.length > 0 && rows.some((r) => rowPassesView(r, fm));
        if (!affectsFilter) return;
        scheduleRefresh(false);
        return;
      }
      if (grouping && displayed > 0) {
        scheduleRefresh(false);
      }
      return;
    }

    if (event.type === 'aggregates') {
      scheduleRefresh(false);
    }
  });

  return () => {
    unbound = true;
    if (refreshTimer != null) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
    pendingPurge = false;
    offTick();
  };
}
