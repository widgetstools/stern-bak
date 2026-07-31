import type { CellPatch, EditGridWriter } from './types.js';

export type PatchDirection = 'undo' | 'redo';

/** Group patches into full row objects for applyTransactionAsync. */
export function buildRowUpdatesFromPatches(
  api: EditGridWriter,
  patches: readonly CellPatch[],
  direction: PatchDirection,
  rowIdField = 'id',
): Record<string, unknown>[] {
  const byRowId = new Map<string, Record<string, unknown>>();

  for (const patch of patches) {
    const value = direction === 'undo' ? patch.oldValue : patch.newValue;
    let row = byRowId.get(patch.rowId);
    if (!row) {
      const existing = api.getRowNode(patch.rowId)?.data;
      row =
        existing && typeof existing === 'object'
          ? { ...(existing as Record<string, unknown>) }
          : { [rowIdField]: patch.rowId };
      byRowId.set(patch.rowId, row);
    }
    row[patch.field] = value;
  }

  return [...byRowId.values()];
}
