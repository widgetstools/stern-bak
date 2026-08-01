import type { GridPlatform, PlatformHandle } from '@wellsfargo-starui/core';
import {
  DATA_CHANGE_HISTORY_MODULE_ID,
  recordSourceKey,
  type DataChangeHistoryState,
  type EditJournal,
  type EditSource,
} from '@wellsfargo-starui/core';
import { getEditJournal, type JournalPlatform } from './editJournalScope.js';

function readHistoryState(platform: JournalPlatform): DataChangeHistoryState | null {
  const getState =
    platform.getModuleState ?? platform.store?.getModuleState.bind(platform.store);
  if (!getState) return null;
  try {
    return getState<DataChangeHistoryState>(DATA_CHANGE_HISTORY_MODULE_ID);
  } catch {
    return null;
  }
}

function asJournalPlatform(
  platform: GridPlatform | PlatformHandle<unknown> | JournalPlatform,
): JournalPlatform {
  if ('store' in platform && platform.store) {
    return { gridId: platform.gridId, store: platform.store };
  }
  if ('getModuleState' in platform && typeof platform.getModuleState === 'function') {
    return { gridId: platform.gridId, getModuleState: platform.getModuleState.bind(platform) };
  }
  return platform as JournalPlatform;
}

export interface EditRecordingResult {
  record: boolean;
  journal: EditJournal;
}

/**
 * Resolve whether an edit should be journaled and return the shared journal.
 * When data-change-history is disabled, defers to the caller's module-local flag.
 */
export function resolveEditRecording(
  platform: GridPlatform | PlatformHandle<unknown> | JournalPlatform,
  source: EditSource,
  moduleWantsRecord: boolean,
): EditRecordingResult {
  const journalPlatform = asJournalPlatform(platform);
  const journal = getEditJournal(journalPlatform);
  if (!moduleWantsRecord) {
    return { record: false, journal };
  }

  const hist = readHistoryState(journalPlatform);
  if (!hist?.settings.enabled) {
    return { record: true, journal };
  }

  if (hist.settings.suspended || journal.isSuspended) {
    return { record: false, journal };
  }

  const key = recordSourceKey(source);
  if (key && !hist.settings.recordSources[key]) {
    return { record: false, journal };
  }

  return { record: true, journal };
}

export function getDataChangeHistoryState(
  platform: JournalPlatform,
): DataChangeHistoryState | null {
  return readHistoryState(platform);
}
