/**
 * Which fields a grid's quick filter searches.
 *
 * AG-Grid's own quick filter searches COLUMNS, and skips hidden ones unless
 * `includeHiddenColumnsInQuickFilter` is set. The server-side row model has no
 * equivalent: the worker holds raw rows and, without being told otherwise,
 * matched every field on them — so a search term hit a column the user had
 * hidden, and the grid returned rows with no visible reason for being there.
 *
 * The scope is read from the live grid rather than configured, because it is
 * live state: hiding a column changes it. One worker plane serves every grid
 * on a provider and their column sets differ, so it travels with each query
 * instead of being installed on the plane.
 *
 * `undefined` means "could not tell" — no grid, or no columns yet. Callers
 * send nothing, and the worker keeps its all-fields behaviour, which is the
 * only honest answer when the column state is unknown.
 */
import type { GridApi } from 'ag-grid-community';

interface ColumnLike {
  getColId?: () => string;
  getColDef?: () => { field?: string } | undefined;
}

/** Auto-generated columns (group, selection, drag) carry no row field. */
const GENERATED_COLUMN_PREFIX = 'ag-Grid-';

export function quickFilterColumnsOf(api: GridApi): string[] | undefined {
  let columns: ColumnLike[] | null | undefined;
  try {
    const includeHidden = Boolean(api.getGridOption('includeHiddenColumnsInQuickFilter'));
    columns = includeHidden ? api.getColumns() : api.getAllDisplayedColumns();
  } catch {
    return undefined;
  }
  if (!columns || columns.length === 0) return undefined;

  const fields: string[] = [];
  const seen = new Set<string>();
  for (const column of columns) {
    const colId = column.getColId?.() ?? '';
    if (colId.startsWith(GENERATED_COLUMN_PREFIX)) continue;
    const field = column.getColDef?.()?.field ?? colId;
    if (!field || field.startsWith('__') || seen.has(field)) continue;
    seen.add(field);
    fields.push(field);
  }
  return fields.length > 0 ? fields : undefined;
}
