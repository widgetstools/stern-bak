import type { CellPatch, DataChangeHistoryState, TransformContext } from '@wellsfargo-starui/core';
import { isJournalApplyInProgress } from '../../../editing/journalApplyGuard.js';
import { resolveEditRecording } from '../../../editing/recordEdit.js';

export interface CellEditorPatchInput {
  data: Record<string, unknown> | undefined;
  field: string;
  colId: string;
  oldValue: unknown;
  newValue: unknown;
  rowId?: string | null;
}

function resolveRowId(
  ctx: TransformContext,
  data: Record<string, unknown> | undefined,
): string | null {
  if (!data) return null;
  try {
    return ctx.getRowId({
      data,
      level: 0,
      api: ctx.api!,
      context: undefined,
      rowPinned: null,
    });
  } catch {
    const direct = data.id;
    return direct != null && direct !== '' ? String(direct) : null;
  }
}

export function recordCellEditorPatch(
  state: DataChangeHistoryState,
  ctx: TransformContext,
  input: CellEditorPatchInput,
): void {
  if (isJournalApplyInProgress(ctx.gridId)) return;
  if (!state.settings.enabled) return;

  const { record, journal } = resolveEditRecording(
    { gridId: ctx.gridId, getModuleState: ctx.getModuleState },
    'cell-editor',
    true,
  );
  if (!record) return;

  const { field, colId, oldValue, newValue, data } = input;
  if (Object.is(oldValue, newValue)) return;

  const rowId = input.rowId ?? resolveRowId(ctx, data);
  if (!rowId) return;

  const patch: CellPatch = { rowId, field, colId, oldValue, newValue };

  journal.record({
    source: 'cell-editor',
    label: `Cell edit · ${field}`,
    patches: [patch],
  });
}
