import { useMemo } from 'react';
import { MarketsGrid } from '@wellsfargo-starui/grid';
import { defaultColDef } from '../data/columns';
import { labStorage } from '../data/storage';
import { useLabRows } from '../demo/useLabRows';
import type { LabEngineGridProps } from './labRowEngine';

/**
 * The lab grid on the client row model — every window materializes the whole
 * book. This is the shape every tab had before the engine toggle existed, and
 * it is deliberately unchanged: it is the control the Perspective variant is
 * measured against, so a difference between them has exactly one cause.
 *
 * The two engines are separate components rather than a branch inside one,
 * because each owns hooks the other must not run. Switching remounts the grid,
 * which is correct — a row model is not a prop you can change under AG Grid.
 */
export function LabClientGrid({ config, onProfilesReady, rowCount }: LabEngineGridProps) {
  const stream = config.stream ?? { rowCount: 500, updateIntervalMs: 500 };
  const streamOpts = useMemo(
    () => (rowCount ? { ...stream, rowCount } : stream),
    [stream, rowCount],
  );
  const { rowData, onReady } = useLabRows(
    config.tabId,
    config.providerId,
    streamOpts,
    onProfilesReady,
  );

  const columnDefs = useMemo(() => config.getColumnDefs(), [config]);
  const grid = config.grid ?? {};

  return (
    <MarketsGrid
      gridId={config.gridId}
      componentName={config.componentName}
      rowData={rowData}
      columnDefs={columnDefs}
      defaultColDef={config.defaultColDef ?? defaultColDef}
      rowIdField="id"
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
  );
}
