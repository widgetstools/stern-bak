/**
 * useSsrmData — the server-side-row-model twin of `useProviderDataWiring`.
 *
 * Where the client-side wiring pushes provider rows into AG Grid
 * transactions, this hook pushes them into a per-window Perspective replica
 * table (`createSsrmFeedTable`) and hands the grid a datasource that answers
 * every block/group/aggregate request from that table
 * (`PerspectiveSsrmDatasource`). Same provider subscription, same status /
 * overlay semantics, different sink.
 *
 * The provider sub-worker remains the transport authority — this table is a
 * disposable projection fed by the exact delta stream every CSRM window
 * already receives, so SSRM needs no new hub protocol at all.
 */
import { useEffect, useMemo, useRef } from 'react';
import type { ColDef, GridOptions } from 'ag-grid-community';
import type { IDataProvider } from '@wellsfargo-starui/data';
import { isHistoricalToolbarDate } from '@wellsfargo-starui/grid/customizer';
import type { useDataServices } from '@wellsfargo-starui/react/data/runtime';
import type { createMarketsGridContainerEventBus } from '@wellsfargo-starui/grid';
import type { ProviderMode } from '../gridLevelState.js';
import { engineAssetsFromWorkerUrl, getSsrmEngineClient } from './engineClient.js';
import { buildSchemaFromColDefs } from './schema.js';
import { createSsrmFeedTable, type SsrmFeedTable } from './feedTable.js';
import { PerspectiveSsrmDatasource } from './datasource.js';
import { createSsrmGridOptions } from './ssrmGridOptions.js';

/** Historical restore only — brief peer race before `restartProvider()`. Live mode connects immediately. */
const PEER_PROVIDER_WAIT_MS = 2_000;

const defaultOnError = (error: Error): void => {
  console.error('[markets-grid ssrm]', error);
};

type DataHubClient = ReturnType<typeof useDataServices>['client'];
type ContainerEventBus = ReturnType<typeof createMarketsGridContainerEventBus>;

export interface UseSsrmDataParams<TData extends Record<string, unknown>> {
  /** False = hook is inert (client-side row model in charge). */
  enabled: boolean;
  provider: IDataProvider<TData> | null;
  activeId: string | null;
  subscriptionKey: string | null;
  rowIdField: string | readonly string[] | null;
  /**
   * Stable form of `rowIdField` for effect/memo keys. (Typed as the container
   * derives it: `Array.isArray` cannot narrow a `readonly string[]` out of the
   * false branch, so the readonly-array member survives in the type even
   * though the value is always a joined string there.)
   */
  rowIdFieldKey: string | readonly string[] | null;
  columnDefs: ColDef<TData>[] | null;
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

export interface UseSsrmDataResult {
  /**
   * The grid options that mount AG Grid's server-side row model against the
   * replica table — spread onto the grid surface LAST so they win at mount.
   * Null while disabled or until columnDefs / key column / wasm assets are
   * resolvable (the container falls back to the client-side row model then).
   */
  serverSideGridOptions: Partial<GridOptions> | null;
}

type SsrmBundle = {
  feed: SsrmFeedTable;
  datasource: PerspectiveSsrmDatasource;
  gridOptions: Partial<GridOptions>;
  disposeTimer: ReturnType<typeof setTimeout> | null;
  disposed: boolean;
};

function disposeBundle(bundle: SsrmBundle): void {
  if (bundle.disposed) return;
  bundle.disposed = true;
  bundle.datasource.destroy();
  bundle.feed.dispose();
}

let warnedNoWorkerUrl = false;

export function useSsrmData<TData extends Record<string, unknown>>(
  params: UseSsrmDataParams<TData>,
): UseSsrmDataResult {
  const {
    enabled,
    provider,
    activeId,
    subscriptionKey,
    rowIdField,
    rowIdFieldKey,
    columnDefs,
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

  // Latest-value refs so the wiring effect reads current state without
  // re-subscribing on every toolbar interaction (same pattern as
  // useProviderDataWiring).
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const asOfDateRef = useRef(asOfDate);
  asOfDateRef.current = asOfDate;
  const toolbarDateRef = useRef(toolbarDate);
  toolbarDateRef.current = toolbarDate;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  /*
   * The bundle (table + datasource + grid options) is built during render so
   * the grid's FIRST mount already carries `rowModelType: 'serverSide'` —
   * rowModelType and getRowId are initial-only grid options.
   */
  const bundle = useMemo<SsrmBundle | null>(() => {
    if (!enabled || !provider || !activeId || !columnDefs || !rowIdField) return null;
    const workerUrl = dataHubClient.providerWorkerAssetUrl;
    if (!workerUrl) {
      if (!warnedNoWorkerUrl) {
        warnedNoWorkerUrl = true;
        console.warn(
          '[markets-grid ssrm] the data-services client has no provider-worker asset URL, ' +
            'so the Perspective wasm binaries cannot be located — falling back to the ' +
            'client-side row model. Pass `providerWorkerScriptUrl` at bootstrap.',
        );
      }
      return null;
    }
    try {
      const client = getSsrmEngineClient(engineAssetsFromWorkerUrl(workerUrl));
      const schema = buildSchemaFromColDefs(columnDefs);
      const leafColumns = Object.keys(schema);
      const feed = createSsrmFeedTable({ client, schema, rowIdField });
      const datasource = new PerspectiveSsrmDatasource({
        table: feed.table,
        feed,
        schema,
        leafColumns,
      });
      return {
        feed,
        datasource,
        gridOptions: createSsrmGridOptions(datasource),
        disposeTimer: null,
        disposed: false,
      };
    } catch (error) {
      // Runs during render — a throw here would take the whole container
      // down. A blotter on the client-side row model beats a white screen.
      console.error(
        '[markets-grid ssrm] failed to boot the SSRM engine — falling back to the client-side row model:',
        error,
      );
      return null;
    }
    // Reason: rowIdField (array identity churn) is keyed via rowIdFieldKey;
    // columnDefs is memoised per activeCfg upstream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, provider, activeId, columnDefs, rowIdFieldKey, dataHubClient]);

  /*
   * Disposal is deferred one macrotask so a StrictMode dev remount — cleanup
   * followed immediately by setup on the SAME bundle — revives it instead of
   * querying a deleted table. A real unmount or a bundle swap lets the timer
   * fire and reclaim the engine memory.
   */
  useEffect(() => {
    if (!bundle) return;
    if (bundle.disposeTimer !== null) {
      clearTimeout(bundle.disposeTimer);
      bundle.disposeTimer = null;
    }
    return () => {
      bundle.disposeTimer = setTimeout(() => disposeBundle(bundle), 0);
    };
  }, [bundle]);

  // ── Provider → replica table wiring ────────────────────────────────
  useEffect(() => {
    if (!bundle || !provider || !activeId) return;
    setLoadRowCount(undefined);
    setProviderDisconnected(false);
    setDisconnectDetail(undefined);
    const thisSubKey = subscriptionKey ?? `${activeId}::${rowIdFieldKey ?? ''}`;
    let cancelled = false;
    const providerStatusRef = { current: 'loading' as string };

    // rAF-coalesced progressive snapshot counter — one state write per frame.
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
      bundle.feed.applySnapshot(rows as readonly Record<string, unknown>[]);
      setLoadRowCount(rows.length);
      setResolvedSubKey(thisSubKey);
      setIsRefetching(false);
      setProviderDisconnected(false);
      setDisconnectDetail(undefined);
      providerStatusRef.current = 'ready';
    });

    const unsubTick = provider.onTick((rows) => {
      if (cancelled || rows.length === 0) return;
      bundle.feed.applyTicks(rows as readonly Record<string, unknown>[]);
    });

    const unsubStatus = provider.onStatus((s, err) => {
      if (cancelled) return;
      const wasDisconnected = providerStatusRef.current === 'error';
      if (s === 'loading') {
        setIsRefetching(true);
        setProviderDisconnected(false);
        setDisconnectDetail(undefined);
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
        mode: modeRef.current,
      });
    });

    const unsubError = provider.onError((err) => {
      if (cancelled) return;
      setResolvedSubKey(thisSubKey);
      setIsRefetching(false);
      (onErrorRef.current ?? defaultOnError)(err);
    });

    // Start kick — identical policy to the client-side wiring: a warm hub
    // slot is joined as-is; historical restore waits briefly for a peer with
    // the same overlay before restarting; live cold-start connects directly.
    void (async () => {
      try {
        let running = await dataHubClient.isProviderRunning(activeId);
        const asOfForRestart = modeRef.current === 'historical'
          ? (asOfDateRef.current ?? (isHistoricalToolbarDate(toolbarDateRef.current) ? toolbarDateRef.current : null))
          : null;
        if (!running && asOfForRestart) {
          running = await dataHubClient.waitForProviderRunning(activeId, {
            timeoutMs: PEER_PROVIDER_WAIT_MS,
          });
        }
        if (running) {
          await provider.start();
          return;
        }
        if (asOfForRestart) {
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
    };
    // Reason: mode/asOfDate/toolbarDate/onError are read through refs on
    // purpose (same contract as useProviderDataWiring) — re-subscribing on
    // toolbar churn would tear down the feed mid-stream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, provider, activeId, rowIdFieldKey, dataHubClient, restartProvider]);

  return useMemo(
    () => ({ serverSideGridOptions: bundle ? bundle.gridOptions : null }),
    [bundle],
  );
}
