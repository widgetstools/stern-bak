import { useMemo, useState } from 'react';
import type { ColDef } from 'ag-grid-community';
import { LOGGED_IN_USER_ID, type ProviderConfig } from '@wellsfargo-starui/types';
import { SsrmMarketsGrid, toSsrmExpressionRules } from '@wellsfargo-starui/grid';
import { useSsrmDataProvider } from '@wellsfargo-starui/react/data/runtime';
import { buildColumnDefs } from '../markets-grid-container/buildColumnDefs.js';
import { useSsrmProviderDataWiring } from './useSsrmProviderDataWiring.js';
import { ProviderEditorDialog } from '../markets-grid-container/ProviderEditorDialog.js';

export interface SsrmMarketsGridContainerProps {
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
  userId?: string;
}

/**
 * SSRM MarketsGrid container — selects a `stomp-ssrm` provider, wires
 * expressions into the SharedWorker plane, and renders {@link SsrmMarketsGrid}.
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
  } = props;

  const [editorOpen, setEditorOpen] = useState(false);
  const [status, setStatus] = useState('…');
  const [loadCount, setLoadCount] = useState<number | undefined>();

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
    onStatus: setStatus,
    setLoadRowCount: setLoadCount,
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
      <div
        style={{
          flex: '0 0 auto',
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          padding: '8px 12px',
          borderBottom: '1px solid var(--border, #333)',
        }}
      >
        <strong style={{ fontSize: 14 }}>{title}</strong>
        <span style={{ fontSize: 12, opacity: 0.7, fontFamily: 'monospace' }}>
          {error ?? status}
          {loadCount != null ? ` · ${loadCount.toLocaleString()} rows` : ''}
          {ready ? '' : provider ? ' · starting…' : ''}
        </span>
        {showProviderEditor ? (
          <button
            type="button"
            style={{ marginLeft: 'auto' }}
            onClick={() => setEditorOpen(true)}
          >
            Edit provider
          </button>
        ) : null}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {provider && ready ? (
          <SsrmMarketsGrid
            provider={provider}
            columnDefs={columnDefs}
            keyColumn={keyColumn}
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
