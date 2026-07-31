import type { CellValueChangedEvent } from 'ag-grid-community';

/** Sources that must NOT create journal entries (programmatic / undo / paste). */
const BLOCKED_CELL_CHANGE_SOURCES = new Set([
  'api',
  'undo',
  'redo',
  'paste',
  'rangeService',
  'bulkUndo',
  'cellRefresh',
]);

/**
 * User in-cell edits — AG Grid uses `edit`, `ui`, or omits source for inline editors;
 * block known programmatic paths (transactions, undo/redo stack, paste).
 */
export function isUserCellEditorChange(event: CellValueChangedEvent): boolean {
  const source = (event as { source?: string }).source;
  if (source == null || source === '') return true;
  return !BLOCKED_CELL_CHANGE_SOURCES.has(source);
}
