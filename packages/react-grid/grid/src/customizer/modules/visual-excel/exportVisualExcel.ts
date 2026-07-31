import type { GridApi } from 'ag-grid-community';
import {
  defaultVisualExcelFileName,
  type VisualExcelState,
} from '@wellsfargo-starui/engine';

export interface VisualExcelExportOptions {
  fileName?: string;
  /** When true, export only selected rows. Default false. */
  onlySelected?: boolean;
  /** Default `filteredAndSorted`. */
  exportedRows?: 'all' | 'filteredAndSorted';
}

/** Export grid data to Excel preserving display formatters and style-rule colours. */
export function exportVisualExcel(
  api: GridApi,
  settings: VisualExcelState['settings'],
  options: VisualExcelExportOptions = {},
): void {
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
