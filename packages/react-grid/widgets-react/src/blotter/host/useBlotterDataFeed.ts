/**
 * The data feed for {@link BlotterHost}: the provider handles (client-side
 * or server-side), the grid api stamped for the current subscription, the
 * overlay / stale-banner state the wiring hooks drive, and the two refresh
 * actions. Same rules as `MarketsGridContainer`; the row plumbing itself
 * stays in `useProviderDataWiring` / `useSsrmProviderWiring`.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GridApi } from 'ag-grid-community';
import type { MarketsGridHandle, MarketsGridProps, createMarketsGridContainerEventBus } from '@wellsfargo-starui/grid';
import { isHistoricalToolbarDate } from '@wellsfargo-starui/grid/customizer';
import type { StompProviderConfig } from '@wellsfargo-starui/types';
import { traceStompProviderCfg } from '@wellsfargo-starui/data/runtime';
import { useDataProvider, useDataServices, useSsrmDataProvider } from '@wellsfargo-starui/react/data/runtime';
import { useProviderDataWiring } from '../../container/markets-grid-container/useProviderDataWiring.js';
import { useSsrmProviderWiring } from '../../container/markets-grid-container/useSsrmProviderWiring.js';
import type { ProviderSelection } from '../../container/markets-grid-container/gridLevelState.js';
import type { BlotterActiveProvider } from './useBlotterActiveProvider.js';
import { splitAppDataRef, type PendingToolbarReload } from './useBlotterToolbarDate.js';

type ContainerEventBus = ReturnType<typeof createMarketsGridContainerEventBus>;
type AppDataStoreLike = { get: (name: string, key: string) => unknown; set: (name: string, key: string, value: unknown) => unknown };

export interface BlotterDataFeedArgs<TData> {
  active: BlotterActiveProvider<TData>;
  /** The machine says a data grid is mounted for this key (`null` otherwise). */
  gridKey: string | null;
  loaded: boolean;
  selection: ProviderSelection;
  asOfDate: string | null;
  toolbarDate: string;
  pendingReloadRef: React.MutableRefObject<PendingToolbarReload | null>;
  historicalDateAppDataRef?: string;
  appDataStore: AppDataStoreLike;
  containerEventBus: ContainerEventBus;
  gridHandle: MarketsGridHandle | null;
  onError: (error: Error) => void;
}

export interface BlotterDataFeed<TData> {
  /** Stamp the grid api from `onReady`; only the api of the current subscription becomes `liveApi`. */
  stampGridApi: (handle: MarketsGridHandle) => void;
  liveApi: GridApi<TData> | null;
  ssrm: MarketsGridProps<TData>['ssrm'];
  refreshView: () => void;
  reloadFromSource: () => Promise<void>;
  showLoadingOverlay: boolean;
  overlayTitle: string;
  overlayMessage: string | undefined;
  overlayRowCount: number | undefined;
  isSavingProfile: boolean;
  setIsSavingProfile: (saving: boolean) => void;
  providerDisconnected: boolean;
  dataStaleMessage: string | undefined;
}

/** Overlay + stale state written by the wiring hooks, derived synchronously from the subscription key. */
function useFeedState(subscriptionKey: string | null) {
  const [resolvedSubKey, setResolvedSubKey] = useState<string | null>(null);
  const [loadRowCount, setLoadRowCount] = useState<number | undefined>(undefined);
  const [isRefetching, setIsRefetching] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [providerDisconnected, setProviderDisconnected] = useState(false);
  const [disconnectDetail, setDisconnectDetail] = useState<string | undefined>();
  const isLoadingSnapshot = subscriptionKey !== null && subscriptionKey !== resolvedSubKey;
  return {
    resolvedSubKey, setResolvedSubKey, loadRowCount, setLoadRowCount, isRefetching, setIsRefetching,
    isSavingProfile, setIsSavingProfile, providerDisconnected, setProviderDisconnected, disconnectDetail, setDisconnectDetail,
    isLoadingSnapshot,
  };
}

/** Container-bus events that mirror selection and stale state to Custom Settings handlers. */
function useFeedEvents(loaded: boolean, selection: ProviderSelection, stale: boolean, staleMessage: string | undefined, bus: ContainerEventBus): void {
  const prevSelectionRef = useRef<ProviderSelection | null>(null);
  useEffect(() => {
    if (!loaded) return;
    const prev = prevSelectionRef.current;
    if (prev === null) { prevSelectionRef.current = selection; return; }
    if (prev.liveProviderId === selection.liveProviderId && prev.historicalProviderId === selection.historicalProviderId && prev.mode === selection.mode) return;
    prevSelectionRef.current = selection;
    bus.emit('provider:switched', { liveProviderId: selection.liveProviderId, historicalProviderId: selection.historicalProviderId, mode: selection.mode });
  }, [loaded, selection, bus]);
  useEffect(() => {
    if (!loaded) return;
    bus.emit('provider:dataStale', { stale, message: staleMessage });
  }, [loaded, stale, staleMessage, bus]);
}

export function useBlotterDataFeed<TData extends Record<string, unknown>>(args: BlotterDataFeedArgs<TData>): BlotterDataFeed<TData> {
  const { active, gridKey, loaded, selection, asOfDate, toolbarDate, pendingReloadRef, historicalDateAppDataRef, appDataStore, containerEventBus, gridHandle, onError } = args;
  const { activeId, isSsrm, rowIdField, rowIdFieldKey, cfg, rawCfg, providerName } = active;
  const { client: dataHubClient } = useDataServices();
  const providerReady = gridKey !== null;
  const csrm = useDataProvider<TData>(providerReady && !isSsrm ? activeId : null, { autoStart: false });
  const ssrmHook = useSsrmDataProvider(providerReady && isSsrm ? activeId : null, { autoStart: true });
  const provider = isSsrm ? null : csrm.provider;
  const ssrmProvider = isSsrm ? ssrmHook.provider : null;

  // The api of the grid mounted for the CURRENT key only; an earlier mount's api is ignored.
  const [stamped, setStamped] = useState<{ key: string; api: GridApi<TData> } | null>(null);
  const gridKeyRef = useRef(gridKey);
  gridKeyRef.current = gridKey;
  const stampGridApi = useCallback((handle: MarketsGridHandle) => {
    const k = gridKeyRef.current;
    if (k) setStamped({ key: k, api: handle.gridApi as unknown as GridApi<TData> });
  }, []);
  const liveApi = stamped && stamped.key === gridKey ? stamped.api : null;

  const subscriptionKey = activeId && rowIdField ? `${activeId}::${rowIdFieldKey}` : null;
  const feed = useFeedState(subscriptionKey);
  const dataStaleMessage = feed.disconnectDetail
    ? `Grid data is stale — ${feed.disconnectDetail}. Edits are disabled until the connection is restored.`
    : undefined;
  useFeedEvents(loaded, selection, feed.providerDisconnected, dataStaleMessage, containerEventBus);
  useEffect(() => { feed.setProviderDisconnected(false); feed.setDisconnectDetail(undefined); }, [activeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const setters = {
    setLoadRowCount: feed.setLoadRowCount, setProviderDisconnected: feed.setProviderDisconnected,
    setDisconnectDetail: feed.setDisconnectDetail, setResolvedSubKey: feed.setResolvedSubKey, setIsRefetching: feed.setIsRefetching,
  };
  useSsrmProviderWiring({ provider: ssrmProvider, activeId, subscriptionKey, mode: selection.mode, onError, containerEventBus, ...setters });
  useProviderDataWiring<TData>({
    liveApi, provider, rowChangeFeed: gridHandle?.platform.rows ?? null, externalFilterColumns: gridHandle?.platform.externalFilters ?? null,
    activeId, subscriptionKey, rowIdField, rowIdFieldKey, mode: selection.mode, asOfDate, toolbarDate, dataHubClient,
    restartProvider: csrm.restart, onError, containerEventBus, ...setters,
  });

  const actions = useFeedActions({
    activeId, isSsrm, provider, ssrmProvider, refresh: isSsrm ? ssrmHook.refresh : csrm.refresh, restart: isSsrm ? ssrmHook.restart : csrm.restart,
    selection, asOfDate, toolbarDate, liveApi, historicalDateAppDataRef, appDataStore, rawCfg, onError,
    setIsRefetching: feed.setIsRefetching, setLoadRowCount: feed.setLoadRowCount, setResolvedSubKey: feed.setResolvedSubKey,
  });
  usePendingToolbarReload({ pendingReloadRef, loaded, ready: Boolean(isSsrm ? ssrmProvider : provider) && Boolean(activeId) && Boolean(liveApi), selection, asOfDate, reload: actions.reloadFromSource });

  const ssrm = useMemo<MarketsGridProps<TData>['ssrm']>(() => (isSsrm && ssrmProvider
    ? {
      provider: ssrmProvider,
      keyColumn: rowIdField ?? undefined,
      cacheBlockSize: (cfg as { blockSize?: number } | null)?.blockSize,
      blockLoadDebounceMillis: (cfg as { blockLoadDebounceMillis?: number } | null)?.blockLoadDebounceMillis,
      maxConcurrentDatasourceRequests: (cfg as { maxConcurrentDatasourceRequests?: number } | null)?.maxConcurrentDatasourceRequests,
    }
    : undefined), [isSsrm, ssrmProvider, rowIdField, cfg]);

  const refreshing = feed.isRefetching && feed.resolvedSubKey !== null;
  return {
    stampGridApi, liveApi, ssrm, refreshView: actions.refreshView, reloadFromSource: actions.reloadFromSource,
    showLoadingOverlay: feed.isLoadingSnapshot || feed.isRefetching || feed.isSavingProfile,
    overlayTitle: feed.isSavingProfile ? 'Saving…' : refreshing ? (providerName ? `Refreshing ${providerName}` : 'Refreshing view') : providerName ? `Loading ${providerName}` : 'Loading market data',
    overlayMessage: feed.isSavingProfile ? 'Persisting profile' : refreshing ? 'Replaying cached snapshot…' : undefined,
    overlayRowCount: feed.isSavingProfile ? undefined : feed.loadRowCount,
    isSavingProfile: feed.isSavingProfile, setIsSavingProfile: feed.setIsSavingProfile,
    providerDisconnected: feed.providerDisconnected, dataStaleMessage,
  };
}

interface FeedActionsArgs<TData> {
  activeId: string | null; isSsrm: boolean;
  provider: unknown; ssrmProvider: unknown;
  refresh: () => Promise<void>; restart: (extra?: Record<string, unknown>) => Promise<void>;
  selection: ProviderSelection; asOfDate: string | null; toolbarDate: string;
  liveApi: GridApi<TData> | null; historicalDateAppDataRef?: string; appDataStore: AppDataStoreLike; rawCfg: unknown;
  onError: (error: Error) => void;
  setIsRefetching: (v: boolean) => void; setLoadRowCount: (v: number | undefined) => void; setResolvedSubKey: (v: string | null) => void;
}

const asError = (err: unknown): Error => (err instanceof Error ? err : new Error(String(err)));

/** Refresh view (cache replay) and reload from source (restart with the toolbar payload). */
function useFeedActions<TData>(a: FeedActionsArgs<TData>) {
  const { activeId, isSsrm, provider, ssrmProvider, refresh, restart, selection, asOfDate, toolbarDate, liveApi, historicalDateAppDataRef, appDataStore, rawCfg, onError } = a;
  const activeProvider = isSsrm ? ssrmProvider : provider;

  const refreshView = useCallback(() => {
    if (!activeId || !activeProvider) return;
    void refresh().catch((err: unknown) => onError(asError(err)));
  }, [activeId, activeProvider, refresh, onError]);

  const reloadFromSource = useCallback(async () => {
    if (!activeId || !activeProvider) return;
    const historical = selection.mode === 'historical';
    const asOfForRestart = historical ? (asOfDate ?? (isHistoricalToolbarDate(toolbarDate) ? toolbarDate : null)) : null;
    const extra = asOfForRestart ? { asOfDate: asOfForRestart } : { __refresh: Date.now() };
    const ref = splitAppDataRef(historicalDateAppDataRef);
    if (historical && asOfForRestart && ref) {
      try { await appDataStore.set(ref[0], ref[1], asOfForRestart); } catch (err: unknown) { onError(asError(err)); return; }
    }
    if (rawCfg && (rawCfg as { providerType?: string }).providerType === 'stomp') {
      traceStompProviderCfg('BlotterHost.reloadFromSource (main-thread audit; worker resolves on connect)', rawCfg as StompProviderConfig, {
        providerId: activeId, extra, lookup: (name, key) => appDataStore.get(name, key),
      });
    }
    // Client-side model only: drain the queue and clear the rows; SSRM drops its blocks on the purge restart() triggers.
    if (liveApi && !isSsrm) {
      try { liveApi.flushAsyncTransactions(); liveApi.setGridOption('rowData', []); } catch (e) { console.warn('[blotter-host] grid clear failed:', e); }
    }
    a.setIsRefetching(true);
    a.setLoadRowCount(undefined);
    a.setResolvedSubKey(null);
    void restart(extra).catch((err: unknown) => onError(asError(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, activeProvider, isSsrm, selection.mode, asOfDate, toolbarDate, liveApi, historicalDateAppDataRef, appDataStore, rawCfg, restart, onError]);

  return { refreshView, reloadFromSource };
}

interface PendingReloadArgs {
  pendingReloadRef: React.MutableRefObject<PendingToolbarReload | null>;
  loaded: boolean;
  /** Provider, activeId and liveApi are all present — the wiring has its listeners attached. */
  ready: boolean;
  selection: ProviderSelection;
  asOfDate: string | null;
  reload: () => Promise<void>;
}

/**
 * Restart the active provider once the committed state matches the intent
 * that queued the reload, and only once `liveApi` exists so the snapshot
 * listeners are attached before `restart()`.
 */
function usePendingToolbarReload({ pendingReloadRef, loaded, ready, selection, asOfDate, reload }: PendingReloadArgs): void {
  useEffect(() => {
    const pending = pendingReloadRef.current;
    if (!pending || !loaded || !ready) return;
    if (selection.mode !== pending.mode) return;
    if (pending.mode === 'historical' && asOfDate !== pending.asOfDate) return;
    pendingReloadRef.current = null;
    void reload();
  }, [pendingReloadRef, loaded, ready, selection.mode, asOfDate, reload]);
}
