import type {
  CellPatch,
  DataChangeHistoryState,
  EditJournal,
  TransformContext,
} from '@wellsfargo-starui/core';
import { submitAppliedEdits } from '../../../editing/editWriteBack.js';
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

/**
 * Journal the edit, or answer `null` when this grid is not recording — which
 * is a question only the history module gets a vote on.
 */
function journalCellEdit(
  state: DataChangeHistoryState,
  ctx: TransformContext,
  patch: CellPatch,
): { journal: EditJournal; entryId: string } | null {
  if (!state.settings.enabled) return null;

  const { record, journal } = resolveEditRecording(
    { gridId: ctx.gridId, getModuleState: ctx.getModuleState },
    'cell-editor',
    true,
  );
  if (!record) return null;

  const entry = journal.record({
    source: 'cell-editor',
    label: `Cell edit · ${patch.field}`,
    patches: [patch],
  });
  return entry ? { journal, entryId: entry.id } : null;
}

/**
 * The inline cell editor's funnel — AG Grid has already written the value, so
 * unlike the other four this one records rather than applies.
 *
 * Journaling and write-back are decided separately and deliberately. Turning
 * DATA CHANGE HISTORY off means the user does not want an undo timeline; it
 * cannot mean their edits stop reaching the server, so the submission below
 * sits outside that gate. The guards above it are the ones that decide
 * whether an edit happened at all.
 */
export function recordCellEditorPatch(
  state: DataChangeHistoryState,
  ctx: TransformContext,
  input: CellEditorPatchInput,
): void {
  // Our own writes — a journal undo/redo, or a write-back revert — come back
  // through the value setters and are not new edits.
  if (isJournalApplyInProgress(ctx.gridId)) return;

  const { field, colId, oldValue, newValue, data } = input;
  if (Object.is(oldValue, newValue)) return;

  const rowId = input.rowId ?? resolveRowId(ctx, data);
  if (!rowId) return;

  const patch: CellPatch = { rowId, field, colId, oldValue, newValue };
  const recorded = journalCellEdit(state, ctx, patch);

  submitAppliedEdits({
    gridId: ctx.gridId,
    source: 'cell-editor',
    patches: [patch],
    journal: recorded?.journal,
    entryId: recorded?.entryId,
  });
}
