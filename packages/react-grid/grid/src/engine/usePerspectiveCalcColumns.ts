/**
 * Calculated columns under Perspective, in three tiers.
 *
 * A calculated column served by a client `valueGetter` is a SILENT
 * CORRECTNESS GAP on this path, not just a slow one. This window holds the
 * blocks in its viewport, so a getter running here can produce a value for a
 * visible cell and nothing else: sorting by that column sorts the book by a
 * value the book does not have, filtering on it filters nothing, grouping on
 * it groups on undefined, and an aggregate over it aggregates zero rows. The
 * grid shows a number and every operation over it is wrong.
 *
 * So the tiers, best first:
 *
 *   1. **Compile to Perspective.** The expression becomes a Table expression
 *      column, computed in the worker over the whole book. Sort, filter,
 *      group and aggregate then all work on it exactly as they do on a real
 *      column, because to the engine it IS one.
 *   2. **Materialize on read.** The expression does not compile — it uses a
 *      function Perspective has no equivalent for — but it is row-local, so
 *      the value can still be written into each row as it arrives. The cell
 *      renders correctly. Sorting and filtering on it do NOT work, and the
 *      column is marked so the UI can say so rather than imply otherwise.
 *   3. **Drop.** The expression needs cross-row context (`SUM(...)`,
 *      `AVG(...)`). Perspective's expression language is strictly row-local
 *      and has no cross-row aggregate at all, so there is no honest way to
 *      serve it here. Reported, not silently blank.
 *
 * Tier 3 is a real, deliberate gap and is flagged rather than worked around:
 * every alternative would compute the aggregate over the loaded blocks and
 * present it as an aggregate over the book.
 */

import { useMemo } from 'react';
import {
  ExpressionEngine,
  astUsesAggregateFunctions,
  tryCompileToPerspectiveExpression,
  type VirtualColumnDef,
} from '@wellsfargo-starui/core';

export type PerspectiveCalcColumnTier =
  /** Compiled to a Table expression column — fully server-side. */
  | 'compiled'
  /** Row-local but uncompilable — value only, no sort/filter/group. */
  | 'materialized'
  /** Cross-row aggregate — cannot be served on this path at all. */
  | 'unsupported';

export interface PerspectiveCalcColumn {
  colId: string;
  tier: PerspectiveCalcColumnTier;
  /** Perspective expression source. Present only for `'compiled'`. */
  expression?: string;
  /** Why it is not `'compiled'`. Present for the other two tiers. */
  reason?: string;
}

export interface PerspectiveCalcColumnPlan {
  columns: readonly PerspectiveCalcColumn[];
  /** `{ colId: expression }` for the engine's `setCalcExpressions`. */
  expressions: Record<string, string>;
  /** Columns whose values must be computed here, as they arrive. */
  materialized: readonly PerspectiveCalcColumn[];
  /** Columns that cannot be served — surface these, do not hide them. */
  unsupported: readonly PerspectiveCalcColumn[];
}

const EMPTY_PLAN: PerspectiveCalcColumnPlan = {
  columns: [],
  expressions: {},
  materialized: [],
  unsupported: [],
};

/**
 * Sort one column into its tier.
 *
 * Aggregates are checked BEFORE compiling so the reason names the structural
 * gap rather than reading like a missing mapping — `tryCompileToPerspectiveExpression`
 * refuses them too, but a caller shown "unsupported function SUM" would
 * reasonably file it as something to add.
 */
export function planCalcColumn(
  column: VirtualColumnDef,
  engine: ExpressionEngine,
): PerspectiveCalcColumn {
  const { colId, expression } = column;
  if (!expression?.trim()) {
    return { colId, tier: 'unsupported', reason: 'The column has no expression.' };
  }

  let node: unknown;
  try {
    node = engine.parse(expression);
  } catch (err) {
    return {
      colId,
      tier: 'unsupported',
      reason: err instanceof Error ? err.message : String(err),
    };
  }

  if (astUsesAggregateFunctions(node as never)) {
    return {
      colId,
      tier: 'unsupported',
      reason:
        'Cross-row aggregates cannot be served by the Perspective engine — its '
        + 'expression language is strictly row-local and has no cross-row aggregate.',
    };
  }

  const compiled = tryCompileToPerspectiveExpression(node as never);
  if (compiled.ok) return { colId, tier: 'compiled', expression: compiled.expression };

  // Row-local but untranslatable: the value is still computable HERE, so the
  // cell can be right even though sorting and filtering on it cannot be.
  return { colId, tier: 'materialized', reason: compiled.reason };
}

export function planCalcColumns(
  columns: readonly VirtualColumnDef[] | undefined,
  engine: ExpressionEngine,
): PerspectiveCalcColumnPlan {
  if (!columns?.length) return EMPTY_PLAN;

  const planned = columns.map((column) => planCalcColumn(column, engine));
  const expressions: Record<string, string> = {};
  for (const column of planned) {
    if (column.tier === 'compiled' && column.expression) {
      expressions[column.colId] = column.expression;
    }
  }

  return {
    columns: planned,
    expressions,
    materialized: planned.filter((c) => c.tier === 'materialized'),
    unsupported: planned.filter((c) => c.tier === 'unsupported'),
  };
}

/**
 * The plan for the current calculated columns.
 *
 * Memoized on the columns themselves: parsing and compiling on every render
 * would re-run the whole tokenizer per column per keystroke in the panel.
 */
export function usePerspectiveCalcColumns(
  columns: readonly VirtualColumnDef[] | undefined,
): PerspectiveCalcColumnPlan {
  // One engine for the hook's lifetime — it carries the AST cache the
  // compiler reads through, so rebuilding it per render would throw that away.
  const engine = useMemo(() => new ExpressionEngine(), []);
  return useMemo(() => planCalcColumns(columns, engine), [columns, engine]);
}
