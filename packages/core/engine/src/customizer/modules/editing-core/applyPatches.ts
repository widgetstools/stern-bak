import { buildRowUpdatesFromPatches, type PatchDirection } from './buildRowUpdates.js';
import { lookupSsrmEditWriter } from './ssrmEditWriter.js';
import type { CellPatch, EditGridWriter } from './types.js';

/**
 * Per-row edited-column lists, aligned with {@link buildRowUpdatesFromPatches}
 * — both group by first-seen `rowId`, so index i of one describes index i of
 * the other. The engine's edit overlay holds exactly these columns over the
 * feed; the rest of each row rides along only so the whole-row upsert blanks
 * nothing.
 */
function editedColumnsFromPatches(patches: readonly CellPatch[]): string[][] {
  const byRowId = new Map<string, Set<string>>();
  for (const patch of patches) {
    const fields = byRowId.get(patch.rowId) ?? new Set<string>();
    fields.add(patch.field);
    byRowId.set(patch.rowId, fields);
  }
  return [...byRowId.values()].map((fields) => [...fields]);
}

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
  if (
    api.getGridOption?.('rowModelType') === 'serverSide'
    && api.applyServerSideTransactionAsync
  ) {
    // Paint the loaded rows now…
    api.applyServerSideTransactionAsync({ update: updates });
    // …and persist through the engine write path, or the next tick reverts
    // it. The writer is the SSRM surface's `ISsrmDataProvider.applyEdits`
    // binding (see ssrmEditWriter.ts); without one this stays the old
    // paint-only behaviour — which is why the editing toolbars only enable
    // under SSRM when a writer is present. Undo/redo flow through here too,
    // so an undo persists as an ordinary engine write of the old values.
    const writer = lookupSsrmEditWriter(api);
    if (writer) {
      void writer(updates, editedColumnsFromPatches(patches)).catch((err: unknown) => {
        // eslint-disable-next-line no-console
        console.warn('[editing] edit did not reach the engine — the next tick may revert it', err);
      });
    }
    return patches.length;
  }
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
