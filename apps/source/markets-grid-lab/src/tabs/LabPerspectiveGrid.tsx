import { useMemo } from 'react';
import { MarketsGrid } from '@wellsfargo-starui/grid';
import { defaultColDef } from '../data/columns';
import { labStorage } from '../data/storage';
import { usePerspectiveRows } from '../demo/usePerspectiveRows';
import type { LabEngineGridProps } from './labRowEngine';

/**
 * The same lab grid reading a Perspective Table hosted once in the SharedWorker.
 *
 * Every prop below except the row-engine four is byte-identical to the client
 * variant — same gridId, so the same saved profiles; same columns; same
 * toolbars. That is what makes the toggle an experiment rather than a second
 * app: whatever changes when you flip it, the engine changed it.
 *
 * The grid is mounted with a null `perspectiveTable` while the attach is in
 * flight, and that is on purpose. `MarketsGrid` renders NO grid at all in that
 * state; choosing a stand-in here would fire `onGridReady` and then
 * `onGridPreDestroyed`, permanently destroying the module platform the real
 * grid is about to need.
 */
export function LabPerspectiveGrid({ config, onProfilesReady, rowCount }: LabEngineGridProps) {
  const columnDefs = useMemo(() => config.getColumnDefs(), [config]);
  const stream = config.stream ?? { rowCount: 500, updateIntervalMs: 500 };
  const streamOpts = useMemo(
    () => (rowCount ? { ...stream, rowCount } : stream),
    [stream, rowCount],
  );

  const { rowData, onReady, table, keyColumn, queries, status, reason } = usePerspectiveRows(
    config.tabId,
    // Its own provider id, so the two engines never share a worker slot: one
    // wants a `mock` provider and the other a `mock-perspective` one, and the
    // hub keeps the cfg of whichever attached first.
    `${config.providerId}-perspective`,
    columnDefs,
    streamOpts,
    onProfilesReady,
  );

  const grid = config.grid ?? {};

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {(status === 'unavailable' || status === 'error') && (
        <p
          role="alert"
          data-testid="lab-perspective-unavailable"
          className="shrink-0 border-b border-[color:var(--ds-border-primary)] bg-[color:var(--ds-overlay-negative-soft)] px-3 py-2 text-[11px] leading-relaxed text-[color:var(--ds-accent-negative)]"
        >
          {reason ?? 'The worker refused this provider’s Perspective Table.'}
        </p>
      )}
      <div className="flex min-h-0 flex-1 flex-col">
        <MarketsGrid
          gridId={config.gridId}
          componentName={config.componentName}
          rowModel="perspective"
          perspectiveTable={table}
          perspectiveKeyColumn={keyColumn}
          perspectiveQueries={queries}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={config.defaultColDef ?? defaultColDef}
          rowIdField={keyColumn}
          storage={labStorage}
          onReady={onReady}
          showProfileSelector={grid.showProfileSelector ?? true}
          showSaveButton={grid.showSaveButton ?? true}
          showSettingsButton={grid.showSettingsButton ?? true}
          showFiltersToolbar={grid.showFiltersToolbar}
          showFormattingToolbar={grid.showFormattingToolbar}
          showEditingToolbar={grid.showEditingToolbar}
          showSmartEditToolbar={grid.showSmartEditToolbar}
          showBulkUpdateToolbar={grid.showBulkUpdateToolbar}
          showEditHistoryToolbar={grid.showEditHistoryToolbar}
          showVisualExcelExport={grid.showVisualExcelExport}
          sideBar={grid.sideBar}
          statusBar={grid.statusBar}
          rowHeight={grid.rowHeight}
        />
      </div>
    </div>
  );
}
