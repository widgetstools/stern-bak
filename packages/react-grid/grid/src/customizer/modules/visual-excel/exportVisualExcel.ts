import type { GridApi } from 'ag-grid-community';
import {
  defaultVisualExcelFileName,
  type VisualExcelState,
} from '@wellsfargo-starui/core';
import { exportSsrmVisualExcel } from '../../../ssrm/exportSsrmExcel.js';
import { isSsrmGrid } from '../../../ssrm/ssrmSession.js';

export interface VisualExcelExportOptions {
  fileName?: string;
  /** When true, export only selected rows. Default false. */
  onlySelected?: boolean;
  /** Default `filteredAndSorted`. */
  exportedRows?: 'all' | 'filteredAndSorted';
  /** SSRM drain path only — CSRM always writes Excel. */
  format?: 'excel' | 'csv';
}

/**
 * Export grid data to Excel preserving display formatters and style-rule colours.
 * Under SSRM this drains the filtered book from the engine (or refuses) —
 * never `exportDataAsExcel` on the live cache.
 */
export function exportVisualExcel(
  api: GridApi,
  settings: VisualExcelState['settings'],
  options: VisualExcelExportOptions = {},
): void | Promise<void> {
  if (isSsrmGrid(api)) {
    return exportSsrmVisualExcel(api, settings, options);
  }

  const fileName = options.fileName
    ?? defaultVisualExcelFileName(settings.fileNamePrefix);

  api.exportDataAsExcel({
    fileName,
    author: 'MarketsGrid',
    exportedRows: options.exportedRows ?? 'filteredAndSorted',
    onlySelected: options.onlySelected ?? false,
    processCellCallback: (params) => params.formatValue(params.value),
  });
}
