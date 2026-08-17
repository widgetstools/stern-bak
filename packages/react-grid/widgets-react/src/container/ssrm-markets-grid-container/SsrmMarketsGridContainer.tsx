/**
 * SsrmMarketsGridContainer — the server-side-row-model counterpart of
 * {@link MarketsGridContainer}.
 *
 * Accepts the SAME host surface: `extends Omit<MarketsGridProps, …>` and
 * spreads it onto the grid, so every member the CSRM container forwards is
 * forwarded here. Only these are held back, and each for a stated reason:
 *
 *   - `ssrm` — the container OWNS it (that is what makes this the SSRM
 *     container); `rowData` — ignored by the grid whenever `ssrm` is set;
 *   - `rowIdField` / `columnDefs` — facts about the provider, resolved by
 *     `useSsrmColumnResolution`, not host preferences (CSRM omits both for
 *     the same reason);
 *   - `gridLevelData` / `onGridLevelDataLoad` — the container owns
 *     grid-level persistence (CSRM omits both);
 *   - `headerExtras` — absent from the CSRM container's surface too.
 *
 * `gridId` is optional here where CSRM requires it: `providerId` is a
 * required unique provider key, so it is a sensible default; CSRM has no
 * required id to default from (its provider is picked at runtime).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { ColDef } from 'ag-grid-community';
import { LOGGED_IN_USER_ID, type TransportConfig } from '@wellsfargo-starui/types';
import type { StorageAdapter } from '@wellsfargo-starui/core';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import {
  MarketsGrid,
  createMarketsGridContainerEventBus,
  toSsrmExpressionRules,
  type MarketsGridEventHandlerRegistry,
  type MarketsGridHandle,
  type MarketsGridHandlerMeta,
  type MarketsGridProps,
  type MarketsGridSsrmProps,
  type ProviderGridHostApi,
  type StorageAdapterFactory,
} from '@wellsfargo-starui/grid';
import { isOpenFin } from '@wellsfargo-starui/openfin/host';
import {
  useAppDataStore,
  useDataProvidersList,
  useDataServices,
  useSsrmDataProvider,
} from '@wellsfargo-starui/react/data/runtime';
import { useGridLevelPersistence } from '../markets-grid-container/useGridLevelPersistence.js';
import { MarketsGridLoadingOverlay } from '../markets-grid-container/LoadingOverlay.js';
import { useAppDataLookup } from '../markets-grid-container/useAppDataLookup.js';
import { useContainerCaption } from '../markets-grid-container/useContainerCaption.js';
import { useContainerEventWiring } from '../markets-grid-container/useContainerEventWiring.js';
import { useContainerHistoricalDate } from '../markets-grid-container/useContainerHistoricalDate.js';
import { resolveProviderStartPlan } from '../markets-grid-container/resolveProviderStartPlan.js';
import type { ProviderSelection } from '../markets-grid-container/gridLevelState.js';
import { useSsrmProviderDataWiring } from './useSsrmProviderDataWiring.js';
import { useSsrmColumnResolution } from './useSsrmColumnResolution.js';
import { useSsrmProviderStatus } from './useSsrmProviderStatus.js';
import { useSsrmAdminActions } from './useSsrmAdminActions.js';
import { ProviderEditorDialog } from '../markets-grid-container/ProviderEditorDialog.js';
import { ConfigBrowserDialog } from '../markets-grid-container/ConfigBrowserDialog.js';

const EMPTY_ROWS: never[] = [];
const EMPTY_COL_DEFS: ColDef[] = [];

/** Fills the container's flex column. Host `style` merges OVER it, exactly
 *  as MarketsGrid's own root style merges its `style` prop — so a host can
 *  add padding without collapsing the grid viewport (which is what
 *  `apps/e2e/star-demo-ssrm-smoke.spec.ts` asserts a real height for). */
const GRID_FILL_STYLE: CSSProperties = { height: '100%', width: '100%' };

const FRAME_STYLE: CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
};

/** `position: relative` is what the loading overlay's `inset: 0` anchors to. */
const BODY_STYLE: CSSProperties = {
  position: 'relative',
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
};

/** Sentinel row key for the no-provider shell — CSRM uses the same one. */
const NO_PROVIDER_ROW_ID = '__none__';

/**
 * Three toolbars the SSRM container turns ON by default where MarketsGrid's
 * own defaults are off / deferred. A deliberate divergence from the CSRM
 * container, which passes all three straight through: removing them would
 * change what a bare `<SsrmMarketsGridContainer providerId>` renders, and
 * roadmap binding constraint 1 forbids lowering SSRM to match CSRM. A host
 * value always wins.
 */
const TOOLBAR_DEFAULTS = {
  showFormattingToolbar: true,
  showEditingToolbar: true,
  showFiltersToolbar: true,
} as const;

function defaultOnError(err: Error): void {
  console.error('[SsrmMarketsGridContainer]', err);
}

export interface SsrmMarketsGridContainerProps
  extends Omit<
    MarketsGridProps,
    | 'ssrm'
    | 'rowData'
    | 'rowIdField'
    | 'columnDefs'
    | 'gridLevelData'
    | 'onGridLevelDataLoad'
    | 'headerExtras'
    | 'gridId'
  > {
  /** Keys stored grid state. Defaults to `providerId`. */
  gridId?: string;
  /** Catalog provider id (`stomp-ssrm`). Used as the default live
   *  provider; the customizer's Custom Settings panel can rebind the
   *  grid to any other provider at runtime (persisted per gridId). */
  providerId: string;
  /** Default historical provider for the customizer's HISTORICAL slot. */
  defaultHistoricalProviderId?: string;
  /**
   * Optional transport cfg — skips the worker `get-config` round-trip
   * (demo / editor drafts). Hub attach still receives this cfg.
   */
  inlineCfg?: TransportConfig;
  /** Optional MarketsGrid expression snapshot → worker rules. */
  expressionSnapshot?: Parameters<typeof toSsrmExpressionRules>[0];
  /**
   * Show the standalone "Edit provider" strip above the grid. Off by
   * default: the editor is always reachable through the same
   * "Data Provider Editor" admin action MarketsGridContainer exposes, so
   * hosted layouts match star-demo exactly. The SSRM lab turns the strip on.
   */
  showProviderEditor?: boolean;
  /**
   * Show the connection status / row-count strip above the grid. Off by
   * default for the same layout-parity reason; the lab turns it on.
   */
  showStatusStrip?: boolean;
  /**
   * OpenFin only: called when the user edits the active provider from
   * Custom Settings or the Tools menu. In a browser runtime the container
   * opens the provider editor in a shadcn dialog instead.
   */
  onEditProvider?(providerId: string | null): void;
  /**
   * OpenFin only: called when the user opens Config Browser from the
   * toolbar overflow menu. In a browser runtime the container opens
   * Config Browser in a shadcn dialog instead.
   */
  onOpenConfigBrowser?(): void;
  /**
   * Where to write the historical date when the user picks one.
   * Format: `'appDataProviderName.key'` — e.g. `'positions.asOfDate'`.
   * The historical provider's cfg should reference this entry via
   * `{{positions.asOfDate}}` so the value flows through to the transport.
   * Required when a historical provider is supplied.
   */
  historicalDateAppDataRef?: string;
  /** Surface stream errors. Defaults to console.error. */
  onError?(error: Error): void;
  /** App registry of event handler functions keyed by stable id. */
  gridEventHandlers?: MarketsGridEventHandlerRegistry;
  /** Optional labels for Custom Settings event binding UI. */
  handlerMeta?: MarketsGridHandlerMeta;
  /**
   * Reports the provider's resolved key column (drives getRowId). Hosted
   * wrappers feed this into the colour-link config.
   */
  onRowIdFieldChange?(rowIdField: string | null): void;
  /**
   * Reports the live `ISsrmDataProvider` once created — hosted wrappers use
   * it to resolve group / select-all colour-link selections via the worker.
   */
  onProviderReady?(provider: ISsrmDataProvider): void;
}

export function SsrmMarketsGridContainer(props: SsrmMarketsGridContainerProps) {
  const {
    providerId,
    defaultHistoricalProviderId,
    inlineCfg,
    expressionSnapshot,
    showProviderEditor = false,
    showStatusStrip = false,
    onEditProvider,
    onOpenConfigBrowser,
    onError,
    historicalDateAppDataRef,
    gridEventHandlers,
    handlerMeta,
    onRowIdFieldChange,
    onProviderReady,
    gridId: gridIdProp,
    onReady,
    style,
    showFormattingToolbar = TOOLBAR_DEFAULTS.showFormattingToolbar,
    showEditingToolbar = TOOLBAR_DEFAULTS.showEditingToolbar,
    showFiltersToolbar = TOOLBAR_DEFAULTS.showFiltersToolbar,
    // `userId` defaults here (CSRM leaves it to the host / grid host
    // context) because the storage adapter below is built from it — a
    // changed default would re-key every persisted SSRM profile.
    userId = LOGGED_IN_USER_ID,
    ...marketsGridProps
  } = props;

  const containerEventBus = useMemo(() => createMarketsGridContainerEventBus(), []);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [configBrowserOpen, setConfigBrowserOpen] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  // The LOOKUP goes to the grid (cell-editor bindings); the raw STORE is
  // what the historical-date round-trip reads and writes, because its `set`
  // is awaitable where the lookup's is not. Same pair CSRM holds.
  const appData = useAppDataStore();
  const appDataLookup = useAppDataLookup();
  const { client: dataHubClient } = useDataServices();

  // Stable identity, live callback: `useSsrmProviderDataWiring` keys its
  // effect on `onError`, so an inline arrow from the host would restart the
  // provider on every render.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const handleError = useCallback((err: unknown) => {
    (onErrorRef.current ?? defaultOnError)(err instanceof Error ? err : new Error(String(err)));
  }, []);

  // ── Provider selection (CSRM parity) ──────────────────────────────
  //
  // Same grid-level persistence row MarketsGridContainer uses: the
  // customizer's Custom Settings → DATA PROVIDER card can rebind the
  // live / historical provider per gridId, surviving reloads. The
  // `providerId` prop is the default live provider.
  const gridId = gridIdProp ?? providerId;
  const { storage, instanceId, appId } = marketsGridProps;
  const storageFactory = storage as StorageAdapterFactory | undefined;
  const adapter = useMemo<StorageAdapter | null>(() => {
    if (!storageFactory) return null;
    return storageFactory({
      instanceId: instanceId ?? gridId,
      gridId,
      appId,
      userId,
    });
  }, [storageFactory, instanceId, gridId, appId, userId]);

  const gridHandleRef = useRef<MarketsGridHandle | null>(null);
  const [gridHandle, setGridHandle] = useState<MarketsGridHandle | null>(null);

  const {
    selection,
    setSelection,
    persistedCaption,
    setPersistedCaption,
    eventBindings,
    setEventBindings,
    loaded,
  } = useGridLevelPersistence({
    adapter,
    gridId,
    defaultLiveProviderId: providerId,
    defaultHistoricalProviderId,
    gridHandle,
  });

  // Save-and-switch (CSRM parity): flush per-card "Save"s to disk via the
  // grid's own saveAll() BEFORE the selection applies, so the provider
  // switch doesn't discard in-memory customizer edits.
  const applyProviderSelection = useCallback(
    async (apply: (s: ProviderSelection) => ProviderSelection) => {
      const handle = gridHandleRef.current;
      if (handle) {
        try {
          await handle.saveAll();
        } catch (err) {
          console.warn('[ssrm-markets-grid] save-before-provider-switch failed:', err);
        }
      }
      setSelection(apply);
    },
    [setSelection],
  );

  const setLiveId = useCallback((id: string | null) => {
    void applyProviderSelection((s) => ({ ...s, liveProviderId: id }));
  }, [applyProviderSelection]);
  const setHistoricalId = useCallback((id: string | null) => {
    void applyProviderSelection((s) => ({ ...s, historicalProviderId: id }));
  }, [applyProviderSelection]);
  const setMode = useCallback((mode: ProviderSelection['mode']) => {
    void applyProviderSelection((s) => ({ ...s, mode }));
  }, [applyProviderSelection]);

  // Toolbar date, as-of date, the AppData round-trip and the banner flags —
  // shared with MarketsGridContainer so the historical rules cannot differ
  // per row model. The reload GATE stays below: this container waits for a
  // STARTED provider, where the client-side one waits for a live `GridApi`.
  const {
    asOfDate,
    setAsOfDate,
    toolbarDate,
    onToolbarDateChange,
    toolbarDateHistoryEnabled,
    isHistoricalView,
    historicalViewMessage,
    consumePendingReload,
  } = useContainerHistoricalDate({
    loaded,
    mode: selection.mode,
    historicalProviderId: selection.historicalProviderId,
    defaultHistoricalProviderId,
    historicalDateAppDataRef,
    appDataStore: appData.store,
    setSelection,
    setMode,
    onError: handleError,
    containerEventBus,
  });

  // Active provider follows the persisted selection; `null` until the
  // first load resolves so the default provider isn't created and then
  // immediately torn down when a persisted rebind differs.
  const activeProviderId = !loaded
    ? null
    : selection.mode === 'historical'
      ? (selection.historicalProviderId ?? selection.liveProviderId ?? providerId)
      : (selection.liveProviderId ?? providerId);

  // Lifecycle is owned by useSsrmProviderDataWiring — do not autoStart /
  // stop here (avoids fighting stop() on the status-subscription effect).
  const { provider, error } = useSsrmDataProvider(activeProviderId, {
    // Inline cfg only describes the prop-named provider — never leak it
    // onto a rebound one.
    inlineCfg: activeProviderId === providerId ? inlineCfg : undefined,
    trackStatus: false,
    autoStart: false,
  });

  const expressionRules = useMemo(
    () =>
      expressionSnapshot
        ? toSsrmExpressionRules(expressionSnapshot)
        : undefined,
    [expressionSnapshot],
  );

  // Load / stale / refetch state from the provider's RAW status stream, plus
  // the container bus's `provider:status` emit.
  const {
    statusText,
    setStatusText,
    loadRowCount,
    setLoadRowCount,
    firstLoadSettled,
    isRefetching,
    dataStale,
    staleBannerMessage,
  } = useSsrmProviderStatus({
    provider,
    activeProviderId,
    mode: selection.mode,
    containerEventBus,
  });

  // Cold-start arbitration for a historical restore. Read through a ref so a
  // later date change never re-runs the wiring effect — that path is the
  // queued reload below, not a re-start.
  const historicalAsOfRef = useRef<string | null>(null);
  historicalAsOfRef.current = selection.mode === 'historical' ? asOfDate : null;
  const startProvider = useCallback(async (p: ISsrmDataProvider) => {
    const asOf = historicalAsOfRef.current;
    if (!asOf || !activeProviderId) {
      await p.start();
      return;
    }
    const plan = await resolveProviderStartPlan(dataHubClient, activeProviderId, asOf);
    if (plan === 'restart') {
      await p.restart({ asOfDate: asOf });
      return;
    }
    await p.start();
  }, [dataHubClient, activeProviderId]);

  const { ready } = useSsrmProviderDataWiring({
    provider,
    expressionRules,
    // Must stay a stable reference: the wiring effect re-runs (and restarts
    // the provider) whenever onStatus / onError / startProvider identity
    // changes.
    onStatus: setStatusText,
    onError: handleError,
    setLoadRowCount,
    startProvider,
  });

  const { keyColumn, columnDefs, cacheBlockSize } = useSsrmColumnResolution(provider, ready);

  const ssrmConfig = useMemo<MarketsGridSsrmProps | null>(
    () =>
      provider
        ? {
            provider,
            keyColumn,
            ...(cacheBlockSize != null ? { cacheBlockSize } : {}),
          }
        : null,
    [provider, keyColumn, cacheBlockSize],
  );

  // Hosted wrappers need the resolved key column (link rowIdField) and the
  // live provider (worker-resolved group / select-all link selections).
  useEffect(() => {
    if (!ready) return;
    onRowIdFieldChange?.(keyColumn ?? null);
  }, [onRowIdFieldChange, keyColumn, ready]);

  useEffect(() => {
    if (!provider || !ready) return;
    onProviderReady?.(provider);
  }, [onProviderReady, provider, ready]);

  // Grid api for the "Refresh view" admin action (chained, not stolen —
  // the caller's onReady still fires). The full handle also feeds the
  // save-before-provider-switch flush.
  const gridApiRef = useRef<{ refreshServerSide?: (p?: { purge?: boolean }) => void } | null>(null);
  const handleReady = useCallback(
    (handle: MarketsGridHandle) => {
      gridApiRef.current = handle.gridApi ?? null;
      gridHandleRef.current = handle;
      setGridHandle(handle);
      onReady?.(handle);
    },
    [onReady],
  );

  // ── Refresh / reload / edit (shared by admin menu + customizer) ───
  const refreshView = useCallback(() => {
    try {
      gridApiRef.current?.refreshServerSide?.({ purge: true });
    } catch {
      /* grid mid-teardown */
    }
  }, []);

  // Historical mode forwards `{ asOfDate }` through restart, exactly like
  // MarketsGridContainer's reloadFromSource — the transport decides what
  // to do with it (snapshot-at-date request).
  const reloadFromSource = useCallback(() => {
    const extra: Record<string, unknown> = { __refresh: Date.now() };
    if (selection.mode === 'historical' && asOfDate) extra.asOfDate = asOfDate;
    void provider?.restart(extra).catch(handleError);
  }, [provider, selection.mode, asOfDate, handleError]);

  // A toolbar date commit owes a reload. Gate first, then consume: `ready`
  // is what makes this container able to serve one (the provider has
  // started, so `restart()` reaches a live plane), and consuming the intent
  // before that would drop the reload entirely.
  useEffect(() => {
    if (!loaded || !provider || !ready) return;
    if (!consumePendingReload()) return;
    reloadFromSource();
  }, [loaded, provider, ready, consumePendingReload, reloadFromSource]);

  const handleProviderEdit = useCallback((id: string | null) => {
    if (isOpenFin()) {
      onEditProvider?.(id);
      return;
    }
    setEditingProviderId(id);
    setEditorOpen(true);
  }, [onEditProvider]);

  const handleOpenConfigBrowser = useCallback(() => {
    if (isOpenFin()) {
      onOpenConfigBrowser?.();
      return;
    }
    setConfigBrowserOpen(true);
  }, [onOpenConfigBrowser]);

  // Profile writes drive the same overlay, with "Saving…" copy. The host's
  // own `onSavingChange` is CHAINED rather than replaced — MarketsGridContainer
  // overrides it after its spread and silently drops the host's, which is a
  // separate defect (noted for Phase 10) and not one worth copying.
  const hostOnSavingChange = marketsGridProps.onSavingChange;
  const handleSavingChange = useCallback((saving: boolean) => {
    setIsSavingProfile(saving);
    hostOnSavingChange?.(saving);
  }, [hostOnSavingChange]);

  // ── Customizer host API (Custom Settings → DATA PROVIDER card) ────
  // Same contract MarketsGridContainer supplies; both provider slots see
  // the full catalog (a Mock provider is a valid pick for either in dev).
  const providersList = useDataProvidersList();
  // Overlay copy names the provider, exactly as CSRM's does. The catalog is
  // already fetched for the DATA PROVIDER card, so this costs nothing.
  const activeProviderName = useMemo(
    () => providersList.configs.find((c) => c.providerId === activeProviderId)?.name ?? null,
    [providersList.configs, activeProviderId],
  );
  const providerGridHost = useMemo<ProviderGridHostApi>(() => ({
    available: true,
    liveProviders: providersList.configs,
    historicalProviders: providersList.configs,
    liveProviderId: selection.liveProviderId,
    historicalProviderId: selection.historicalProviderId,
    mode: selection.mode,
    asOfDate,
    onLiveChange: setLiveId,
    onHistoricalChange: setHistoricalId,
    onModeChange: setMode,
    onAsOfDateChange: setAsOfDate,
    onRefreshView: refreshView,
    onReloadFromSource: reloadFromSource,
    onEditProvider: handleProviderEdit,
  }), [
    providersList.configs,
    selection.liveProviderId,
    selection.historicalProviderId,
    selection.mode,
    asOfDate,
    setAsOfDate,
    setLiveId,
    setHistoricalId,
    setMode,
    refreshView,
    reloadFromSource,
    handleProviderEdit,
  ]);

  // Event bridge + Custom Settings bindings host + the `provider:switched` /
  // `provider:dataStale` emits — the same wiring MarketsGridContainer uses.
  const { gridEventBindingsHost } = useContainerEventWiring({
    containerEventBus,
    handle: gridHandle,
    gridId,
    instanceId: instanceId ?? gridId,
    appId,
    userId,
    appData: appDataLookup,
    eventBindings,
    setEventBindings,
    gridEventHandlers,
    handlerMeta,
    selection,
    loaded,
    dataStale,
    dataStaleMessage: staleBannerMessage,
  });

  const { caption, onCaptionChange } = useContainerCaption({
    propCaption: marketsGridProps.caption,
    persistedCaption,
    setPersistedCaption,
    onCaptionChange: marketsGridProps.onCaptionChange,
  });

  // Tools menu — the refresh/reload pair, the data-infra pair, then the
  // host's own. `infraOnly` serves the no-provider shell.
  const adminActionSets = useSsrmAdminActions({
    hostActions: marketsGridProps.adminActions,
    editProviderId: activeProviderId ?? providerId,
    onEditProvider: handleProviderEdit,
    onOpenConfigBrowser: handleOpenConfigBrowser,
    onRefreshView: refreshView,
    onReloadFromSource: reloadFromSource,
  });

  const gridStyle = useMemo<CSSProperties>(
    () => (style ? { ...GRID_FILL_STYLE, ...style } : GRID_FILL_STYLE),
    [style],
  );

  // `ready` is the second settle signal, and it is not redundant: the status
  // subscription is optional-chained because a transport need not have one,
  // and without this a provider that never emits status would leave the
  // overlay — which takes pointer events over the whole grid — up forever.
  const showLoadingOverlay =
    !(firstLoadSettled || ready) || isRefetching || isSavingProfile;

  const dataDialogs = (
    <>
      {/* Reachable from the Data Provider Editor admin action even when the
          strip is hidden; renders nothing while closed. */}
      <ProviderEditorDialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setEditingProviderId(null);
        }}
        providerId={editingProviderId ?? activeProviderId ?? providerId}
        userId={userId}
      />
      <ConfigBrowserDialog open={configBrowserOpen} onOpenChange={setConfigBrowserOpen} />
    </>
  );

  return (
    <div style={FRAME_STYLE}>
      {showProviderEditor ? (
        <div
          style={{
            flex: '0 0 auto',
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '4px 12px',
            borderBottom: '1px solid var(--border, #333)',
          }}
        >
          <button
            type="button"
            onClick={() => handleProviderEdit(activeProviderId ?? providerId)}
          >
            Edit provider
          </button>
        </div>
      ) : null}
      <div style={BODY_STYLE}>
        {provider && showStatusStrip ? (
          <div
            data-testid="ssrm-provider-status"
            style={{
              flex: '0 0 auto',
              padding: '2px 12px',
              fontSize: 12,
              opacity: 0.85,
              borderBottom: '1px solid var(--border, #333)',
            }}
          >
            {statusText}
            {loadRowCount != null ? ` · ${loadRowCount.toLocaleString('en-US')}` : ''}
          </div>
        ) : null}
        {/* Mounted as soon as the provider adapter exists — before start()
            completes. The grid chrome is visible immediately; when the
            provider's snapshot lands, bindSsrmTicks purges and rows load.
            keyColumn / columnDefs / cacheBlockSize refine from their
            pre-ready defaults once getConfig() stops throwing. */}
        {!loaded ? (
          // Grid-level data (the persisted provider selection) is still being
          // read. Brief and storage-bound; mounting a grid we would remount
          // when the selection lands is worse. Same placeholder as CSRM.
          <div className="flex items-center justify-center h-full text-xs text-muted-foreground">
            {error ?? 'Loading…'}
          </div>
        ) : provider && ssrmConfig ? (
          <>
            <MarketsGrid
              {...(marketsGridProps as MarketsGridProps)}
              gridId={gridId}
              userId={userId}
              ssrm={ssrmConfig}
              rowData={EMPTY_ROWS}
              columnDefs={columnDefs ?? EMPTY_COL_DEFS}
              rowIdField={keyColumn}
              appData={appDataLookup}
              caption={caption}
              onCaptionChange={onCaptionChange}
              onReady={handleReady}
              onSavingChange={handleSavingChange}
              adminActions={adminActionSets.full}
              providerGridHost={providerGridHost}
              gridEventBindingsHost={gridEventBindingsHost}
              dataStale={dataStale}
              dataStaleMessage={staleBannerMessage}
              historicalViewMode={isHistoricalView}
              historicalViewMessage={historicalViewMessage}
              toolbarDate={toolbarDate}
              onToolbarDateChange={onToolbarDateChange}
              toolbarDateHistoryEnabled={toolbarDateHistoryEnabled}
              showFormattingToolbar={showFormattingToolbar}
              showEditingToolbar={showEditingToolbar}
              showFiltersToolbar={showFiltersToolbar}
              style={gridStyle}
            />
            {showLoadingOverlay ? (
              <MarketsGridLoadingOverlay
                title={
                  isSavingProfile
                    ? 'Saving…'
                    : isRefetching
                      ? activeProviderName
                        ? `Refreshing ${activeProviderName}`
                        : 'Refreshing view'
                      : activeProviderName
                        ? `Loading ${activeProviderName}`
                        : 'Loading market data'
                }
                message={
                  isSavingProfile
                    ? 'Persisting profile'
                    : isRefetching
                      ? 'Re-fetching the snapshot…'
                      : undefined
                }
                rowCount={isSavingProfile ? undefined : loadRowCount}
              />
            ) : null}
          </>
        ) : (
          // No provider adapter at all — reachable when the resolved provider
          // id is empty. Mount the grid on a sentinel row key so the toolbar,
          // the customizer's DATA PROVIDER card and the Data Provider Editor
          // stay reachable and the user can pick one. CSRM's `__no_provider__`
          // shell, same shape.
          <MarketsGrid
            {...(marketsGridProps as MarketsGridProps)}
            key="__no_provider__"
            gridId={gridId}
            userId={userId}
            rowData={EMPTY_ROWS}
            columnDefs={EMPTY_COL_DEFS}
            rowIdField={NO_PROVIDER_ROW_ID}
            appData={appDataLookup}
            caption={caption}
            onCaptionChange={onCaptionChange}
            onReady={handleReady}
            adminActions={adminActionSets.infraOnly}
            providerGridHost={providerGridHost}
            gridEventBindingsHost={gridEventBindingsHost}
            dataStale
            dataStaleMessage={
              error
                ? `No data provider is bound to this grid — ${error}. Pick one in Custom Settings → DATA PROVIDER.`
                : 'No data provider is bound to this grid. Pick one in Custom Settings → DATA PROVIDER.'
            }
            toolbarDate={toolbarDate}
            onToolbarDateChange={onToolbarDateChange}
            toolbarDateHistoryEnabled={toolbarDateHistoryEnabled}
            showFormattingToolbar={showFormattingToolbar}
            showEditingToolbar={showEditingToolbar}
            showFiltersToolbar={showFiltersToolbar}
            style={gridStyle}
          />
        )}
      </div>
      {dataDialogs}
    </div>
  );
}
