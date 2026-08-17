import type { EditJournal, EditPlatform } from '@wellsfargo-starui/core';
import { withJournalApplyGuard } from './journalApplyGuard.js';

export async function journalUndo(
  platform: EditPlatform,
  journal: EditJournal,
): Promise<boolean> {
  return withJournalApplyGuard(platform.gridId, () => journal.undo(platform.data));
}

export async function journalRedo(
  platform: EditPlatform,
  journal: EditJournal,
): Promise<boolean> {
  return withJournalApplyGuard(platform.gridId, () => journal.redo(platform.data));
}

export async function journalUndoEntry(
  platform: EditPlatform,
  journal: EditJournal,
  entryId: string,
): Promise<boolean> {
  return withJournalApplyGuard(platform.gridId, () => journal.undoEntry(platform.data, entryId));
}
