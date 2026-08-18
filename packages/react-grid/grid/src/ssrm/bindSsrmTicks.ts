import type { GridApi } from 'ag-grid-community';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import { doesRowMatchFilterModel, type RowChangeSink } from '@wellsfargo-starui/core';
import {
  buildQuickFilterText,
  parseQuickFilter,
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
  /**
   * Where each patch-in-place transaction reports the rows it changed —
   * `platform.rows` in a wired grid.
   *
   * `applyServerSideTransaction` returns the exact nodes it touched and fires
   * no event anything can subscribe to, so this binding is the ONLY delta
   * source the server-side row model has. Without it every subscriber
   * (alerts, timed activations, the filter-pill badges) sees a structural
   * `full` change per tick and falls back to a whole-grid pass — the cost
   * `RowChangeBus` exists to remove.
   *
   * Optional because this function is public API and a caller driving a bare
   * `GridApi` has no platform to report to. The wired path is
   * `MarketsGridSsrmSurface`, whose test pins that it passes one.
   */
  rows?: RowChangeSink;
  /**
   * Alert-rule hits the plane found on rows this grid does NOT hold.
   *
   * The dedupe lives here rather than at either end, because this is the only
   * place that has both the hits and the grid api. A hit on a row the grid
   * holds is dropped: that row's change arrives in the same tick as a
   * transaction, and the platform's own row-change delta evaluates it against
   * this session's baselines — reporting it here as well would count every
   * visible hit twice. What is left is exactly what the bell was missing.
   */
  onAlertHits?: (hits: ReadonlyArray<{ rowId: string; ruleId: string }>) => void;
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
  const keyColumn = options?.keyColumn ?? 'id'; // aligned with every other keyColumn default (was 'positionId' — a latent split-default trap; the wired surface always passes an explicit value)
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingPurge = false;
  let unbound = false;
  /** One warning per binding, not one per changed row per tick. */
  let warnedFilterRefusal = false;

  const alive = (): boolean =>
    !unbound && api.isDestroyed?.() !== true;

  /**
   * Forward only the hits whose row this grid cannot see. `getRowNode`
   * answering `undefined` IS the question "has this session loaded the row",
   * which under the server-side row model is the difference between a hit the
   * client will find for itself and one it never could.
   */
  const reportUnloadedAlertHits = (
    alerts: ReadonlyArray<{ key: string; ruleId: string }> | undefined,
  ): void => {
    const report = options?.onAlertHits;
    if (!report || !alerts?.length) return;
    const unloaded: Array<{ rowId: string; ruleId: string }> = [];
    for (const hit of alerts) {
      let held = false;
      try {
        held = api.getRowNode?.(hit.key) != null;
      } catch {
        // Mid-teardown: treat as not held rather than dropping the hit.
      }
      if (!held) unloaded.push({ rowId: hit.key, ruleId: hit.ruleId });
    }
    if (unloaded.length) report(unloaded);
  };

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
    if (!fm) return true;
    try {
      return doesRowMatchFilterModel(row, fm);
    } catch (err) {
      // The query plane REFUSES a filter model it cannot evaluate, and this
      // is literally the same predicate, so it refuses the same ones. Here
      // that refusal must not drop the tick: this call only decides whether a
      // changed row is worth pushing at the grid, and over-including is
      // corrected by the next block load, where the refusal is raised for
      // real and reaches the user. Under-including would silently freeze a
      // live row.
      if (!warnedFilterRefusal) {
        warnedFilterRefusal = true;
        console.warn('[ssrm] tick fan-out cannot evaluate the active filter', err);
      }
      return true;
    }
  };

  type TransactionResult = ReturnType<TickApi['applyServerSideTransaction']>;

  const flashUpdatedCells = (
    rowNodes: NonNullable<TransactionResult>['update'],
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

  /**
   * One place where "this tick changed these rows" is handled: report the
   * delta to the platform, then flash it.
   *
   * Report BEFORE flashing so a `flashCells` throw on a grid torn down
   * mid-tick cannot swallow the delta — the two are independent and the
   * subscribers are the load-bearing half.
   */
  const onTransactionApplied = (
    result: TransactionResult,
    columns: string[] | undefined,
  ) => {
    if (result) options?.rows?.transactionApplied(result);
    flashUpdatedCells(result?.update, columns);
  };

  // Recovery purge: the transport rebuilds its snapshot after a broker
  // restart, but the snapshot flush fires on the FIRST streamed chunk
  // (partial cache) and later chunks are interest-gated — so every
  // transition INTO 'ready' re-queries all blocks. Status events fan to
  // every session, so a restart/refresh/reconnect refreshes ALL grids.
  let lastStatusReady = false;
  const offStatus = provider.onStatus?.((status: string) => {
    if (status !== 'ready') {
      lastStatusReady = false;
      return;
    }
    if (lastStatusReady) return; // repeated ready without interruption
    lastStatusReady = true;
    scheduleRefresh(true);
    if (alive()) {
      try {
        refreshAllSetFilterValues(api);
      } catch {
        /* destroyed */
      }
    }
  });

  const offTick = provider.onSsrmTick(({ event, interestedKeys, alerts }) => {
    if (!alive()) return;

    reportUnloadedAlertHits(alerts);

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
          onTransactionApplied(result, event.columns);
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
            onTransactionApplied(result, event.columns);
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
    offStatus?.();
  };
}
