/**
 * Per-grid registration of the app's write-back, and the one call every
 * editing funnel makes once its edit has landed.
 *
 * Keyed by grid id rather than threaded as a parameter for the same reason
 * {@link isJournalApplyInProgress} is: the five write funnels do not share a
 * call shape. Four of them go through {@link applyAndRecord} and hold an
 * `EditPlatform`; the fifth is the inline cell editor, which journals from
 * inside a column transform whose context carries no data port at all. A
 * registry is the only place both can reach, and `gridId` — which every
 * funnel already has — is what identifies the grid they belong to.
 */
import {
  applyPatches,
  submitEdits,
  type CellPatch,
  type EditJournal,
  type EditSource,
  type EditWriteBack,
  type GridDataPort,
} from '@wellsfargo-starui/core';
import { withJournalApplyGuard } from './journalApplyGuard.js';

interface RegisteredWriteBack {
  writeBack: EditWriteBack;
  port: GridDataPort;
}

const byGridId = new Map<string, RegisteredWriteBack>();

/** Install (or with `null`, remove) a grid's write-back. */
export function registerEditWriteBack(
  gridId: string,
  entry: RegisteredWriteBack | null,
): void {
  if (entry) byGridId.set(gridId, entry);
  else byGridId.delete(gridId);
}

export function hasEditWriteBack(gridId: string): boolean {
  return byGridId.has(gridId);
}

/**
 * Send an applied edit to the app's service, and reconcile the grid with the
 * answer. Returns immediately — deliberately.
 *
 * The edit is already in the grid and the user is already looking at it; the
 * point of an optimistic write is that the value does not wait for the
 * network. What the returned promise would carry is failure, and failure is
 * delivered through `onFailure` and a revert instead, so no funnel has to
 * learn to await something it cannot act on.
 *
 * A grid with no registered write-back does nothing at all, which is the
 * behaviour every existing consumer already has.
 */
export function submitAppliedEdits(params: {
  gridId: string;
  source: EditSource;
  patches: readonly CellPatch[];
  journal?: EditJournal | null;
  /** The optimistic journal entry to erase if the service refuses. */
  entryId?: string | null;
}): void {
  const registered = byGridId.get(params.gridId);
  if (!registered || params.patches.length === 0) return;

  const { journal, entryId } = params;
  void submitEdits(
    registered.writeBack,
    { gridId: params.gridId, source: params.source, patches: params.patches },
    {
      // Guarded, because the revert is a write like any other and would
      // otherwise be picked up by the cell-editor recorder as a fresh edit.
      rollback: (patches) =>
        withJournalApplyGuard(params.gridId, () =>
          applyPatches(registered.port, patches, 'undo'),
        ),
      retract: journal && entryId ? () => void journal.retract(entryId) : undefined,
    },
  );
}

/** Test seam — the registry is module state and outlives a single render. */
export function clearEditWriteBackRegistry(): void {
  byGridId.clear();
}
