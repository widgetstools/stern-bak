import type { GridApi, IRowNode } from 'ag-grid-community';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import type { SsrmTickPayload } from '@wellsfargo-starui/data/runtime';
import { SSRM_ROW_ID_KEY } from './ssrmGetRowId.js';
import type { SsrmBlockCache } from './SsrmBlockCache.js';

export interface BindSsrmTicksOptions {
  /**
   * Throttle for a positional refresh the grid definitely needs: a LOADED
   * row's sort / filter / group key changed, a group delta, or a reset.
   * Default 250 ms.
   */
  refreshThrottleMs?: number;
  /**
   * Cadence of the positional refresh when rows the grid has NOT loaded
   * ticked under a sort / filter / grouping. Their previous values are
   * unknown, so a changed key cannot be ruled out — but it cannot be
   * confirmed either, so this runs slower than {@link refreshThrottleMs}.
   * Also the cadence at which group aggregates re-read. Default 1000 ms.
   */
  positionalRefreshMs?: number;
  /**
   * Refreshes stay deferred this long after the last body scroll and after
   * a paste finishes. Default 150 ms.
   */
  scrollResumeMs?: number;
  /**
   * How often the engine row count is reconciled with the grid's after ticks
   * touched rows the grid has not loaded — an insert or delete the
   * transaction path cannot see. Failed blocks are retried on the same
   * timer. Default 1000 ms; 0 disables.
   */
  countCheckMs?: number;
  /**
   * Block cache shared with the datasource. Updates are patched into it by
   * id; it is cleared before anything that can move rows (refresh, purge,
   * removals) so a stale block is never served as current.
   */
  cache?: SsrmBlockCache;
}

type TickApi = Pick<GridApi, 'refreshServerSide' | 'applyServerSideTransactionAsync'>
  & Partial<Pick<GridApi,
  | 'getColumnState'
  | 'getRowGroupColumns'
  | 'getRowNode'
  | 'forEachNode'
  | 'getFilterModel'
  | 'getDisplayedRowCount'
  | 'getGridOption'
  | 'addEventListener'
  | 'removeEventListener'
  | 'isPivotMode'
  | 'retryServerSideLoads'
  >>
  & { isDestroyed?: () => boolean };

type Row = Record<string, unknown>;
type RowIdFn = (params: { data: unknown; level: number; parentKeys: string[] }) => string;
type GridEvt = Parameters<GridApi['addEventListener']>[0];

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/**
 * Route engine ticks into an AG Grid SSRM store.
 *
 * Every tick is applied in place with `applyServerSideTransactionAsync` — the
 * only path that dispatches `asyncTransactionsFlushed`, which alerts,
 * conditional styling and the change bus listen to. Refreshes are reserved
 * for what a transaction cannot express: a row changing POSITION. The old
 * behaviour of refreshing every loaded block on every tick batch whenever a
 * sort was active cost ten block reads per second per loaded block and made
 * scrolling compete with its own refreshes.
 *
 *   - loaded row, key columns unchanged   → transaction only
 *   - loaded row, sort/filter/group key   → transaction + fast refresh
 *   - unloaded row under sort/filter/group → slow positional refresh
 *   - unloaded row, flat view              → engine row-count reconciliation
 *   - removals                             → `remove` transaction (+ the above)
 *   - group delta / reset                  → fast refresh
 *   - provider ready / refresh             → purge
 *
 * Loaded rows are indexed once per tick with `forEachNode` — AG Grid's own
 * `getRowNode` is a linear scan under SSRM, which at trading rates would
 * make every tick quadratic. Refreshes are deferred while the body is
 * scrolling and while a paste is in progress, so block reads for the
 * viewport and cells being written never queue behind re-reads.
 */
export function bindSsrmTicks(
  provider: ISsrmDataProvider,
  api: TickApi,
  options: BindSsrmTicksOptions = {},
): () => void {
  const throttleMs = options.refreshThrottleMs ?? 250;
  const positionalMs = options.positionalRefreshMs ?? 1000;
  const scrollResumeMs = options.scrollResumeMs ?? 150;
  const countCheckMs = options.countCheckMs ?? 1000;
  const cache = options.cache;

  let unbound = false;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let refreshDueAt = Number.POSITIVE_INFINITY;
  let lastScrollAt = Number.NEGATIVE_INFINITY;
  let pasting = false;
  let countDirty = false;
  let countTimer: ReturnType<typeof setTimeout> | null = null;
  let countInFlight = false;

  const alive = (): boolean => !unbound && api.isDestroyed?.() !== true;

  // ── row identity ────────────────────────────────────────────────────────
  const rowIdFn = safe(() => api.getGridOption?.('getRowId') as RowIdFn | undefined, undefined);
  const canIndex = typeof api.forEachNode === 'function';
  const canLookUp = canIndex || typeof api.getRowNode === 'function';

  const idOf = (row: Row): string | undefined => {
    const branded = row[SSRM_ROW_ID_KEY];
    if (typeof branded === 'string') return branded;
    if (rowIdFn) return safe(() => String(rowIdFn({ data: row, level: 0, parentKeys: [] })), undefined);
    return row.id == null ? undefined : String(row.id);
  };

  /** Loaded leaf nodes by id — one walk per tick, O(loaded), instead of O(loaded) per row. */
  const indexLoaded = (): ((id: string) => IRowNode | undefined) => {
    if (canIndex) {
      const byId = new Map<string, IRowNode>();
      safe(() => api.forEachNode!((node) => {
        if (node.data != null && !node.group && typeof node.id === 'string') byId.set(node.id, node);
      }), undefined);
      return (id) => byId.get(id);
    }
    return (id) => {
      const node = safe(() => api.getRowNode!(id), undefined);
      return node && node.data != null ? node : undefined;
    };
  };

  // ── view shape ──────────────────────────────────────────────────────────
  const keyColumns = (): string[] => {
    const sort = safe(
      () => (api.getColumnState?.() ?? []).filter((c) => c.sort != null).map((c) => c.colId),
      [] as string[],
    );
    const filter = safe(() => Object.keys(api.getFilterModel?.() ?? {}), [] as string[]);
    const group = safe(
      () => (api.getRowGroupColumns?.() ?? []).map((c) => c.getColId()),
      [] as string[],
    );
    return [...new Set([...sort, ...filter, ...group])];
  };
  const isGrouped = (): boolean => safe(
    () => (api.getRowGroupColumns?.()?.length ?? 0) > 0 || api.isPivotMode?.() === true,
    false,
  );

  // ── refresh scheduling ──────────────────────────────────────────────────
  const clearRefresh = (): void => {
    if (refreshTimer != null) clearTimeout(refreshTimer);
    refreshTimer = null;
    refreshDueAt = Number.POSITIVE_INFINITY;
  };

  const retryFailed = (): void => {
    safe(() => api.retryServerSideLoads?.(), undefined);
  };

  const fireRefresh = (): void => {
    clearRefresh();
    if (!alive()) return;
    const sinceScroll = Date.now() - lastScrollAt;
    if (pasting || sinceScroll < scrollResumeMs) {
      // Still scrolling or mid-paste — the viewport's own reads and the cells
      // being written come first.
      scheduleRefresh(pasting ? scrollResumeMs : scrollResumeMs - sinceScroll);
      return;
    }
    cache?.clear();
    retryFailed();
    try {
      api.refreshServerSide({ purge: false });
    } catch { /* destroyed */ }
  };

  const scheduleRefresh = (delayMs: number): void => {
    if (!alive()) return;
    const dueAt = Date.now() + delayMs;
    if (refreshTimer != null) {
      if (dueAt >= refreshDueAt) return;
      clearTimeout(refreshTimer);
    }
    refreshDueAt = dueAt;
    refreshTimer = setTimeout(fireRefresh, delayMs);
  };

  const purge = (): void => {
    if (!alive()) return;
    clearRefresh();
    countDirty = false;
    cache?.clear();
    try {
      api.refreshServerSide({ purge: true });
    } catch { /* destroyed */ }
  };

  // ── row-count reconciliation ────────────────────────────────────────────
  const checkCount = async (): Promise<void> => {
    if (!alive() || !countDirty || countInFlight) return;
    retryFailed();
    if (isGrouped() || typeof api.getDisplayedRowCount !== 'function') {
      countDirty = false;
      return;
    }
    countDirty = false;
    countInFlight = true;
    try {
      const filterModel = safe(() => (api.getFilterModel?.() ?? null) as Row | null, null);
      const raw = safe(() => api.getGridOption?.('quickFilterText'), undefined);
      const quickFilterText = typeof raw === 'string' && raw ? raw : undefined;
      const { rowCount } = await provider.getRowCount({
        filterModel,
        ...(quickFilterText ? { quickFilterText } : {}),
      });
      if (!alive()) return;
      const shown = safe(() => api.getDisplayedRowCount!(), rowCount);
      if (rowCount !== shown) scheduleRefresh(0);
    } catch {
      /* the next tick re-arms the check */
    } finally {
      countInFlight = false;
    }
  };

  const scheduleCountCheck = (): void => {
    countDirty = true;
    if (countCheckMs <= 0 || countTimer != null || !alive()) return;
    countTimer = setTimeout(() => {
      countTimer = null;
      void checkCount();
    }, countCheckMs);
  };

  // ── tick routing ────────────────────────────────────────────────────────
  const onRowDelta = (payload: SsrmTickPayload): void => {
    const keys = keyColumns();
    const grouped = isGrouped();
    const structural = keys.length > 0 || grouped;
    const update: Row[] = [];
    // Rows the worker withheld as not loaded here count as unknown: same
    // count check / positional refresh as an upsert we cannot find a node for.
    let unknown = payload.unloaded?.upserts ?? 0;
    const removedUnloaded = payload.unloaded?.removals ?? 0;
    let keyChanged = false;
    const upserts = payload.upserts ?? [];
    const lookup = upserts.length > 0 && canLookUp ? indexLoaded() : null;

    for (const row of upserts) {
      const node = lookup ? lookup(idOf(row) ?? '') : undefined;
      if (!node) {
        // Without a node lookup every upsert is treated as loaded — the
        // pre-lookup behaviour, and what partial test doubles exercise.
        if (!lookup) update.push(row);
        else unknown += 1;
        continue;
      }
      update.push(row);
      if (!keyChanged && keys.length > 0) {
        const data = node.data as Row;
        keyChanged = keys.some((col) => !Object.is(data[col], row[col]));
      }
    }

    const remove: Row[] = (payload.removals ?? []).map((id) => ({ [SSRM_ROW_ID_KEY]: id }));

    if (update.length > 0 || remove.length > 0) {
      try {
        api.applyServerSideTransactionAsync({
          ...(update.length > 0 ? { update } : {}),
          ...(remove.length > 0 ? { remove } : {}),
        });
        if (update.length > 0) cache?.patchRows(update, idOf);
        if (remove.length > 0) cache?.clear();
      } catch {
        scheduleRefresh(throttleMs);
      }
    }

    if (keyChanged) scheduleRefresh(throttleMs);
    if (structural) {
      if (unknown > 0 || remove.length > 0 || removedUnloaded > 0 || grouped) scheduleRefresh(positionalMs);
    } else if (unknown > 0 || remove.length > 0 || removedUnloaded > 0) {
      scheduleCountCheck();
    }
  };

  const offTick = provider.onSsrmTick((payload: SsrmTickPayload) => {
    if (!alive()) return;
    if (payload.kind === 'groupDelta' || payload.reset) {
      scheduleRefresh(throttleMs);
      return;
    }
    if (payload.kind === 'rowDelta') onRowDelta(payload);
  });

  const offStatus = provider.onStatus((status) => {
    if (status === 'ready') {
      purge();
      retryFailed();
    }
  });

  // `ISsrmDataProvider.refresh()` / `restart()` — the SSRM stand-in for the
  // CSRM cache replay. Blocks the grid holds predate the new snapshot.
  const offRefresh = provider.onRefresh(purge);

  const onBodyScroll = (): void => {
    lastScrollAt = Date.now();
  };
  const onPasteStart = (): void => {
    pasting = true;
  };
  const onPasteEnd = (): void => {
    pasting = false;
    lastScrollAt = Date.now();
  };
  safe(() => api.addEventListener?.('bodyScroll' as GridEvt, onBodyScroll), undefined);
  safe(() => api.addEventListener?.('pasteStart' as GridEvt, onPasteStart), undefined);
  safe(() => api.addEventListener?.('pasteEnd' as GridEvt, onPasteEnd), undefined);

  return () => {
    unbound = true;
    clearRefresh();
    if (countTimer != null) clearTimeout(countTimer);
    countTimer = null;
    safe(() => api.removeEventListener?.('bodyScroll' as GridEvt, onBodyScroll), undefined);
    safe(() => api.removeEventListener?.('pasteStart' as GridEvt, onPasteStart), undefined);
    safe(() => api.removeEventListener?.('pasteEnd' as GridEvt, onPasteEnd), undefined);
    offTick();
    offStatus();
    offRefresh();
  };
}
