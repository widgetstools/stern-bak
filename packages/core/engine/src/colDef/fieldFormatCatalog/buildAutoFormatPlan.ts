/**
 * buildAutoFormatPlan — map every supplied column to its resolved
 * {@link AutoFormatAssignment} via {@link matchFieldToCatalog}. Columns that
 * neither match the catalog nor a type fallback are omitted, so the caller
 * (the Auto Format toolbar action) only writes the columns it can improve.
 */
import { matchFieldToCatalog } from './matchFieldToCatalog.js';
import type { AutoFormatAssignment, AutoFormatColumn } from './types.js';

export function buildAutoFormatPlan(
  columns: readonly AutoFormatColumn[],
): Record<string, AutoFormatAssignment> {
  const plan: Record<string, AutoFormatAssignment> = {};
  for (const col of columns) {
    if (!col.colId) continue;
    const resolved = matchFieldToCatalog(col.field ?? col.colId, col.headerName, col.cellDataType);
    if (resolved) plan[col.colId] = resolved;
  }
  return plan;
}
