import type { GridApi } from 'ag-grid-community';
import type { PlatformHandle } from '@wellsfargo-starui/engine';
import {
  SHORTCUTS_MODULE_ID,
  type ShortcutsState,
} from '@wellsfargo-starui/engine';
import { resolveEditRecording } from '../../../editing/recordEdit.js';
import { resolveTargetCells } from '../../smart-edit/runtime/applyEdits.js';
import { applyShortcutEdit } from './applyShortcutEdit.js';

function isEditingCell(api: GridApi): boolean {
  try {
    return (api.getEditingCells?.() ?? []).length > 0;
  } catch {
    return false;
  }
}

function isShortcutKey(key: string): boolean {
  return key.length === 1 && /^[a-zA-Z]$/.test(key);
}

export function activateShortcuts(platform: PlatformHandle<ShortcutsState>): () => void {
  let detachKey: (() => void) | null = null;

  const readyOff = platform.api.onReady((api) => {
    const onCellKeyDown = async (e: { event?: Event | null }) => {
      const state = platform.getState();
      if (!state.settings.enabled) return;

      const ke = e.event as KeyboardEvent | undefined;
      if (!ke) return;
      if (!isShortcutKey(ke.key)) return;
      if (isEditingCell(api)) return;

      const cells = resolveTargetCells(api);
      if (cells.length === 0) return;

      ke.preventDefault();
      ke.stopPropagation();

      const { record, journal } = resolveEditRecording(
        platform,
        'shortcut',
        state.settings.recordHistory,
      );

      await applyShortcutEdit(
        api,
        {
          cells,
          key: ke.key,
          shortcuts: state.shortcuts,
        },
        {
          journal: record ? journal : null,
          journalApplyGridId: platform.gridId,
        },
      );
    };

    api.addEventListener('cellKeyDown', onCellKeyDown);
    detachKey = () => {
      try {
        api.removeEventListener('cellKeyDown', onCellKeyDown);
      } catch { /* api teardown */ }
    };
  });

  return () => {
    readyOff();
    detachKey?.();
  };
}

export { SHORTCUTS_MODULE_ID };
