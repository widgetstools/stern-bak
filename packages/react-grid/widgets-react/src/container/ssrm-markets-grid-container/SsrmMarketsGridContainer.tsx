import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { LOGGED_IN_USER_ID, type ProviderConfig } from '@wellsfargo-starui/types';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import {
  MarketsGrid,
  toSsrmExpressionRules,
  type MarketsGridProps,
} from '@wellsfargo-starui/grid';
import { createConfigBrowserAction } from '@wellsfargo-starui/grid/config-browser';
import { DATA_PROVIDER_EDITOR_ACTION_ID } from '../markets-grid-container/MarketsGridContainer.js';
import { useSsrmDataProvider } from '@wellsfargo-starui/react/data/runtime';
import { buildColumnDefs } from '../markets-grid-container/buildColumnDefs.js';
import { useSsrmProviderDataWiring } from './useSsrmProviderDataWiring.js';
import { ProviderEditorDialog } from '../markets-grid-container/ProviderEditorDialog.js';

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
  /** Catalog provider id (`stomp-ssrm`). */
  providerId: string;
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
  const [statusText, setStatusText] = useState('Connecting…');
  // CSRM-parity stale banner: error AFTER first ready = disconnected/stale
  // (cold-connect retries stay silent); any recovery to ready clears.
  const [dataStale, setDataStale] = useState(false);
  const everReadyRef = useRef(false);
  const [loadRowCount, setLoadRowCount] = useState<number | undefined>();

  // Lifecycle is owned by useSsrmProviderDataWiring — do not autoStart /
  // stop here (avoids fighting stop() on the status-subscription effect).
  const { provider, error } = useSsrmDataProvider(providerId, {
    inlineCfg,
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
    const offStatus = provider.onStatus((status) => {
      if (status === 'ready') {
        everReadyRef.current = true;
        setDataStale(false);
      } else if (status === 'error' && everReadyRef.current) {
        setDataStale(true);
      }
    });
    return () => offStatus();
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

  const columnDefs = useMemo<ColDef[] | undefined>(() => {
    if (!provider || !ready) return undefined;
    try {
      const defs = provider.getColumnDefs();
      if (!defs.length) return undefined;
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
  }, [provider, ready]);

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
  // the caller's onReady still fires).
  const gridApiRef = useRef<{ refreshServerSide?: (p?: { purge?: boolean }) => void } | null>(null);
  const handleReady = useCallback(
    (handle: { gridApi?: unknown }) => {
      gridApiRef.current = (handle.gridApi ?? null) as typeof gridApiRef.current;
      (onReady as ((h: unknown) => void) | undefined)?.(handle);
    },
    [onReady],
  );

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
        onClick: () => {
          try {
            gridApiRef.current?.refreshServerSide?.({ purge: true });
          } catch {
            /* grid mid-teardown */
          }
        },
      },
      {
        id: 'reload-from-source',
        label: 'Reload from source',
        description: 'Restart the provider and re-fetch the snapshot — refreshes every subscribed grid',
        icon: 'lucide:rotate-cw',
        onClick: () => {
          void provider?.restart({ __refresh: Date.now() }).catch(() => {
            /* status events surface the failure */
          });
        },
      },
      {
        id: DATA_PROVIDER_EDITOR_ACTION_ID,
        label: 'Data Provider Editor',
        description: 'Edit provider configs, STOMP paths, and field mappings',
        icon: 'lucide:plug',
        onClick: () =>
          onEditProvider ? onEditProvider(providerId) : setEditorOpen(true),
      },
      ...(onOpenConfigBrowser
        ? [createConfigBrowserAction({ launch: onOpenConfigBrowser })]
        : []),
    ],
    [onEditProvider, onOpenConfigBrowser, providerId, provider],
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
            onClick={() =>
              onEditProvider ? onEditProvider(providerId) : setEditorOpen(true)
            }
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
        onOpenChange={setEditorOpen}
        providerId={providerId}
        userId={userId}
      />
    </div>
  );
}
