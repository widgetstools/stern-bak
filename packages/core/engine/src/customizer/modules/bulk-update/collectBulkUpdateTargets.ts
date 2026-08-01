import { isBulkUpdateCellType } from './isBulkUpdateCellType.js';

/** Minimal grid reader — framework-agnostic. */
export interface BulkUpdateGridReader {
  getCellRanges(): Array<{
    columns: Array<{ getColId(): string | undefined }>;
    startRow?: { rowIndex: number };
    endRow?: { rowIndex: number };
  }> | null;
  getDisplayedRowAtIndex(index: number): { id?: string; data?: Record<string, unknown> } | undefined;
  getColumn(colId: string): {
    getColDef(): {
      editable?: boolean | ((p: unknown) => boolean);
      field?: string;
      cellDataType?: string;
    };
  } | null;
  getCellValue(params: { rowNode: unknown; colKey: string }): unknown;
  getFocusedCell(): { rowIndex: number; column: { getColId(): string | undefined } } | null;
}

export interface BulkUpdateTarget {
  rowId: string;
  colId: string;
  field: string;
  value: unknown;
  cellDataType?: string;
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

function collectFromRange(
  api: BulkUpdateGridReader,
  getRowId: (data: Record<string, unknown>) => string,
  seen: Set<string>,
  out: BulkUpdateTarget[],
): void {
  const ranges = api.getCellRanges() ?? [];
  for (const range of ranges) {
    const start = range.startRow?.rowIndex ?? 0;
    const end = range.endRow?.rowIndex ?? start;
    const rowFrom = Math.min(start, end);
    const rowTo = Math.max(start, end);

    for (let ri = rowFrom; ri <= rowTo; ri += 1) {
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
        if (colDef.cellDataType && !isBulkUpdateCellType(colDef.cellDataType)) continue;

        const field = colDef.field ?? colId;
        const key = `${rowId}:${colId}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const value = api.getCellValue({ rowNode, colKey: colId });
        out.push({
          rowId,
          colId,
          field,
          value,
          cellDataType: colDef.cellDataType,
        });
      }
    }
  }
}

function collectFromFocus(
  api: BulkUpdateGridReader,
  getRowId: (data: Record<string, unknown>) => string,
  seen: Set<string>,
  out: BulkUpdateTarget[],
): void {
  const focused = api.getFocusedCell();
  if (!focused) return;

  const colId = focused.column.getColId?.();
  if (!colId) return;

  const rowNode = api.getDisplayedRowAtIndex(focused.rowIndex);
  if (!rowNode?.data) return;

  const column = api.getColumn(colId);
  if (!column) return;
  const colDef = column.getColDef();
  if (!isEditable(colDef.editable, rowNode)) return;
  if (colDef.cellDataType && !isBulkUpdateCellType(colDef.cellDataType)) return;

  const data = rowNode.data;
  const rowId = rowNode.id ?? getRowId(data);
  const field = colDef.field ?? colId;
  const key = `${rowId}:${colId}`;
  if (seen.has(key)) return;

  seen.add(key);
  const value = api.getCellValue({ rowNode, colKey: colId });
  out.push({
    rowId,
    colId,
    field,
    value,
    cellDataType: colDef.cellDataType,
  });
}

export function collectBulkUpdateTargets(
  api: BulkUpdateGridReader,
  getRowId: (data: Record<string, unknown>) => string,
): BulkUpdateTarget[] {
  const seen = new Set<string>();
  const out: BulkUpdateTarget[] = [];
  collectFromRange(api, getRowId, seen, out);
  if (out.length === 0) {
    collectFromFocus(api, getRowId, seen, out);
  }
  return out;
}
