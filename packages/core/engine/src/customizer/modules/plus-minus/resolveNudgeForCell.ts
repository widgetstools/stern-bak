import type { ExpressionEngineLike } from '../../../platform/types.js';
import type { PlusMinusNudge } from './state.js';

export interface NudgeCellContext {
  rowId: string;
  colId: string;
  field: string;
  value: unknown;
}

function columnInScope(nudge: PlusMinusNudge, colId: string, field: string): boolean {
  const ids = nudge.scope.columnIds;
  if (ids.length === 0) return true;
  return ids.includes(colId) || ids.includes(field);
}

function expressionAllows(
  nudge: PlusMinusNudge,
  rowData: Record<string, unknown>,
  cell: NudgeCellContext,
  engine: ExpressionEngineLike,
): boolean {
  const expr = nudge.expression?.trim();
  if (!expr) return true;
  try {
    const result = engine.parseAndEvaluate(expr, {
      data: rowData,
      x: cell.value,
      value: cell.value,
    });
    return !!result;
  } catch {
    return false;
  }
}

/** First matching enabled nudge wins (profile order). */
export function resolveNudgeForCell(
  cell: NudgeCellContext,
  rowData: Record<string, unknown>,
  nudges: readonly PlusMinusNudge[],
  engine: ExpressionEngineLike,
): PlusMinusNudge | null {
  for (const nudge of nudges) {
    if (!nudge.enabled) continue;
    if (!columnInScope(nudge, cell.colId, cell.field)) continue;
    if (!expressionAllows(nudge, rowData, cell, engine)) continue;
    return nudge;
  }
  return null;
}
