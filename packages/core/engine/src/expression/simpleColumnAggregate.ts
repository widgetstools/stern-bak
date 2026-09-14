/**
 * Detect `SUM([col])` / AVG / MIN / MAX / COUNT — the only custom
 * grouping expressions the SSRM engine can honour as a named `aggFunc`.
 * Anything richer stays a client `IAggFunc` (loaded children only).
 */
import type { ExpressionNode } from './types';

export type SimpleAggFn = 'sum' | 'avg' | 'min' | 'max' | 'count';

const CALL_TO_AGG: Record<string, SimpleAggFn> = {
  SUM: 'sum',
  AVG: 'avg',
  MIN: 'min',
  MAX: 'max',
  COUNT: 'count',
};

export interface SimpleColumnAggregate {
  fn: SimpleAggFn;
  columnId: string;
}

export function simpleColumnAggregate(node: unknown): SimpleColumnAggregate | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const n = node as ExpressionNode;
  if (n.type !== 'call' || n.args.length !== 1 || n.args[0].type !== 'columnRef') {
    return undefined;
  }
  const fn = CALL_TO_AGG[n.name.toUpperCase()];
  if (!fn) return undefined;
  return { fn, columnId: n.args[0].columnId };
}

/**
 * True when the expression reduces this column's own values
 * (`SUM([value])` in a custom agg, or `SUM([colId])`).
 */
export function simpleAggFuncForColumn(
  node: unknown,
  columnId: string | undefined,
): SimpleAggFn | undefined {
  const parsed = simpleColumnAggregate(node);
  if (!parsed) return undefined;
  if (parsed.columnId === 'value') return parsed.fn;
  if (columnId && parsed.columnId === columnId) return parsed.fn;
  return undefined;
}
