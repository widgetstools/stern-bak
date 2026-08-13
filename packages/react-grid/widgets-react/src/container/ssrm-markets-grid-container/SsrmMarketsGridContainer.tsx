import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { LOGGED_IN_USER_ID, type ProviderConfig } from '@wellsfargo-starui/types';
import type { StorageAdapter } from '@wellsfargo-starui/core';
import { inferFields, type ISsrmDataProvider } from '@wellsfargo-starui/data';
import {
  MarketsGrid,
  toSsrmExpressionRules,
  type MarketsGridHandle,
  type MarketsGridProps,
  type ProviderGridHostApi,
  type StorageAdapterFactory,
} from '@wellsfargo-starui/grid';
import { createConfigBrowserAction } from '@wellsfargo-starui/grid/config-browser';
import { DATA_PROVIDER_EDITOR_ACTION_ID } from '../markets-grid-container/MarketsGridContainer.js';
import { useDataProvidersList, useSsrmDataProvider } from '@wellsfargo-starui/react/data/runtime';
import { buildColumnDefs } from '../markets-grid-container/buildColumnDefs.js';
import { useGridLevelPersistence } from '../markets-grid-container/useGridLevelPersistence.js';
import type { ProviderSelection } from '../markets-grid-container/gridLevelState.js';
import { useSsrmProviderDataWiring } from './useSsrmProviderDataWiring.js';
import { ProviderEditorDialog } from '../markets-grid-container/ProviderEditorDialog.js';

/** `positionId` → `Position Id` — header text for inferred columns. */
function humanizeField(field: string): string {
  const spaced = field.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export interface SsrmMarketsGridContainerProps extends Partial<
  Pick<
    MarketsGridProps,
    | 'storage'
    | 'instanceId'
    | 'appId'
    | 'userId'
    | 'host'
    | 'showToolbar'
    | 'showFormattingToolbar'
    | 'showEditingToolbar'
    | 'showFiltersToolbar'
    | 'showSaveButton'
    | 'showSettingsButton'
    | 'showProfileSelector'
    | 'theme'
    | 'gridId'
    | 'defaultColDef'
    | 'onReady'
  >
> {
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
  inlineCfg?: ProviderConfig;
  title?: string;
  /** Optional MarketsGrid expression snapshot → worker rules. */
  expressionSnapshot?: Parameters<typeof toSsrmExpressionRules>[0];
  className?: string;
  style?: React.CSSProperties;
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
   * Route the provider-editor entry to a host callback (e.g. a popout)
   * instead of the inline dialog.
   */
  onEditProvider?(providerId: string | null): void;
  /**
   * Adds a "Config Browser" admin action invoking this callback — the same
   * seam `MarketsGridContainer` gives OpenFin hosts for their popout.
   */
  onOpenConfigBrowser?(): void;
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

/**
 * SSRM MarketsGrid container — selects a `stomp-ssrm` provider, wires
 * expressions into the SharedWorker plane, and renders full {@link MarketsGrid}
 * chrome with `ssrm={{ provider, keyColumn }}`.
 */
export function SsrmMarketsGridContainer(props: SsrmMarketsGridContainerProps) {
  const {
    providerId,
    defaultHistoricalProviderId,
    inlineCfg,
    title = 'SSRM MarketsGrid',
    expressionSnapshot,
    className,
    style,
    showProviderEditor = false,
    showStatusStrip = false,
    onEditProvider,
    onOpenConfigBrowser,
    onRowIdFieldChange,
    onProviderReady,
    gridId: gridIdProp,
    defaultColDef,
    onReady,
    userId = LOGGED_IN_USER_ID,
    storage,
    instanceId,
    appId,
    host,
    theme,
    showToolbar = true,
    showFormattingToolbar = true,
    showEditingToolbar = true,
    showFiltersToolbar = true,
    showSaveButton = true,
    showSettingsButton = true,
    showProfileSelector = true,
  } = props;

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [statusText, setStatusText] = useState('Connecting…');
  // CSRM-parity stale banner: error AFTER first ready = disconnected/stale
  // (cold-connect retries stay silent); any recovery to ready clears.
  const [dataStale, setDataStale] = useState(false);
  const everReadyRef = useRef(false);
  const [loadRowCount, setLoadRowCount] = useState<number | undefined>();

  // ── Provider selection (CSRM parity) ──────────────────────────────
  //
  // Same grid-level persistence row MarketsGridContainer uses: the
  // customizer's Custom Settings → DATA PROVIDER card can rebind the
  // live / historical provider per gridId, surviving reloads. The
  // `providerId` prop is the default live provider.
  const gridId = gridIdProp ?? providerId;
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

  const { selection, setSelection, loaded } = useGridLevelPersistence({
    adapter,
    gridId,
    defaultLiveProviderId: providerId,
    defaultHistoricalProviderId,
    gridHandle,
  });

  const [asOfDate, setAsOfDate] = useState<string | null>(null);

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

  const { ready } = useSsrmProviderDataWiring({
    provider,
    expressionRules,
    // Must stay a stable reference: the wiring effect re-runs (and restarts
    // the provider) whenever onStatus identity changes.
    onStatus: setStatusText,
    setLoadRowCount,
  });

  // Stale tracking subscribes to the provider's RAW status stream — the
  // wiring hook's onStatus receives display text ('Live'), never 'ready'.
  useEffect(() => {
    if (!provider) return;
    everReadyRef.current = false;
    setDataStale(false);
    // Optional-chained like bindSsrmTicks — bare ISsrmDataProvider
    // mocks (and any transport without status) simply skip staleness.
    const offStatus = provider.onStatus?.((status) => {
      if (status === 'ready') {
        everReadyRef.current = true;
        setDataStale(false);
      } else if (status === 'error' && everReadyRef.current) {
        setDataStale(true);
      }
    });
    return () => offStatus?.();
  }, [provider]);

  // Column / key resolution must run *after* start() — getConfig() throws before that.
  const keyColumn = useMemo(() => {
    if (!provider || !ready) return 'id';
    try {
      const cfg = provider.getConfig() as {
        keyColumn?: string | readonly string[];
      };
      if (Array.isArray(cfg.keyColumn)) return '__ssrmRowId';
      return cfg.keyColumn && String(cfg.keyColumn).trim()
        ? String(cfg.keyColumn)
        : 'id';
    } catch {
      return 'id';
    }
  }, [provider, ready]);

  // Providers without declared columnDefinitions (createStarui drafts,
  // hand-seeded rows) infer their columns from a sampled block — the SSRM
  // analog of the CSRM container's snapshot inference. A declared list
  // always wins; inference only fills the empty case, where the previous
  // behavior was a headerless, cell-less grid.
  const [inferredDefs, setInferredDefs] = useState<ColDef[] | null>(null);
  useEffect(() => {
    // Inference belongs to one provider instance — a rebind starts clean.
    setInferredDefs(null);
  }, [provider]);
  useEffect(() => {
    if (!provider || !ready || inferredDefs) return;
    try {
      if (provider.getColumnDefs().length > 0) return;
    } catch {
      return;
    }
    let cancelled = false;
    provider
      .getRows({ startRow: 0, endRow: 50 })
      .then((result) => {
        if (cancelled) return;
        const { fields } = inferFields(result.rowData);
        const defs = fields
          .filter((f) => !f.path.startsWith('__') && f.type !== 'object' && f.type !== 'array')
          .map<ColDef>((f) => ({
            field: f.path,
            headerName: humanizeField(f.path),
            cellDataType:
              f.type === 'number' ? 'number'
              : f.type === 'boolean' ? 'boolean'
              : f.type === 'date' ? 'dateString'
              : 'text',
            enableRowGroup: true,
            enablePivot: true,
            enableValue: true,
          }));
        if (defs.length > 0) setInferredDefs(defs);
      })
      .catch(() => { /* declared-less provider with no rows yet — retry on next ready flip */ });
    return () => { cancelled = true; };
  }, [provider, ready, inferredDefs]);

  const columnDefs = useMemo<ColDef[] | undefined>(() => {
    if (!provider || !ready) return undefined;
    try {
      const defs = provider.getColumnDefs();
      if (!defs.length) return inferredDefs ?? undefined;
      const asColDefs = defs.map((c) => ({
        field: c.field,
        headerName: c.headerName ?? c.field,
        width: c.width,
        hide: c.hide,
        enableRowGroup: true,
        enablePivot: true,
        enableValue: true,
      })) as ColDef[];
      return buildColumnDefs(asColDefs) ?? asColDefs;
    } catch {
      return undefined;
    }
  }, [provider, ready, inferredDefs]);

  const cacheBlockSize = useMemo(() => {
    if (!provider || !ready) return undefined;
    try {
      const cfg = provider.getConfig() as { blockSize?: number };
      const n = cfg.blockSize;
      return typeof n === 'number' && n >= 20 ? n : undefined;
    } catch {
      return undefined;
    }
  }, [provider, ready]);

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
    (handle: { gridApi?: unknown }) => {
      gridApiRef.current = (handle.gridApi ?? null) as typeof gridApiRef.current;
      gridHandleRef.current = handle as MarketsGridHandle;
      setGridHandle(handle as MarketsGridHandle);
      (onReady as ((h: unknown) => void) | undefined)?.(handle);
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
    void provider?.restart(extra).catch(() => {
      /* status events surface the failure */
    });
  }, [provider, selection.mode, asOfDate]);

  const handleProviderEdit = useCallback((id: string | null) => {
    if (onEditProvider) {
      onEditProvider(id);
      return;
    }
    setEditingProviderId(id);
    setEditorOpen(true);
  }, [onEditProvider]);

  // ── Customizer host API (Custom Settings → DATA PROVIDER card) ────
  // Same contract MarketsGridContainer supplies; both provider slots see
  // the full catalog (a Mock provider is a valid pick for either in dev).
  const providersList = useDataProvidersList();
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
    setLiveId,
    setHistoricalId,
    setMode,
    refreshView,
    reloadFromSource,
    handleProviderEdit,
  ]);

  // Exactly MarketsGridContainer's data-infrastructure menu: the
  // "Data Provider Editor" action (host popout when onEditProvider is
  // supplied, inline dialog otherwise) and, when a host wires it,
  // "Config Browser" — same ids, labels, icons and order as CSRM.
  const adminActions = useMemo(
    () => [
      // CSRM parity: MarketsGridContainer's refresh/reload pair, same ids,
      // labels, icons and order, ahead of the data-infra actions.
      {
        id: 'refresh-view',
        label: 'Refresh view',
        description: 'Replay cached rows from the worker plane without reconnecting',
        icon: 'lucide:refresh-cw',
        onClick: refreshView,
      },
      {
        id: 'reload-from-source',
        label: 'Reload from source',
        description: 'Restart the provider and re-fetch the snapshot — refreshes every subscribed grid',
        icon: 'lucide:rotate-cw',
        onClick: reloadFromSource,
      },
      {
        id: DATA_PROVIDER_EDITOR_ACTION_ID,
        label: 'Data Provider Editor',
        description: 'Edit provider configs, STOMP paths, and field mappings',
        icon: 'lucide:plug',
        onClick: () => handleProviderEdit(activeProviderId ?? providerId),
      },
      ...(onOpenConfigBrowser
        ? [createConfigBrowserAction({ launch: onOpenConfigBrowser })]
        : []),
    ],
    [onOpenConfigBrowser, providerId, activeProviderId, refreshView, reloadFromSource, handleProviderEdit],
  );

  return (
    <div
      className={className}
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        ...style,
      }}
    >
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
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
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
        {provider ? (
          <MarketsGrid
            gridId={gridIdProp ?? providerId}
            defaultColDef={defaultColDef}
            onReady={handleReady}
            dataStale={dataStale}
            dataStaleMessage="Live SSRM feed disconnected — values may be stale"
            adminActions={adminActions}
            providerGridHost={providerGridHost}
            ssrm={{
              provider,
              keyColumn,
              ...(cacheBlockSize != null ? { cacheBlockSize } : {}),
            }}
            rowIdField={keyColumn}
            columnDefs={columnDefs ?? []}
            rowData={[]}
            caption={title}
            showToolbar={showToolbar}
            showSettingsButton={showSettingsButton}
            showFormattingToolbar={showFormattingToolbar}
            showEditingToolbar={showEditingToolbar}
            showFiltersToolbar={showFiltersToolbar}
            showSaveButton={showSaveButton}
            showProfileSelector={showProfileSelector}
            showColumnSelector
            storage={storage}
            instanceId={instanceId}
            appId={appId}
            userId={userId}
            host={host}
            theme={theme}
            style={{ height: '100%', width: '100%' }}
          />
        ) : (
          // Only before the adapter exists at all (or a hard resolve error);
          // a created-but-starting provider renders the grid above instead.
          <p style={{ padding: 16, opacity: 0.7 }}>{error ?? 'Connecting…'}</p>
        )}
      </div>
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
    </div>
  );
}
