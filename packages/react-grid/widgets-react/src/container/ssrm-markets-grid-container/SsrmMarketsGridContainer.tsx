import { useMemo, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { LOGGED_IN_USER_ID, type ProviderConfig } from '@wellsfargo-starui/types';
import {
  MarketsGrid,
  toSsrmExpressionRules,
  type MarketsGridProps,
} from '@wellsfargo-starui/grid';
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
  /** Show inline provider editor entry. */
  showProviderEditor?: boolean;
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
    showProviderEditor = true,
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
    onStatus: setStatusText,
    setLoadRowCount,
  });

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
          <button type="button" onClick={() => setEditorOpen(true)}>
            Edit provider
          </button>
        </div>
      ) : null}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {provider ? (
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
        {provider && ready ? (
          <MarketsGrid
            gridId={providerId}
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
          <p style={{ padding: 16, opacity: 0.7 }}>
            {error ?? (provider ? 'Starting STOMP SSRM provider…' : 'Connecting…')}
          </p>
        )}
      </div>
      {showProviderEditor ? (
        <ProviderEditorDialog
          open={editorOpen}
          onOpenChange={setEditorOpen}
          providerId={providerId}
          userId={userId}
        />
      ) : null}
    </div>
  );
}
