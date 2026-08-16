/**
 * The numeric fold behind `GridDataPort.aggregate`, shared by both adapters.
 *
 * The client-side adapter always folds here — AG-Grid has no "aggregate this
 * column over every row" API. The server-side adapter normally lets the
 * worker fold (`getStatusBar`), and falls back to this only when a query
 * needs a predicate the RPC cannot carry.
 *
 * Semantics mirror the worker's `ssrm/aggregations.ts` deliberately, so the
 * two answers match. Core cannot import `@wellsfargo-starui/data` (data
 * depends on core), so `portContract.test.ts` is what keeps them in step.
 */
import type { DataAggFunc } from './types';

export interface ColumnFold {
  count: number;
  nonNull: number;
  sum: number;
  min: number;
  max: number;
}

export function beginFold(): ColumnFold {
  return { count: 0, nonNull: 0, sum: 0, min: Infinity, max: -Infinity };
}

export function foldValue(fold: ColumnFold, value: unknown): void {
  fold.count += 1;
  const n = toNumber(value);
  if (n === null) return;
  fold.nonNull += 1;
  fold.sum += n;
  if (n < fold.min) fold.min = n;
  if (n > fold.max) fold.max = n;
}

/**
 * `null` rather than `0` when nothing contributed a value: in a markets grid
 * a 0 price or 0 spread reads as data, not as "no values here". `count`
 * legitimately reaches 0 and `sum` keeps its additive identity.
 */
export function finishFold(fold: ColumnFold, fn: DataAggFunc): number | null {
  switch (fn) {
    case 'count': return fold.count;
    case 'min': return fold.nonNull ? fold.min : null;
    case 'max': return fold.nonNull ? fold.max : null;
    case 'avg': return fold.nonNull ? fold.sum / fold.nonNull : null;
    case 'sum': default: return fold.sum;
  }
}

/** Mirrors the worker's `toNum`: numeric strings count, blanks and NaN don't. */
function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
}
