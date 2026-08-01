import type { GridApi } from 'ag-grid-community';
import {
  applyForwardPatches,
  applyNumericOp,
  buildPatchesFromTargets,
  collectFocusedCell,
  collectTargetCells,
  type CellPatch,
  type EditJournal,
  type SmartEditOp,
  type TargetCell,
} from '@wellsfargo-starui/core';
import { withJournalApplyGuard } from '../../../editing/journalApplyGuard.js';

export function resolveTargetCells(api: GridApi, rowIdField = 'id'): TargetCell[] {
  const getRowId = (data: Record<string, unknown>) => String(data[rowIdField] ?? data.id ?? '');
  const fromRange = collectTargetCells(api as never, getRowId);
  if (fromRange.length > 0) return fromRange;
  return collectFocusedCell(api as never, getRowId);
}

export function buildSmartEditPatches(
  cells: TargetCell[],
  op: SmartEditOp,
  operand: number,
): CellPatch[] {
  return buildPatchesFromTargets(cells, (cell) => applyNumericOp(cell.value, op, operand));
}

export interface ApplyEditsOptions {
  rowIdField?: string;
  journal?: EditJournal | null;
  journalLabel?: string;
  /** When set, apply this patch list instead of computing from cells/op/operand. */
  patches?: readonly CellPatch[];
  /** Grid id — wraps patch apply so cellValueChanged does not re-record. */
  journalApplyGridId?: string;
}

export async function applyEdits(
  api: GridApi,
  cells: TargetCell[],
  op: SmartEditOp,
  operand: number,
  options: ApplyEditsOptions = {},
): Promise<number> {
  const rowIdField = options.rowIdField ?? 'id';
  const patches = options.patches ?? buildSmartEditPatches(cells, op, operand);
  if (patches.length === 0) return 0;

  const applyPatches = () => applyForwardPatches(api as never, patches, rowIdField);
  if (options.journalApplyGridId) {
    await withJournalApplyGuard(options.journalApplyGridId, applyPatches);
  } else {
    await applyPatches();
  }

  if (options.journal) {
    options.journal.record({
      source: 'smart-edit',
      label: options.journalLabel ?? `${op} (${operand}) · ${patches.length} cell${patches.length === 1 ? '' : 's'}`,
      patches,
    });
  }

  return patches.length;
}
