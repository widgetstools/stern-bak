import type { CellValueChangedEvent, GridApi } from 'ag-grid-community';
import type { PlatformHandle } from '@wellsfargo-starui/engine';
import {
  DATA_CHANGE_HISTORY_MODULE_ID,
  type DataChangeHistoryState,
} from '@wellsfargo-starui/engine';
import { isJournalApplyInProgress } from '../../../editing/journalApplyGuard.js';
import { getEditJournal } from '../../../editing/editJournalScope.js';
import { isUserCellEditorChange } from './isUserCellEditorChange.js';
import { recordCellEditorPatch } from './recordCellEditorPatch.js';

function resolveRowId(
  api: GridApi,
  data: Record<string, unknown> | undefined,
  rowIdField = 'id',
): string | null {
  if (!data) return null;
  const direct = data[rowIdField];
  if (direct != null && direct !== '') return String(direct);
  try {
    const node = api.getRowNode(String(data.id ?? ''));
    if (node?.id) return node.id;
  } catch { /* ignore */ }
  return data.id != null ? String(data.id) : null;
}

function syncJournalSuspend(platform: PlatformHandle<DataChangeHistoryState>): void {
  const journal = getEditJournal(platform);
  if (platform.getState().settings.suspended) journal.suspend();
  else journal.resume();
}

export function recordCellEditorChange(
  platform: PlatformHandle<DataChangeHistoryState>,
  api: GridApi,
  event: CellValueChangedEvent,
): void {
  if (isJournalApplyInProgress(platform.gridId)) return;

  const state = platform.getState();
  if (!state.settings.enabled) return;
  if (!isUserCellEditorChange(event)) return;

  const field = event.colDef.field ?? event.column?.getColId();
  const colId = event.column?.getColId() ?? field;
  if (!field || !colId) return;

  recordCellEditorPatch(state, {
    gridId: platform.gridId,
    getModuleState: platform.getModuleState.bind(platform),
    getRowId: () => '',
    resources: platform.resources,
    api,
  }, {
    data: event.data as Record<string, unknown> | undefined,
    field,
    colId,
    oldValue: event.oldValue,
    newValue: event.newValue,
    rowId: resolveRowId(api, event.data as Record<string, unknown> | undefined),
  });
}

export function activateDataChangeHistory(
  platform: PlatformHandle<DataChangeHistoryState>,
): () => void {
  syncJournalSuspend(platform);

  const offState = platform.subscribe((_state, prev) => {
    if (_state.settings.suspended !== prev.settings.suspended) {
      syncJournalSuspend(platform);
    }
  });

  let detachCell: (() => void) | null = null;
  const readyOff = platform.api.onReady((api) => {
    syncJournalSuspend(platform);

    const onCellValueChanged = (event: CellValueChangedEvent) => {
      recordCellEditorChange(platform, api, event);
    };

    api.addEventListener('cellValueChanged', onCellValueChanged);
    detachCell = () => {
      try {
        api.removeEventListener('cellValueChanged', onCellValueChanged);
      } catch { /* api teardown */ }
    };
  });

  return () => {
    readyOff();
    detachCell?.();
    offState();
  };
}

export { DATA_CHANGE_HISTORY_MODULE_ID };
