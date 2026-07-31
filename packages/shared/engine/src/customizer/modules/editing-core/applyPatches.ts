import { buildRowUpdatesFromPatches, type PatchDirection } from './buildRowUpdates.js';
import type { CellPatch, EditGridWriter } from './types.js';

/** Apply patches in undo or redo direction via a full-row transaction. */
export async function applyPatches(
  api: EditGridWriter,
  patches: readonly CellPatch[],
  direction: PatchDirection,
  rowIdField = 'id',
): Promise<number> {
  if (patches.length === 0) return 0;
  const updates = buildRowUpdatesFromPatches(api, patches, direction, rowIdField);
  if (updates.length === 0) return 0;
  await api.applyTransactionAsync({ update: updates });
  return patches.length;
}

/** Apply forward patches (new values) — shared by editing modules. */
export async function applyForwardPatches(
  api: EditGridWriter,
  patches: readonly CellPatch[],
  rowIdField = 'id',
): Promise<number> {
  return applyPatches(api, patches, 'redo', rowIdField);
}
