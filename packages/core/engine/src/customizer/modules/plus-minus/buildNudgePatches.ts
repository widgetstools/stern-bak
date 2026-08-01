import type { ExpressionEngineLike } from '../../../platform/types.js';
import { buildPatchesFromTargets } from '../editing-core/buildPatches.js';
import type { CellPatch } from '../editing-core/types.js';
import { applyNumericOp } from '../smart-edit/operations.js';
import type { TargetCell } from '../smart-edit/collectTargetCells.js';
import { resolveNudgeForCell } from './resolveNudgeForCell.js';
import type { PlusMinusNudge } from './state.js';

export type NudgeDirection = 'increment' | 'decrement';

export interface BuildNudgePatchesOptions {
  cells: readonly TargetCell[];
  direction: NudgeDirection;
  nudges: readonly PlusMinusNudge[];
  engine: ExpressionEngineLike;
  getRowData: (rowId: string) => Record<string, unknown> | undefined;
}

function stepForDirection(nudge: PlusMinusNudge, direction: NudgeDirection): number {
  return direction === 'increment'
    ? nudge.incrementStep
    : (nudge.decrementStep ?? nudge.incrementStep);
}

/** Build cell patches for +/- keyboard nudge — skips cells with no matching rule. */
export function buildNudgePatches(options: BuildNudgePatchesOptions): CellPatch[] {
  const { cells, direction, nudges, engine, getRowData } = options;
  const op = direction === 'increment' ? 'add' : 'subtract';

  return buildPatchesFromTargets(cells, (cell) => {
    const rowData = getRowData(cell.rowId);
    if (!rowData) return null;
    const nudge = resolveNudgeForCell(cell, rowData, nudges, engine);
    if (!nudge) return null;
    const step = stepForDirection(nudge, direction);
    return applyNumericOp(cell.value, op, step);
  });
}
