import type { RowPatch } from '../../../platform/types.js';
import type { CellPatch } from './types.js';

export type PatchDirection = 'undo' | 'redo';

/**
 * Group cell patches into one {@link RowPatch} per row, taking the direction's
 * side of each patch.
 *
 * This replaced `buildRowUpdatesFromPatches`, which merged the fields onto a
 * copy of the row it read out of a `GridApi` — and, when the grid did not hold
 * that row, invented `{ [rowIdField]: rowId }` so AG-Grid could drop it
 * silently. Row assembly is the row-model-specific half and now belongs to the
 * port's adapters (`assemblePatchRows`), which REPORT a row they cannot
 * address instead. Nothing here touches a grid.
 */
export function buildRowPatches(
  patches: readonly CellPatch[],
  direction: PatchDirection,
): RowPatch[] {
  const byRowId = new Map<string, Record<string, unknown>>();

  for (const patch of patches) {
    let fields = byRowId.get(patch.rowId);
    if (!fields) {
      fields = {};
      byRowId.set(patch.rowId, fields);
    }
    fields[patch.field] = direction === 'undo' ? patch.oldValue : patch.newValue;
  }

  return [...byRowId].map(([rowId, fields]) => ({ rowId, fields }));
}
