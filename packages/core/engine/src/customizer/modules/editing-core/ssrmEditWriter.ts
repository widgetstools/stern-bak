/**
 * The SSRM engine write hook for editing-core (plan §12, phase C1).
 *
 * Under the server-side row model, `applyServerSideTransactionAsync` only
 * repaints the LOADED rows — the engine never learns, so the next tick or
 * block refresh reverts the edit. That is why Smart Edit, Bulk Update,
 * Plus/Minus and Shortcuts were disabled under SSRM. This brand closes the
 * loop: the SSRM surface attaches a writer bound to
 * `ISsrmDataProvider.applyEdits` (the same `ssrm-apply-edits` path pastes
 * use, whole rows + edited columns, held over feed resends by the worker's
 * edit overlay), and {@link applyPatches} calls it alongside the local
 * transaction. Same shape as `SSRM_EXPR_AGG_KEY` — a GridApi brand, so the
 * engine never imports `@wellsfargo-starui/grid`.
 *
 * Because EVERY editing write path funnels through `applyPatches` —
 * including `EditJournal.undo/redo/undoTo` — attaching this writer also
 * makes undo/redo persist engine-side (phase C2): an undo applies the
 * inverse patches as a normal engine write.
 */

export const SSRM_EDIT_WRITER_KEY = '__ssrmEditWriter' as const;

/** Whole rows plus, per row, the columns the edit actually touched. */
export type SsrmEditWriter = (
  rows: readonly Record<string, unknown>[],
  editedColumns: ReadonlyArray<readonly string[]>,
) => Promise<unknown>;

type BrandedApi = { [SSRM_EDIT_WRITER_KEY]?: SsrmEditWriter };

/** Attach / clear the writer — called by the SSRM surface on grid ready/teardown. */
export function attachSsrmEditWriter(api: unknown, writer: SsrmEditWriter | null): void {
  if (!api || typeof api !== 'object') return;
  if (writer) (api as BrandedApi)[SSRM_EDIT_WRITER_KEY] = writer;
  else delete (api as BrandedApi)[SSRM_EDIT_WRITER_KEY];
}

/** The writer, when an SSRM surface with a write-capable provider attached one. */
export function lookupSsrmEditWriter(api: unknown): SsrmEditWriter | undefined {
  if (!api || typeof api !== 'object') return undefined;
  return (api as BrandedApi)[SSRM_EDIT_WRITER_KEY];
}
