/**
 * The one place a cell edit reaches rows.
 *
 * Every editing funnel — smart edit, bulk update, plus/minus, shortcuts, and
 * the journal's own undo/redo — comes through here, and here goes through
 * `platform.data.mutate`. It used to `await api.applyTransactionAsync(...)`,
 * which returns `void`: the await resolved on the next microtask whether or
 * not anything had been written, and on a server-side grid nothing ever was.
 * That resolved-instantly `undefined` is what let the edit journal record a
 * history entry for an edit that never happened.
 *
 * The port answers with what it CONFIRMED. Callers record from
 * {@link EditApplyResult.applied} and nothing else.
 */
import { buildRowPatches, type PatchDirection } from './buildRowPatches.js';
import type { CellPatch, EditApplyResult } from './types.js';
import type { GridDataPort } from '../../../platform/types.js';

/** No patches, so nothing to confirm and nothing to refuse. */
const NOTHING_TO_APPLY: EditApplyResult = { applied: [], rejected: [], ok: true };

/** Apply patches in undo or redo direction through the grid data port. */
export async function applyPatches(
  port: GridDataPort,
  patches: readonly CellPatch[],
  direction: PatchDirection,
): Promise<EditApplyResult> {
  if (patches.length === 0) return NOTHING_TO_APPLY;

  const result = await port.mutate(buildRowPatches(patches, direction));
  const landed = new Set(result.applied);

  return {
    // Per-CELL, not per-row: a caller's journal entry, preview table and undo
    // stack are all keyed on cell patches, so the confirmation has to come
    // back in the same currency it went out in.
    applied: patches.filter((patch) => landed.has(patch.rowId)),
    rejected: result.rejected,
    ok: result.ok,
  };
}

/** Apply forward patches (new values) — shared by editing modules. */
export async function applyForwardPatches(
  port: GridDataPort,
  patches: readonly CellPatch[],
): Promise<EditApplyResult> {
  return applyPatches(port, patches, 'redo');
}
