import { createGrid, type ColDef, type GridApi } from 'ag-grid-community';
import { defaultVisualExcelFileName, type VisualExcelState } from '@wellsfargo-starui/core';
import type { VisualExcelExportOptions } from '../customizer/modules/visual-excel/exportVisualExcel.js';
import {
  drainSsrmRows,
  ssrmExportRequestFromApi,
} from './drainSsrmRows.js';
import { getSsrmSession } from './ssrmSession.js';

export function filterSsrmExportSelection(
  api: GridApi,
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  const state = api.getServerSideSelectionState?.() as
    | { selectAll?: boolean }
    | undefined;
  if (state?.selectAll) return rows;
  const ids = new Set(
    (api.getSelectedNodes?.() ?? [])
      .map((n) => n.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  );
  if (ids.size === 0) return [];
  const getRowId = api.getGridOption?.('getRowId') as
    | ((p: { data: unknown }) => string)
    | undefined;
  return rows.filter((row) => {
    const id = getRowId ? String(getRowId({ data: row })) : String(
      (row as { id?: unknown }).id ?? '',
    );
    return ids.has(id);
  });
}

export function exportDrainedRowsAsExcel(
  sourceApi: GridApi,
  rows: Record<string, unknown>[],
  settings: VisualExcelState['settings'],
  options: VisualExcelExportOptions = {},
): void {
  if (typeof document === 'undefined') {
    console.warn('[ssrm] Excel export needs a document.');
    return;
  }
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-9999px;width:8px;height:8px;overflow:hidden';
  document.body.appendChild(host);
  const grid = createGrid(host, {
    columnDefs: (sourceApi.getColumnDefs?.() ?? []) as ColDef[],
    rowData: rows,
    defaultColDef: sourceApi.getGridOption?.('defaultColDef') as ColDef | undefined,
  });
  try {
    const fileName = options.fileName
      ?? defaultVisualExcelFileName(settings.fileNamePrefix);
    const processCellCallback = (params: {
      value: unknown;
      formatValue?: (value: unknown) => unknown;
    }): string => String(params.formatValue?.(params.value) ?? params.value ?? '');
    if (options.format === 'csv') {
      grid.exportDataAsCsv({ fileName, processCellCallback });
    } else {
      grid.exportDataAsExcel({
        fileName,
        author: 'MarketsGrid',
        exportedRows: 'filteredAndSorted',
        onlySelected: false,
        processCellCallback,
      });
    }
  } finally {
    grid.destroy();
    host.remove();
  }
}

export async function exportSsrmVisualExcel(
  api: GridApi,
  settings: VisualExcelState['settings'],
  options: VisualExcelExportOptions = {},
): Promise<void> {
  const session = getSsrmSession(api);
  if (!session) {
    console.warn(
      '[ssrm] Excel export refused: no engine session. Not exporting loaded blocks as the book.',
    );
    return;
  }
  let rows = await drainSsrmRows(session.provider, ssrmExportRequestFromApi(api));
  if (options.onlySelected) rows = filterSsrmExportSelection(api, rows);
  exportDrainedRowsAsExcel(api, rows, settings, options);
}
