/**
 * gridColumnAdapter — the thin layer between AG-Grid's `GridApi` and the pure
 * `columnSelectorModel`. Keeps all AG-Grid coupling in one place so the model
 * and the React state stay grid-agnostic and testable.
 */

import type { Column, GridApi } from 'ag-grid-community';
import {
  computeColumnState,
  type ColumnDescriptor,
  type ColumnSelectorState,
} from './columnSelectorModel';

/** AG-Grid auto/internal columns (row group, selection checkbox, …). */
function isInternal(colId: string): boolean {
  return colId.startsWith('ag-Grid-');
}

/**
 * Read the live grid columns into selector descriptors, in current column
 * order. Internal AG-Grid columns are skipped (not user-selectable).
 */
export function readGridColumns(api: GridApi): ColumnDescriptor[] {
  const columns = (api.getColumns() ?? []) as Column[];
  const out: ColumnDescriptor[] = [];
  for (const col of columns) {
    const colId = col.getColId();
    if (isInternal(colId)) continue;
    const def = col.getColDef();
    out.push({
      colId,
      headerName: def.headerName ?? colId,
      hidden: !col.isVisible(),
      locked: def.lockVisible === true,
    });
  }
  return out;
}

/**
 * Apply the selector state to the live grid: reorder so visible columns come
 * first (shown) followed by available columns (hidden). Order + visibility
 * only — widths, pinning, sort, and filters are left untouched.
 */
export function applyColumnSelection(api: GridApi, state: ColumnSelectorState): void {
  api.applyColumnState({
    state: computeColumnState(state).map((e) => ({ colId: e.colId, hide: e.hide })),
    applyOrder: true,
  });
}
