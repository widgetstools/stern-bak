/**
 * Provider → grid data-wiring effect, extracted from
 * {@link MarketsGridContainer} to keep that component under the 800-LOC
 * ceiling. This is the hot path: it subscribes the live `GridApi` to the
 * active {@link IDataProvider}'s snapshot / tick / status / error streams,
 * drives the loading-overlay state setters, and kicks the initial
 * `start()` / `restart()` depending on whether the hub slot is already
 * warm (live cold-start connects immediately; historical restore waits
 * briefly for a peer window — see {@link PEER_PROVIDER_WAIT_MS}).
 *
 * Behaviour is identical to the inlined effect — same body, same deps
 * array, same eslint-disable. The container owns the state; this hook
 * just receives the inputs + setters it needs.
 */
import { useEffect, useRef } from 'react';
import type { GridApi } from 'ag-grid-community';
import type { IDataProvider } from '@wellsfargo-starui/data';
import { isHistoricalToolbarDate } from '@wellsfargo-starui/grid/customizer';
import { createApplyProviderToGridState } from './applyProviderToGrid.js';
import { resolveProviderStartPlan } from './resolveProviderStartPlan.js';
import type { ProviderMode } from './gridLevelState.js';
import type { useDataServices } from '@wellsfargo-starui/react/data/runtime';
import type { createMarketsGridContainerEventBus } from '@wellsfargo-starui/grid/core';

/**
 * Gate for hot-path diagnostic logs. Flip to `true` locally when debugging
 * subscribe / update / unsubscribe behavior.
 */
const DEBUG = false;

type DataHubClient = ReturnType<typeof useDataServices>['client'];
type ContainerEventBus = ReturnType<typeof createMarketsGridContainerEventBus>;

export interface UseProviderDataWiringParams<TData extends Record<string, unknown>> {
  liveApi: GridApi<TData> | null;
  provider: IDataProvider<TData> | null;
  activeId: string | null;
  subscriptionKey: string | null;
  rowIdField: string | readonly string[] | null;
  rowIdFieldKey: string | readonly string[] | null;
  mode: ProviderMode;
  asOfDate: string | null;
  toolbarDate: string;
  dataHubClient: DataHubClient;
  restartProvider: (extra?: Record<string, unknown>) => Promise<void>;
  onError?: (error: Error) => void;
  containerEventBus: ContainerEventBus;
  setLoadRowCount: (count: number | undefined) => void;
  setProviderDisconnected: (disconnected: boolean) => void;
  setDisconnectDetail: (detail: string | undefined) => void;
  setResolvedSubKey: (key: string | null) => void;
  setIsRefetching: (refetching: boolean) => void;
}

function defaultOnError(err: Error): void {
   
  console.error('[MarketsGridContainer]', err);
}

export function useProviderDataWiring<TData extends Record<string, unknown>>(
  params: UseProviderDataWiringParams<TData>,
): void {
  const {
    liveApi,
    provider,
    activeId,
    subscriptionKey,
    rowIdField,
    rowIdFieldKey,
    mode,
    asOfDate,
    toolbarDate,
    dataHubClient,
    restartProvider,
    onError,
    containerEventBus,
    setLoadRowCount,
    setProviderDisconnected,
    setDisconnectDetail,
    setResolvedSubKey,
    setIsRefetching,
  } = params;

  // Ref-bridge values the effect only READS (start branch one-shots,
  // status emissions, error reporting) so they never re-run it. Before
  // this, any toolbar-date interaction — including live-mode picks that
  // trigger no reload — tore down all five provider listeners
  // mid-stream and, worse, discarded the fresh
  // createApplyProviderToGridState(): the snapshot row-id index was
  // lost, silently downgrading every subsequent tick's classification
  // from O(1) Set.has to a per-row gridApi.getRowNode() fallback until
  // the next snapshot commit, and re-opening the duplicate-add window
  // against in-flight async transactions. Historical date changes do
  // NOT rely on this effect re-running: they flow through
  // pendingToolbarReloadRef + provider-id / mode-driven remounts.
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const asOfDateRef = useRef(asOfDate);
  asOfDateRef.current = asOfDate;
  const toolbarDateRef = useRef(toolbarDate);
  toolbarDateRef.current = toolbarDate;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!liveApi || !provider || !activeId) {
      if (DEBUG) {
         
        console.log(`[v2/grid]   provider wiring skipped: liveApi=%s provider=%s activeId=%s`,
          Boolean(liveApi), Boolean(provider), activeId);
      }
      return;
    }

    setLoadRowCount(undefined);
    setProviderDisconnected(false);
    setDisconnectDetail(undefined);

    const thisSubKey = subscriptionKey ?? `${activeId}::${rowIdFieldKey}`;
    const t0 = performance.now();
    if (DEBUG) {
       
      console.log(
        '[refresh] %c5. provider wiring effect fired%c provider=%s',
        'color:#ec4899', '', activeId,
      );
    }

    let cancelled = false;
    const gridApply = createApplyProviderToGridState();
    const providerStatusRef = { current: 'loading' as 'loading' | 'ready' | 'error' };

    // rAF-coalesced: progressive snapshot counts arrive per streamed
    // chunk (dozens per second on a fast feed) and each setLoadRowCount
    // re-rendered the whole container. One state write per frame is
    // plenty for a loading counter; the final count still lands via
    // onSnapshotData's own setLoadRowCount(rows.length).
    let pendingRowCount: number | undefined;
    let rowCountRaf: number | null = null;
    const unsubRows = provider.onRowsReceived((count) => {
      if (cancelled) return;
      pendingRowCount = count;
      if (rowCountRaf !== null) return;
      const schedule: (cb: () => void) => number =
        typeof requestAnimationFrame === 'function'
          ? (cb) => requestAnimationFrame(cb)
          : (cb) => setTimeout(cb, 50) as unknown as number;
      rowCountRaf = schedule(() => {
        rowCountRaf = null;
        if (cancelled) return;
        setLoadRowCount(pendingRowCount);
      });
    });

    const unsubSnapshot = provider.onSnapshotData((rows) => {
      if (cancelled) return;
      Promise.resolve().then(() => {
        if (cancelled) return;
        if (DEBUG) {
           
          console.log(
            '[refresh] %cflushAsyncTransactions BEFORE commit%c pendingAdds=%d gridRows=%d',
            'color:#f97316;font-weight:bold', '',
            gridApply.getPendingAddCount(), liveApi.getDisplayedRowCount(),
          );
        }
        try { liveApi.flushAsyncTransactions(); } catch (e) {
          if (DEBUG) {
             
            console.warn('[refresh]    flushAsyncTransactions threw:', e);
          }
        }
        gridApply.clearPendingAdds();
        gridApply.markSnapshotLoaded(rows, rowIdField ?? undefined);
        if (DEBUG) {
           
          console.log(
            '[refresh] %csnapshot commit%c %d rows (onSnapshotData)',
            'color:#10b981;font-weight:bold', '', rows.length,
          );
        }
        liveApi.setGridOption('rowData', rows.slice());
        setLoadRowCount(rows.length);
        setResolvedSubKey(thisSubKey);
        setIsRefetching(false);
        setProviderDisconnected(false);
        setDisconnectDetail(undefined);
        providerStatusRef.current = 'ready';
      });
    });

    let updateBatchCount = 0;
    const unsubTick = provider.onTick((updateRows) => {
      // Live ticks apply regardless of document visibility: this is a
      // trading platform — hidden/minimized blotters must stay current
      // (window-local alerting, instant correctness on restore). The
      // old hidden-pause + refresh-on-visible dormancy was removed
      // deliberately. Chromium's own background timer throttling still
      // applies to hidden windows (flush timers stretch toward 1s/1min)
      // — an OS/runtime concern deliberately left at platform defaults.
      if (cancelled || updateRows.length === 0) return;
      updateBatchCount += 1;

      if (!rowIdField) {
        if (DEBUG) {
           
          console.log(`[v2/grid] %cupdate#%d%c %d rows (no rowIdField → all update)`, 'color:#f59e0b', '', updateBatchCount, updateRows.length);
        }
        gridApply.applyTick(liveApi, updateRows, undefined);
        return;
      }

      const { coalescedPending, addCount, updateCount } = gridApply.applyTick(
        liveApi,
        updateRows,
        rowIdField,
      );
      if (coalescedPending > 0 && DEBUG) {
         
        console.log(
          '[refresh]   %clive split (rows coalesced behind pending adds)%c add=%d update=%d coalescedPending=%d',
          'color:#f97316', '',
          addCount, updateCount, coalescedPending,
        );
      }
    });

    const unsubStatus = provider.onStatus((s, err) => {
      if (DEBUG) {
         
        console.log(
          `[refresh] %cstatus%c %s${err ? ' error=' + JSON.stringify(err) : ''} (+${(performance.now() - t0).toFixed(0)}ms) — pendingAdds=${gridApply.getPendingAddCount()}`,
          'color:#a855f7;font-weight:bold', '', s,
        );
      }
      if (cancelled) return;

      const wasDisconnected = providerStatusRef.current === 'error';

      if (s === 'loading') {
        setIsRefetching(true);
        setProviderDisconnected(false);
        setDisconnectDetail(undefined);
        if (providerStatusRef.current === 'ready' || providerStatusRef.current === 'error') {
          gridApply.clearPendingAdds();
        }
        providerStatusRef.current = 'loading';
      }

      if (err) {
        providerStatusRef.current = s;
        setProviderDisconnected(true);
        setDisconnectDetail(err);
        setResolvedSubKey(thisSubKey);
        setIsRefetching(false);
        (onErrorRef.current ?? defaultOnError)(new Error(err));
        return;
      }

      if (s === 'ready') {
        setProviderDisconnected(false);
        setDisconnectDetail(undefined);
        setIsRefetching(false);
        providerStatusRef.current = 'ready';
        if (wasDisconnected) {
          void provider.refresh().catch((refreshErr: unknown) => {
            if (cancelled) return;
            (onErrorRef.current ?? defaultOnError)(
              refreshErr instanceof Error ? refreshErr : new Error(String(refreshErr)),
            );
          });
        }
      } else if (s !== 'loading') {
        providerStatusRef.current = s;
      }

      containerEventBus.emit('provider:status', {
        status: s,
        error: err,
        providerId: activeId,
        mode,
      });
    });

    const unsubError = provider.onError((err) => {
      if (cancelled) return;
      setResolvedSubKey(thisSubKey);
      setIsRefetching(false);
      (onErrorRef.current ?? defaultOnError)(err);
    });

    void (async () => {
      try {
        const asOfForRestart = modeRef.current === 'historical'
          ? (asOfDateRef.current ?? (isHistoricalToolbarDate(toolbarDateRef.current) ? toolbarDateRef.current : null))
          : null;
        // Live cold start connects immediately — hub attach dedupes concurrent
        // windows. Historical restore waits briefly so a peer with the same
        // overlay can finish starting instead of this window calling restart().
        const plan = await resolveProviderStartPlan(dataHubClient, activeId, asOfForRestart);
        if (plan === 'restart' && asOfForRestart) {
          await restartProvider({ asOfDate: asOfForRestart });
          return;
        }
        await provider.start();
      } catch (err: unknown) {
        if (cancelled) return;
        setResolvedSubKey(thisSubKey);
        (onErrorRef.current ?? defaultOnError)(err instanceof Error ? err : new Error(String(err)));
      }
    })();

    return () => {
      cancelled = true;
      if (rowCountRaf !== null && typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(rowCountRaf);
        rowCountRaf = null;
      }
      unsubRows();
      unsubSnapshot();
      unsubTick();
      unsubStatus();
      unsubError();
      if (DEBUG) {
         
        console.log(`[v2/grid] %cunwire provider%c provider=%s (effect cleanup, +${(performance.now() - t0).toFixed(0)}ms)`,
          'color:#6b7280', '', activeId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveApi, provider, activeId, rowIdFieldKey, dataHubClient, restartProvider]);
}
