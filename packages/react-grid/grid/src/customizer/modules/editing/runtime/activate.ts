import type { GridApi } from 'ag-grid-community';
import type { EditingState, PlatformHandle } from '@wellsfargo-starui/core';
import { resolveEditRecording } from '../../../editing/recordEdit.js';
import { applyEdits, resolveTargetCells } from '../../smart-edit/runtime/applyEdits.js';
import { applyPlusMinusNudge, type NudgeDirection } from '../../plus-minus/runtime/applyPlusMinusNudge.js';
import { applyShortcutEdit } from '../../shortcuts/runtime/applyShortcutEdit.js';

function isEditingCell(api: GridApi): boolean {
  try {
    return (api.getEditingCells?.() ?? []).length > 0;
  } catch {
    return false;
  }
}

function directionFromKey(key: string): NudgeDirection | null {
  if (key === '+' || key === '=') return 'increment';
  if (key === '-') return 'decrement';
  return null;
}

function isShortcutKey(key: string): boolean {
  return key.length === 1 && /^[a-zA-Z]$/.test(key);
}

/**
 * One keyboard runtime for the merged editing module. Replaces the three
 * pre-merge listeners (smart-edit, plus-minus, shortcuts) with a single
 * `cellKeyDown` handler; `+`/`-` arbitration is now an explicit branch
 * instead of smart-edit cross-reading plus-minus state:
 * plus-minus owns the keys whenever it is enabled, smart-edit's global
 * increment step handles them otherwise.
 */
export function activateEditing(platform: PlatformHandle<EditingState>): () => void {
  let detachKey: (() => void) | null = null;
  const engine = platform.resources.expression();

  const readyOff = platform.api.onReady((api) => {
    const onCellKeyDown = async (e: { event?: Event | null }) => {
      const ke = e.event as KeyboardEvent | undefined;
      if (!ke) return;
      const state = platform.getState();

      const direction = directionFromKey(ke.key);
      if (direction) {
        if (state.plusMinus.settings.enabled) {
          if (isEditingCell(api)) return;
          const cells = resolveTargetCells(api);
          if (cells.length === 0) return;
          ke.preventDefault();
          ke.stopPropagation();
          const { record, journal } = resolveEditRecording(
            platform,
            'plus-minus',
            state.plusMinus.settings.recordHistory,
          );
          await applyPlusMinusNudge(
            api,
            { cells, direction, nudges: state.plusMinus.nudges, engine },
            { journal: record ? journal : null, journalApplyGridId: platform.gridId },
          );
          return;
        }
        if (state.smartEdit.settings.enabled) {
          if (isEditingCell(api)) return;
          ke.preventDefault();
          const cells = resolveTargetCells(api);
          if (cells.length === 0) return;
          const { record, journal } = resolveEditRecording(
            platform,
            'smart-edit',
            state.smartEdit.settings.recordHistory,
          );
          await applyEdits(api, cells, direction === 'decrement' ? 'subtract' : 'add', state.smartEdit.settings.incrementStep, {
            journal: record ? journal : null,
            journalApplyGridId: platform.gridId,
          });
        }
        return;
      }

      if (isShortcutKey(ke.key) && state.shortcuts.settings.enabled) {
        if (isEditingCell(api)) return;
        const cells = resolveTargetCells(api);
        if (cells.length === 0) return;
        ke.preventDefault();
        ke.stopPropagation();
        const { record, journal } = resolveEditRecording(
          platform,
          'shortcut',
          state.shortcuts.settings.recordHistory,
        );
        await applyShortcutEdit(
          api,
          { cells, key: ke.key, shortcuts: state.shortcuts.shortcuts },
          { journal: record ? journal : null, journalApplyGridId: platform.gridId },
        );
      }
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
