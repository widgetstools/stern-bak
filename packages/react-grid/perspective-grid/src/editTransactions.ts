/**
 * Turn an AG Grid data transaction into Table edits.
 *
 * The editing modules — smart edit, bulk update, and undo/redo in the
 * data-change-history panel — do not write through the cell editor. They build
 * a patch list and hand it to `GridPlatform.applyDataTransaction` as a
 * transaction of FULL ROW objects. On the client-side row model that lands
 * directly in the row store; under the server row model
 * `GridApi.applyTransactionAsync` is not the write path at all, and the book
 * lives in the worker regardless.
 *
 * MEASURED, and the reason this module exists: with nothing mapping that
 * transaction, smart edit on the Perspective surface reported the right cell
 * count, enabled its buttons, ran its handler and changed NOTHING. The same
 * flow on the client-side twin, same column, same operand, doubled the value —
 * 4,215,482 -> 8,430,964 against 30,053,717 -> 30,053,717.
 *
 * Two rules the naive mapping gets wrong:
 *
 *   - **Only CHANGED fields may be written.** A transaction row is the whole
 *     row, rebuilt from the node's current data with the patched fields
 *     overwritten. Upserting all of it would write back this window's copy of
 *     every OTHER column — including the ones the live feed is sweeping — so a
 *     one-cell edit would resurrect stale prices for every peer window reading
 *     the same Table. Diffing against the node is what keeps an edit an edit.
 *   - **`add` and `remove` are ignored.** Membership of the book belongs to the
 *     provider that fills the Table, not to an editing module in one window.
 *     Deleting a row here would delete it for every blotter on the desk, and it
 *     would return on the next snapshot anyway.
 */
import { GRAND_TOTAL_FLAG, type PerspectiveCellEdit } from './perspectiveRowEngine.js';

/** The shape `GridPlatform.applyDataTransaction` passes on. */
export interface GridDataTransaction {
  add?: unknown[];
  update?: unknown[];
  remove?: unknown[];
}

export interface ToPerspectiveEditsOpts {
  /**
   * The row as the grid currently holds it, by key. Fields matching it are
   * dropped as unchanged. When it answers undefined — a row outside the loaded
   * blocks — every non-key field is written, because a best-effort write is
   * better than dropping an edit the user made.
   */
  currentRow?(key: unknown): Record<string, unknown> | undefined;
}

/**
 * Map a transaction to the minimal set of cell edits it represents.
 *
 * The key column is never emitted: rewriting the index is a re-key, which
 * upserts a second row and orphans the first (`applyEdit` refuses it too, and
 * loudly — this just never asks).
 */
export function toPerspectiveEdits(
  tx: GridDataTransaction,
  keyColumn: string,
  opts: ToPerspectiveEditsOpts = {},
): PerspectiveCellEdit[] {
  const edits: PerspectiveCellEdit[] = [];

  for (const candidate of tx.update ?? []) {
    if (!candidate || typeof candidate !== 'object') continue;
    const row = candidate as Record<string, unknown>;
    // Not a row of the book — it carries aggregates, and upserting one would
    // invent an index value.
    if (row[GRAND_TOTAL_FLAG]) continue;

    const key = row[keyColumn];
    if (key === null || key === undefined) continue;

    const current = opts.currentRow?.(key);
    for (const [field, value] of Object.entries(row)) {
      if (field === keyColumn || field === GRAND_TOTAL_FLAG) continue;
      if (current && Object.is(current[field], value)) continue;
      edits.push({ key, field, value });
    }
  }

  return edits;
}
