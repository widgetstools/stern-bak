import type { EditGridWriter } from '@wellsfargo-starui/engine';
import type { EditJournal } from '@wellsfargo-starui/engine';
import { withJournalApplyGuard } from './journalApplyGuard.js';

export async function journalUndo(
  platform: { gridId: string },
  journal: EditJournal,
  api: EditGridWriter,
  rowIdField = 'id',
): Promise<boolean> {
  return withJournalApplyGuard(platform.gridId, () => journal.undo(api, rowIdField));
}

export async function journalRedo(
  platform: { gridId: string },
  journal: EditJournal,
  api: EditGridWriter,
  rowIdField = 'id',
): Promise<boolean> {
  return withJournalApplyGuard(platform.gridId, () => journal.redo(api, rowIdField));
}

export async function journalUndoEntry(
  platform: { gridId: string },
  journal: EditJournal,
  api: EditGridWriter,
  entryId: string,
  rowIdField = 'id',
): Promise<boolean> {
  return withJournalApplyGuard(platform.gridId, () => journal.undoEntry(api, entryId, rowIdField));
}
