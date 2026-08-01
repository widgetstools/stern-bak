import { EditJournal } from '@wellsfargo-starui/core';
import {
  DATA_CHANGE_HISTORY_MODULE_ID,
  type DataChangeHistoryState,
} from '@wellsfargo-starui/core';

/** One EditJournal per grid — shared by all editing modules on that grid. */
const journalsByGridId = new Map<string, EditJournal>();

/** Detect journals created before the monitor undo API (HMR / stale singleton). */
function journalHasMonitorUndoApi(journal: EditJournal): boolean {
  return typeof journal.canUndoEntry === 'function' && typeof journal.undoStackSize === 'number';
}

export function journalCanUndoEntry(journal: EditJournal, entryId: string): boolean {
  if (journalHasMonitorUndoApi(journal)) {
    return journal.canUndoEntry(entryId);
  }
  return false;
}

export function journalUndoStackSize(journal: EditJournal): number {
  if (typeof journal.undoStackSize === 'number') {
    return journal.undoStackSize;
  }
  return journal.canUndo ? 1 : 0;
}

export type JournalPlatform = {
  gridId: string;
  getModuleState?: <T>(moduleId: string) => T;
  store?: { getModuleState: <T>(moduleId: string) => T };
};

function resolveMaxEntries(platform: JournalPlatform, limit?: number): number {
  if (limit != null) return limit;
  const getState = platform.getModuleState ?? platform.store?.getModuleState.bind(platform.store);
  if (!getState) return 50;
  try {
    const hist = getState<DataChangeHistoryState>(DATA_CHANGE_HISTORY_MODULE_ID);
    return hist?.settings?.maxEntries ?? 50;
  } catch {
    return 50;
  }
}

export function getEditJournal(
  platform: JournalPlatform,
  options?: { limit?: number },
): EditJournal {
  const existing = journalsByGridId.get(platform.gridId);
  if (existing && !journalHasMonitorUndoApi(existing)) {
    journalsByGridId.delete(platform.gridId);
  }

  let journal = journalsByGridId.get(platform.gridId);
  if (!journal) {
    journal = new EditJournal({ limit: resolveMaxEntries(platform, options?.limit) });
    journalsByGridId.set(platform.gridId, journal);
  }
  return journal;
}

export function resetEditJournal(platform: { gridId: string }): void {
  journalsByGridId.get(platform.gridId)?.reset();
}

export function clearEditJournalRegistry(): void {
  journalsByGridId.clear();
}
