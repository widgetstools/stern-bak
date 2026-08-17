import type { GridApi } from 'ag-grid-community';
import {
  applyNumericOp,
  buildPatchesFromTargets,
  collectFocusedCell,
  collectTargetCells,
  type CellPatch,
  type EditApplyResult,
  type EditJournal,
  type EditPlatform,
  type SmartEditOp,
  type TargetCell,
} from '@wellsfargo-starui/core';
import { applyAndRecord, cellCountLabel } from '../../../editing/applyAndRecord.js';

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
  journal?: EditJournal | null;
  journalLabel?: string;
  /** When set, apply this patch list instead of computing from cells/op/operand. */
  patches?: readonly CellPatch[];
}

export async function applyEdits(
  platform: EditPlatform,
  cells: TargetCell[],
  op: SmartEditOp,
  operand: number,
  options: ApplyEditsOptions = {},
): Promise<EditApplyResult> {
  const patches = options.patches ?? buildSmartEditPatches(cells, op, operand);
  return applyAndRecord(platform, patches, options.journal, {
    source: 'smart-edit',
    label: (applied) =>
      options.journalLabel ?? `${op} (${operand}) · ${cellCountLabel(applied)}`,
  });
}
