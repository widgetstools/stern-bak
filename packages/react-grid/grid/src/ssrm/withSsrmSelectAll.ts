/**
 * AG Grid 36 SSRM header select-all needs `selectAll: 'all'` plus `getRowId`
 * so the grid uses `setServerSideSelectionState` for the book, not loaded nodes.
 */
export function withSsrmSelectAll<T>(rowSelection: T): T {
  if (!rowSelection || typeof rowSelection !== 'object') return rowSelection;
  const rs = rowSelection as { mode?: string; headerCheckbox?: boolean };
  if (rs.mode !== 'multiRow' || rs.headerCheckbox !== true) return rowSelection;
  return { ...rs, selectAll: 'all' } as T;
}
