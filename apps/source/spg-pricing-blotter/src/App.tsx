/**
 * SPG Pricing Blotter — a structured-products trader's book over the
 * platform's server-side row model, backed by a real server:
 *
 *   SQLite ⇄ Express-style REST + STOMP feed  ⇄  SharedWorker WASM engine
 *          (server/server.mjs, port 8091)        ⇄  MarketsGrid (SSRM)
 *
 * The demo's spine is the write lifecycle. Every write path the grid has
 * — cell edits, a paste covering hundreds of rows of Price/Prior Px,
 * Smart Edit, Bulk Update, the CSV import — funnels through ONE seam
 * (`withServerWrites`), so each cell honestly reports where its value is:
 * amber = staged locally, yellow border = at the server awaiting commit,
 * clear + flash = committed (the flash is the server's own post-commit
 * echo, carrying the derived Mkt Value / Px Chg % it recomputed).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GridApi } from 'ag-grid-community';
import { CloudUpload, Database, FileUp, RotateCcw, Save } from 'lucide-react';
import { Badge, Button } from '@wellsfargo-starui/react';
import { MarketsGrid, createMarketsGridLocalStorageStorage, type MarketsGridHandle } from '@wellsfargo-starui/grid';
import { useSsrmDataProvider } from '@wellsfargo-starui/react/data/runtime';
import { buildSpgColumnDefs, SPG_DEFAULT_COL_DEF } from './provider/columns';
import { useSpgProviderId } from './provider/spgProvider';
import { CellStateStore } from './trading/cellStates';
import { withServerWrites, type TradingProvider } from './trading/serverWriteProvider';
import { serverHealth } from './trading/api';
import { ImportPricesDialog } from './components/ImportPricesDialog';

const spgStorage = createMarketsGridLocalStorageStorage();

export function App() {
  const providerId = useSpgProviderId();
  const { provider } = useSsrmDataProvider(providerId ?? '', { autoStart: providerId != null });
  const gridApiRef = useRef<GridApi | null>(null);

  const store = useMemo(() => new CellStateStore(), []);
  const [counts, setCounts] = useState(store.counts());
  const [importOpen, setImportOpen] = useState(false);
  const [health, setHealth] = useState<'up' | 'down' | 'checking'>('checking');

  const trading: TradingProvider | null = useMemo(
    () => (provider ? withServerWrites(provider, store) : null),
    [provider, store],
  );

  // One throttled repaint per state-change burst: a 500-cell paste marks
  // 500 cells pending in one flush and must cost one refresh, not 500.
  useEffect(() => {
    let scheduled = false;
    return store.subscribe(() => {
      setCounts(store.counts());
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        try {
          gridApiRef.current?.refreshCells({ force: true, suppressFlash: true });
        } catch {
          /* grid mid-mount */
        }
      });
    });
  }, [store]);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const h = await serverHealth();
      if (alive) setHealth(h ? 'up' : 'down');
    };
    void check();
    const timer = setInterval(check, 5000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  const columnDefs = useMemo(() => buildSpgColumnDefs(store), [store]);

  const onReady = useCallback((handle: MarketsGridHandle) => {
    gridApiRef.current = handle.gridApi;
  }, []);

  const ssrm = useMemo(
    () => (trading ? { provider: trading, keyColumn: 'cusip' as const, cacheBlockSize: 200 } : null),
    [trading],
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-[color:var(--ds-surface-ground)]">
      <header className="flex items-center gap-3 border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-surface-primary)] px-4 py-2">
        <div className="flex items-baseline gap-2">
          <h1 className="text-[15px] font-semibold tracking-tight text-[color:var(--ds-text-primary)]">
            SPG Pricing
          </h1>
          <span className="text-[12px] text-[color:var(--ds-text-secondary)]">
            Structured Products · marks &amp; bulk pricing
          </span>
        </div>

        <div className="ml-2 flex items-center gap-1.5" data-testid="spg-write-chips">
          {counts.staged > 0 ? (
            <Badge variant="outline" className="border-[color:var(--ds-accent-warning)] text-[color:var(--ds-accent-warning)]">
              {counts.staged} staged
            </Badge>
          ) : null}
          {counts.pending > 0 ? (
            <Badge variant="outline" className="border-[color:var(--ds-accent-warning)] text-[color:var(--ds-text-primary)]">
              {counts.pending} awaiting server
            </Badge>
          ) : null}
          {counts.failed > 0 ? (
            <Badge
              variant="outline"
              role="button"
              title="Click to clear failed markers"
              className="cursor-pointer border-[color:var(--ds-accent-negative)] text-[color:var(--ds-accent-negative)]"
              onClick={() => store.clearState('failed')}
            >
              {counts.failed} failed — click to clear
            </Badge>
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span
            className="flex items-center gap-1.5 text-[12px] text-[color:var(--ds-text-secondary)]"
            data-testid="spg-server-health"
          >
            <Database size={13} className={health === 'up' ? 'text-[color:var(--ds-accent-positive)]' : 'text-[color:var(--ds-accent-negative)]'} />
            {health === 'up' ? 'SQLite server' : health === 'down' ? 'server offline — npm run server' : 'checking…'}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            disabled={!trading}
            onClick={() => setImportOpen(true)}
            data-testid="spg-open-import"
          >
            <FileUp size={14} />
            Import CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            disabled={!trading || counts.staged === 0}
            onClick={() => void trading?.discardStaged()}
            data-testid="spg-discard-staged"
          >
            <RotateCcw size={14} />
            Discard
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5"
            disabled={!trading || counts.staged === 0}
            onClick={() => void trading?.saveStaged()}
            data-testid="spg-save-staged"
          >
            <Save size={14} />
            Save {counts.staged > 0 ? counts.staged : ''} to server
          </Button>
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col p-2">
        {ssrm ? (
          <MarketsGrid
            gridId="spg-pricing-blotter"
            componentName="SPG Pricing"
            rowData={[]}
            ssrm={ssrm}
            columnDefs={columnDefs}
            defaultColDef={SPG_DEFAULT_COL_DEF}
            rowIdField="cusip"
            storage={spgStorage}
            onReady={onReady}
            showProfileSelector
            showSaveButton
            showSettingsButton
            showFiltersToolbar
            showFormattingToolbar
            showEditingToolbar
            showSmartEditToolbar
            showBulkUpdateToolbar
            showEditHistoryToolbar
            sideBar
          />
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-[13px] text-[color:var(--ds-text-secondary)]">
            <CloudUpload size={15} className="animate-pulse" />
            Connecting to the pricing server…
          </div>
        )}
      </main>

      {trading ? (
        <ImportPricesDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          onStage={(rows) => trading.stage(rows)}
        />
      ) : null}
    </div>
  );
}
