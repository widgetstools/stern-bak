import { isNumericCellDataType } from './isNumericCellDataType.js';

/** Minimal grid reader — framework-agnostic (React + future Angular). */
export interface SmartEditGridReader {
  getCellRanges(): Array<{
    columns: Array<{ getColId(): string | undefined }>;
    startRow?: { rowIndex: number };
    endRow?: { rowIndex: number };
  }> | null;
  getDisplayedRowAtIndex(index: number): { id?: string; data?: Record<string, unknown> } | undefined;
  getColumn(colId: string): {
    getColDef(): { editable?: boolean | ((p: unknown) => boolean); field?: string; cellDataType?: string };
  } | null;
  getCellValue(params: { rowNode: unknown; colKey: string }): unknown;
}

export interface TargetCell {
  rowId: string;
  colId: string;
  field: string;
  value: unknown;
}

function isEditable(
  editable: boolean | ((p: unknown) => boolean) | undefined,
  rowNode: unknown,
): boolean {
  if (editable === false) return false;
  if (typeof editable === 'function') {
    try {
      return !!editable({ node: rowNode, data: (rowNode as { data?: unknown })?.data });
    } catch {
      return false;
    }
  }
  return true;
}

export function collectTargetCells(
  api: SmartEditGridReader,
  getRowId: (data: Record<string, unknown>) => string,
): TargetCell[] {
  const ranges = api.getCellRanges() ?? [];
  const out: TargetCell[] = [];
  const seen = new Set<string>();

  for (const range of ranges) {
    const start = range.startRow?.rowIndex ?? 0;
    const end = range.endRow?.rowIndex ?? start;
    const rowFrom = Math.min(start, end);
    const rowTo = Math.max(start, end);

    for (let ri = rowFrom; ri <= rowTo; ri += 1) {
      // DISPLAY, not dataset: the range is the cells the USER dragged over,
      // addressed by display index. A row outside the loaded window has no cell to
      // edit, so the port's dataset-wide answer would name rows the user never
      // selected.
      // eslint-disable-next-line no-restricted-properties
      const rowNode = api.getDisplayedRowAtIndex(ri);
      if (!rowNode?.data) continue;
      const data = rowNode.data;
      const rowId = rowNode.id ?? getRowId(data);

      for (const col of range.columns ?? []) {
        const colId = col.getColId?.();
        if (!colId || colId === 'ag-Grid-SelectionColumn') continue;

        const column = api.getColumn(colId);
        if (!column) continue;
        const colDef = column.getColDef();
        if (!isEditable(colDef.editable, rowNode)) continue;
        if (colDef.cellDataType && !isNumericCellDataType(colDef.cellDataType)) continue;

        const field = colDef.field ?? colId;
        const key = `${rowId}:${colId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const value = api.getCellValue({ rowNode, colKey: colId });
        out.push({ rowId, colId, field, value });
      }
    }
  }

  return out;
}

/** Single focused cell when no range selection exists. */
export function collectFocusedCell(
  api: SmartEditGridReader & {
    getFocusedCell(): { rowIndex: number; column: { getColId(): string | undefined } } | null;
  },
  getRowId: (data: Record<string, unknown>) => string,
): TargetCell[] {
  const focused = api.getFocusedCell();
  if (!focused) return [];

  const colId = focused.column.getColId?.();
  if (!colId) return [];

  // DISPLAY, not dataset: the FOCUSED cell is a display coordinate; there is no
  // dataset equivalent.
  // eslint-disable-next-line no-restricted-properties
  const rowNode = api.getDisplayedRowAtIndex(focused.rowIndex);
  if (!rowNode?.data) return [];

  const column = api.getColumn(colId);
  if (!column) return [];
  const colDef = column.getColDef();
  if (!isEditable(colDef.editable, rowNode)) return [];
  if (colDef.cellDataType && !isNumericCellDataType(colDef.cellDataType)) return [];

  const data = rowNode.data;
  const rowId = rowNode.id ?? getRowId(data);
  const field = colDef.field ?? colId;
  const value = api.getCellValue({ rowNode, colKey: colId });

  return [{ rowId, colId, field, value }];
}
