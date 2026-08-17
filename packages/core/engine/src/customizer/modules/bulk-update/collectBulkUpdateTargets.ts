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

/**
 * What a selection actually reaches.
 *
 * `unreachableRows` counts selected rows the grid could not produce data for.
 * Under the server-side row model that is a row inside the selected range but
 * outside the loaded block window — the range is expressed in DISPLAYED
 * indices, which span the whole dataset, while only a window of it is
 * materialised. This used to be a bare `continue`: the update applied to the
 * loaded rows, reported that count as the whole job, and the user had no way
 * to know the rest were skipped. Silently partially applying is the defect;
 * counting them is what lets the caller say so.
 */
export interface BulkUpdateSelection {
  readonly targets: BulkUpdateTarget[];
  readonly unreachableRows: number;
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
  unreachable: Set<number>,
): void {
  const ranges = api.getCellRanges() ?? [];
  for (const range of ranges) {
    const start = range.startRow?.rowIndex ?? 0;
    const end = range.endRow?.rowIndex ?? start;
    const rowFrom = Math.min(start, end);
    const rowTo = Math.max(start, end);

    for (let ri = rowFrom; ri <= rowTo; ri += 1) {
      // DISPLAY, not dataset: the range is the cells the USER dragged over,
      // addressed by display index. Rows it cannot reach are REPORTED
      // (`unreachable`) rather than skipped, which is the parity fix — see Phase 4.
      // eslint-disable-next-line no-restricted-properties
      const rowNode = api.getDisplayedRowAtIndex(ri);
      // A loading stub answers with a node carrying no `data`. It is selected
      // and it will not be updated — report it rather than skipping quietly.
      if (!rowNode?.data) {
        unreachable.add(ri);
        continue;
      }
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
  unreachable: Set<number>,
): void {
  const focused = api.getFocusedCell();
  if (!focused) return;

  const colId = focused.column.getColId?.();
  if (!colId) return;

  // DISPLAY, not dataset: the FOCUSED cell is a display coordinate; unreachable is
  // still reported.
  // eslint-disable-next-line no-restricted-properties
  const rowNode = api.getDisplayedRowAtIndex(focused.rowIndex);
  if (!rowNode?.data) {
    unreachable.add(focused.rowIndex);
    return;
  }

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
): BulkUpdateSelection {
  const seen = new Set<string>();
  const out: BulkUpdateTarget[] = [];
  const unreachable = new Set<number>();
  collectFromRange(api, getRowId, seen, out, unreachable);
  if (out.length === 0) {
    collectFromFocus(api, getRowId, seen, out, unreachable);
  }
  return { targets: out, unreachableRows: unreachable.size };
}
