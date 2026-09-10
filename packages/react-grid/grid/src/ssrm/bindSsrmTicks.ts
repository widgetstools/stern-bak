import type { GridApi } from 'ag-grid-community';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import type { SsrmTickPayload } from '@wellsfargo-starui/data/runtime';

export interface BindSsrmTicksOptions {
  refreshThrottleMs?: number;
}

type TickApi = Pick<
  GridApi,
  'refreshServerSide' | 'applyServerSideTransactionAsync' | 'getColumnState' | 'getRowGroupColumns'
> & { isDestroyed?: () => boolean };

export function bindSsrmTicks(
  provider: ISsrmDataProvider,
  api: TickApi,
  options?: BindSsrmTicksOptions,
): () => void {
  const throttleMs = options?.refreshThrottleMs ?? 80;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let unbound = false;

  const alive = (): boolean => !unbound && api.isDestroyed?.() !== true;

  const scheduleRefresh = () => {
    if (!alive() || refreshTimer != null) return;
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      if (!alive()) return;
      try {
        api.refreshServerSide({ purge: false });
      } catch { /* destroyed */ }
    }, throttleMs);
  };

  const hasActiveSort = (): boolean => {
    try {
      return (api.getColumnState?.() ?? []).some((c) => c.sort != null);
    } catch {
      return false;
    }
  };

  const purge = () => {
    if (!alive()) return;
    try { api.refreshServerSide({ purge: true }); } catch { /* destroyed */ }
  };

  const offStatus = provider.onStatus((status) => {
    if (status === 'ready') purge();
  });

  // `ISsrmDataProvider.refresh()` / `restart()` — the SSRM stand-in for the
  // CSRM cache replay. Blocks the grid holds predate the new snapshot.
  const offRefresh = provider.onRefresh(purge);

  const offTick = provider.onSsrmTick((payload: SsrmTickPayload) => {
    if (!alive()) return;
    if (payload.kind === 'groupDelta' || payload.reset) {
      scheduleRefresh();
      return;
    }
    if (payload.kind === 'rowDelta') {
      if (hasActiveSort()) {
        scheduleRefresh();
        return;
      }
      const update = [...(payload.upserts ?? [])];
      if (update.length === 0) return;
      try {
        api.applyServerSideTransactionAsync({ update });
        if ((api.getRowGroupColumns?.()?.length ?? 0) > 0) scheduleRefresh();
      } catch {
        scheduleRefresh();
      }
    }
  });

  return () => {
    unbound = true;
    if (refreshTimer != null) clearTimeout(refreshTimer);
    offTick();
    offStatus();
    offRefresh();
  };
}
