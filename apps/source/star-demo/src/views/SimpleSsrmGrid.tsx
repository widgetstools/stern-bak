/**
 * SimpleSsrmGrid — route view at `#/simplegrid`. A PERFORMANCE CONTROL RIG:
 * the leanest possible AG Grid (no MarketsGrid platform, no module pipeline,
 * no toolbars, no profiles) bound to the SAME SSRM engine the blotter uses —
 * Perspective replica table fed by a hub STOMP provider, blocks served from
 * engine views. Comparing scroll/update feel here vs the MarketsGrid route
 * separates "platform stack cost" from "SSRM engine cost".
 *
 * Self-contained: seeds its own deterministic provider row on mount (same
 * column set / feed shape as the stomp-marketsgrid-minimal blotter) and
 * accepts the same perf-harness query overrides: `?tag=&rate=&batch=&thin`.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { ModuleRegistry, type ColDef, type GridOptions } from 'ag-grid-community';
import { AllEnterpriseModule } from 'ag-grid-enterprise';
import type { DataProviderConfig, StompProviderConfig, ColumnDefinition } from '@wellsfargo-starui/types';
import {
  useDataProvider,
  useDataServices,
  useUserIdFromContext,
} from '@wellsfargo-starui/react/data/runtime';
import {
  PerspectiveSsrmDatasource,
  buildSchemaFromColDefs,
  createSsrmFeedTable,
  createSsrmGridOptions,
  engineAssetsFromWorkerUrl,
  getSsrmEngineClient,
  type SsrmFeedTable,
} from '@wellsfargo-starui/grid/widgets';

ModuleRegistry.registerModules([AllEnterpriseModule]);

// ─── Perf-harness query overrides (mirrors stomp-marketsgrid-minimal) ────
const query = new URLSearchParams(window.location.search);
const TAG = query.get('tag') || 'SIMPLE';
const RATE = query.get('rate') || '20000';
const BATCH = query.get('batch') || '50';
const THIN = query.has('thin');

const PROVIDER_ID = `star-demo:simplegrid-positions:${TAG}${THIN ? ':thin' : ''}`;

/** Same 28-column set the minimal blotter streams — apples-to-apples. */
const COLUMN_DEFINITIONS: ColumnDefinition[] = [
  { field: 'positionId', headerName: 'Position Id', cellDataType: 'text' },
  { field: 'cusip', headerName: 'Cusip', cellDataType: 'text' },
  { field: 'ticker', headerName: 'Ticker', cellDataType: 'text' },
  { field: 'instrumentName', headerName: 'Instrument Name', cellDataType: 'text' },
  { field: 'instrumentType', headerName: 'Instrument Type', cellDataType: 'text' },
  { field: 'bookName', headerName: 'Book Name', cellDataType: 'text' },
  { field: 'portfolio', headerName: 'Portfolio', cellDataType: 'text' },
  { field: 'trader', headerName: 'Trader', cellDataType: 'text' },
  { field: 'desk', headerName: 'Desk', cellDataType: 'text' },
  { field: 'region', headerName: 'Region', cellDataType: 'text' },
  { field: 'country', headerName: 'Country', cellDataType: 'text' },
  { field: 'notionalAmount', headerName: 'Notional Amount', cellDataType: 'number' },
  { field: 'marketValue', headerName: 'Market Value', cellDataType: 'number' },
  { field: 'currentPrice', headerName: 'Current Price', cellDataType: 'number' },
  { field: 'pnl', headerName: 'Pnl', cellDataType: 'number' },
  { field: 'unrealizedPnl', headerName: 'Unrealized Pnl', cellDataType: 'number' },
  { field: 'realizedPnl', headerName: 'Realized Pnl', cellDataType: 'number' },
  { field: 'dailyPnl', headerName: 'Daily Pnl', cellDataType: 'number' },
  { field: 'mtdPnl', headerName: 'Mtd Pnl', cellDataType: 'number' },
  { field: 'ytdPnl', headerName: 'Ytd Pnl', cellDataType: 'number' },
  { field: 'yield', headerName: 'Yield', cellDataType: 'number' },
  { field: 'spread', headerName: 'Spread', cellDataType: 'number' },
  { field: 'dv01', headerName: 'Dv01', cellDataType: 'number' },
  { field: 'pv01', headerName: 'Pv01', cellDataType: 'number' },
  { field: 'cs01', headerName: 'Cs01', cellDataType: 'number' },
  { field: 'rating.moody', headerName: 'Moody', cellDataType: 'text' },
  { field: 'rating.sp', headerName: 'Sp', cellDataType: 'text' },
  { field: 'rating.fitch', headerName: 'Fitch', cellDataType: 'text' },
];

const STOMP_CFG: StompProviderConfig = {
  providerType: 'stomp',
  websocketUrl: 'ws://localhost:8081',
  listenerTopic: `/snapshot/positions/${TAG}`,
  requestMessage: `/snapshot/positions/${TAG}/${RATE}/${BATCH}`,
  requestBody: '',
  snapshotEndToken: 'Success',
  snapshotTimeoutMs: 60_000,
  dataType: 'positions',
  keyColumn: 'positionId',
  autoStart: false,
  dataPlane: 'subworker',
  ...(THIN ? { thinDeltas: true } : {}),
  snapshotChunkSize: 1000,
  throttleMs: 100,
  conflateByKey: 'positionId',
  columnDefinitions: COLUMN_DEFINITIONS,
};

const PROVIDER_DRAFT: DataProviderConfig = {
  providerId: PROVIDER_ID,
  name: `SimpleGrid Positions [${TAG}${THIN ? ' thin' : ''}]`,
  providerType: 'stomp',
  userId: 'dev1',
  public: false,
  config: STOMP_CFG,
};

const DEFAULT_COL_DEF: ColDef = {
  filter: true,
  sortable: true,
  resizable: true,
  enableRowGroup: true,
  enableValue: true,
};

const STATUS_BAR = {
  statusPanels: [
    { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
    { statusPanel: 'agSelectedRowCountComponent' },
    { statusPanel: 'agAggregationComponent' },
  ],
};

type Bundle = {
  feed: SsrmFeedTable;
  datasource: PerspectiveSsrmDatasource;
  gridOptions: Partial<GridOptions>;
  disposeTimer: ReturnType<typeof setTimeout> | null;
  disposed: boolean;
};

function SimpleSsrmGrid(): ReactNode {
  const { configStore, client } = useDataServices();
  const userId = useUserIdFromContext();
  const [seeded, setSeeded] = useState(false);
  const [status, setStatus] = useState('seeding provider…');

  // Full-bleed: the shell's body padding + auto heights would otherwise keep
  // the grid from filling the window (same treatment as WorkspaceSetupRoute).
  useEffect(() => {
    const bodyStyle = document.body.style;
    const prev = { padding: bodyStyle.padding, margin: bodyStyle.margin, overflow: bodyStyle.overflow };
    bodyStyle.padding = '0';
    bodyStyle.margin = '0';
    bodyStyle.overflow = 'hidden';
    return () => {
      bodyStyle.padding = prev.padding;
      bodyStyle.margin = prev.margin;
      bodyStyle.overflow = prev.overflow;
    };
  }, []);

  // Seed the catalog row (idempotent upsert by deterministic providerId; the
  // overrides are part of the id, so each harness shape gets its own row).
  useEffect(() => {
    let cancelled = false;
    void configStore
      .save(PROVIDER_DRAFT, userId)
      .then(() => {
        if (!cancelled) setSeeded(true);
      })
      .catch((err: unknown) => {
        if (!cancelled) setStatus(`seed failed: ${String(err)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [configStore, userId]);

  const { provider } = useDataProvider(seeded ? PROVIDER_ID : null, { autoStart: false });

  const colDefs = useMemo<ColDef[]>(
    () =>
      COLUMN_DEFINITIONS.map((def) => ({
        field: def.field,
        headerName: def.headerName,
        cellDataType: def.cellDataType,
      })),
    [],
  );

  // Build the SSRM bundle during render so the grid's FIRST mount carries
  // rowModelType (initial-only). Same lifecycle discipline as useSsrmData.
  const bundle = useMemo<Bundle | null>(() => {
    if (!provider) return null;
    const workerUrl = client.providerWorkerAssetUrl;
    if (!workerUrl) return null;
    const engine = getSsrmEngineClient(engineAssetsFromWorkerUrl(workerUrl));
    const schema = buildSchemaFromColDefs(colDefs);
    const feed = createSsrmFeedTable({
      client: engine,
      schema,
      rowIdField: 'positionId',
      sparseTicks: THIN,
    });
    const datasource = new PerspectiveSsrmDatasource({
      table: feed.table,
      feed,
      schema,
      leafColumns: Object.keys(schema),
    });
    return {
      feed,
      datasource,
      gridOptions: createSsrmGridOptions(datasource),
      disposeTimer: null,
      disposed: false,
    };
  }, [provider, client, colDefs]);

  // Feed wiring + deferred disposal (StrictMode-safe, as in useSsrmData).
  useEffect(() => {
    if (!bundle || !provider) return;
    if (bundle.disposeTimer !== null) {
      clearTimeout(bundle.disposeTimer);
      bundle.disposeTimer = null;
    }
    let cancelled = false;
    const unsubSnapshot = provider.onSnapshotData((rows) => {
      if (cancelled) return;
      bundle.feed.applySnapshot(rows as readonly Record<string, unknown>[]);
      setStatus(`snapshot: ${rows.length} rows`);
    });
    const unsubTick = provider.onTick((rows) => {
      if (!cancelled && rows.length > 0) {
        bundle.feed.applyTicks(rows as readonly Record<string, unknown>[]);
      }
    });
    const unsubStatus = provider.onStatus((s, err) => {
      if (!cancelled) setStatus(err ? `${s}: ${err}` : s);
    });
    void provider.start().catch((err: unknown) => {
      if (!cancelled) setStatus(`start failed: ${String(err)}`);
    });
    return () => {
      cancelled = true;
      unsubSnapshot();
      unsubTick();
      unsubStatus();
      bundle.disposeTimer = setTimeout(() => {
        if (bundle.disposed) return;
        bundle.disposed = true;
        bundle.datasource.destroy();
        bundle.feed.dispose();
      }, 0);
    };
  }, [bundle, provider]);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col">
      <div
        style={{
          padding: '4px 10px',
          fontSize: 12,
          fontFamily: 'monospace',
          display: 'flex',
          gap: 16,
          alignItems: 'center',
        }}
      >
        <strong>SimpleSsrmGrid</strong>
        <span>provider={PROVIDER_ID}</span>
        <span>rate={RATE}/s batch={BATCH}{THIN ? ' thin-deltas' : ''}</span>
        <span data-testid="status">{status}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        {bundle ? (
          <AgGridReact
            {...(bundle.gridOptions as GridOptions)}
            columnDefs={colDefs}
            defaultColDef={DEFAULT_COL_DEF}
            sideBar
            statusBar={STATUS_BAR}
            cellSelection
          />
        ) : (
          <div style={{ padding: 16 }}>Booting SSRM engine…</div>
        )}
      </div>
    </div>
  );
}

export default SimpleSsrmGrid;
