import type { GridApi } from 'ag-grid-community';
import type { PlatformHandle } from '@wellsfargo-starui/engine';
import {
  PLUS_MINUS_MODULE_ID,
  type PlusMinusState,
} from '@wellsfargo-starui/engine';
import { resolveEditRecording } from '../../../editing/recordEdit.js';
import { resolveTargetCells } from '../../smart-edit/runtime/applyEdits.js';
import { applyPlusMinusNudge, type NudgeDirection } from './applyPlusMinusNudge.js';

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

export function activatePlusMinus(platform: PlatformHandle<PlusMinusState>): () => void {
  let detachKey: (() => void) | null = null;
  const engine = platform.resources.expression();

  const readyOff = platform.api.onReady((api) => {
    const onCellKeyDown = async (e: { event?: Event | null }) => {
      const state = platform.getState();
      if (!state.settings.enabled) return;

      const ke = e.event as KeyboardEvent | undefined;
      if (!ke) return;
      const direction = directionFromKey(ke.key);
      if (!direction) return;
      if (isEditingCell(api)) return;

      const cells = resolveTargetCells(api);
      if (cells.length === 0) return;

      ke.preventDefault();
      ke.stopPropagation();

      const { record, journal } = resolveEditRecording(
        platform,
        'plus-minus',
        state.settings.recordHistory,
      );

      await applyPlusMinusNudge(
        api,
        {
          cells,
          direction,
          nudges: state.nudges,
          engine,
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

export { PLUS_MINUS_MODULE_ID };
