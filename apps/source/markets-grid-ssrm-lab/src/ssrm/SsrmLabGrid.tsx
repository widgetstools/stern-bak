import { useMemo } from 'react';
import type { ColDef } from 'ag-grid-community';
import { MarketsGrid, type MarketsGridProps } from '@wellsfargo-starui/grid';
import { useSsrmDataProvider } from '@wellsfargo-starui/react/data/runtime';
import { useSsrmProviderDataWiring } from '@wellsfargo-starui/grid/widgets/ssrm-markets-grid-container';
import { labStorage } from '../data/storage.js';
import { useSsrmLabProvider } from './SsrmLabProviderContext.js';

type GridChrome = Pick<
  MarketsGridProps,
  | 'showFiltersToolbar'
  | 'showFormattingToolbar'
  | 'showEditingToolbar'
  | 'showSmartEditToolbar'
  | 'showBulkUpdateToolbar'
  | 'showEditHistoryToolbar'
  | 'showVisualExcelExport'
  | 'showProfileSelector'
  | 'showSaveButton'
  | 'showSettingsButton'
  | 'sideBar'
  | 'statusBar'
  | 'rowHeight'
>;

export interface SsrmLabGridProps extends GridChrome {
  gridId: string;
  componentName: string;
  /** Ignored for data fields — STOMP SSRM columns come from the provider. Kept for lab API parity. */
  columnDefs?: ColDef[];
  defaultColDef?: ColDef;
  onReady?: MarketsGridProps['onReady'];
}

/**
 * MarketsGrid + SSRM for lab feature tabs — lab chrome/profiles, STOMP columns + data.
 */
export function SsrmLabGrid({
  gridId,
  componentName,
  defaultColDef,
  onReady,
  showProfileSelector = true,
  showSaveButton = true,
  showSettingsButton = true,
  showFiltersToolbar,
  showFormattingToolbar,
  showEditingToolbar,
  showSmartEditToolbar,
  showBulkUpdateToolbar,
  showEditHistoryToolbar,
  showVisualExcelExport,
  sideBar,
  statusBar,
  rowHeight,
}: SsrmLabGridProps) {
  const { providerId, inlineCfg, seeding } = useSsrmLabProvider();

  const { provider } = useSsrmDataProvider(providerId, {
    inlineCfg,
    trackStatus: false,
    autoStart: false,
  });

  const { ready } = useSsrmProviderDataWiring({ provider });

  const keyColumn = useMemo(() => {
    if (!provider || !ready) return 'positionId';
    try {
      const cfg = provider.getConfig() as { keyColumn?: string | readonly string[] };
      if (Array.isArray(cfg.keyColumn)) return '__ssrmRowId';
      return cfg.keyColumn && String(cfg.keyColumn).trim()
        ? String(cfg.keyColumn)
        : 'positionId';
    } catch {
      return 'positionId';
    }
  }, [provider, ready]);

  const columnDefs = useMemo<ColDef[]>(() => {
    if (!provider || !ready) return [];
    try {
      const defs = provider.getColumnDefs();
      return defs.map((c) => ({
        field: c.field,
        headerName: c.headerName ?? c.field,
        width: c.width,
        hide: c.hide,
        filter: true,
        sortable: true,
        resizable: true,
        enableRowGroup: true,
        enablePivot: true,
        enableValue: true,
      })) as ColDef[];
    } catch {
      return [];
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

  const ssrm = useMemo(
    () =>
      provider
        ? { provider, keyColumn, cacheBlockSize }
        : undefined,
    [provider, keyColumn, cacheBlockSize],
  );

  if (seeding || !ready || !ssrm || columnDefs.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center text-[13px] text-[color:var(--ds-text-secondary)]">
        Starting SSRM provider…
      </div>
    );
  }

  return (
    <MarketsGrid
      gridId={gridId}
      componentName={componentName}
      ssrm={ssrm}
      rowData={[]}
      columnDefs={columnDefs}
      defaultColDef={defaultColDef}
      storage={labStorage}
      onReady={onReady}
      showProfileSelector={showProfileSelector}
      showSaveButton={showSaveButton}
      showSettingsButton={showSettingsButton}
      showFiltersToolbar={showFiltersToolbar}
      showFormattingToolbar={showFormattingToolbar}
      showEditingToolbar={showEditingToolbar}
      showSmartEditToolbar={showSmartEditToolbar}
      showBulkUpdateToolbar={showBulkUpdateToolbar}
      showEditHistoryToolbar={showEditHistoryToolbar}
      showVisualExcelExport={showVisualExcelExport}
      sideBar={sideBar}
      statusBar={statusBar}
      rowHeight={rowHeight}
    />
  );
}
