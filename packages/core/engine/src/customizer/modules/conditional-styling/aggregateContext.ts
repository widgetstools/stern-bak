/**
 * Book-wide aggregates for conditional-styling predicates.
 *
 * A rule like `[px] > AVG([px])` parses fine, but the styling contexts used
 * to carry only `{value, data, columns}` — no `allRows`, no
 * `resolveAggregate` — so `AVG([px])` silently degraded to the row's own
 * value and the rule matched nothing. This attaches the SAME aggregate
 * resolution the calculated columns use:
 *
 *   - SSRM: `resolveAggregate` reads the engine total for the current filter
 *     via the {@link lookupSsrmExprAggregate} session the surface attaches —
 *     the threshold is the BOOK-wide value, never a loaded-blocks statistic.
 *     (`tryResolvedAggregate` wins before `allRows` is ever touched.)
 *   - CSRM: a lazy `allRows` snapshot over the grid's rows, with the
 *     same-generation column-array memo so the first aggregate cell maps the
 *     column once and every other cell reuses it.
 *
 * The snapshot cache here is the styling module's OWN (the calculated-columns
 * module invalidates its cache on its own schedule); the styling runtime
 * invalidates this one on every row flush / cell edit via
 * {@link invalidateStylingAggregates}.
 *
 * Attachment is gated per rule by {@link ruleUsesAggregates} — row-local
 * rules never pay for any of this.
 */
import type { GridApi } from 'ag-grid-community';
import type { EvaluationContext } from '../../../expression/types';
import type { ExpressionEngineLike } from '../../../platform/types';
import { astUsesAggregateFunctions } from '../../../expression/usesAggregates';
import { lookupSsrmExprAggregate } from '../../../expression/ssrmAggregateLookup';
import {
  getAllRowsColumnCache,
  getAllRowsSnapshot,
  invalidateAllRowsCache,
  type AllRowsEntry,
} from '../calculated-columns/virtualColumn';

/** Per-grid allRows snapshot for aggregate-bearing styling rules (CSRM path). */
const STYLING_ALL_ROWS = new WeakMap<GridApi, AllRowsEntry>();

/** Does this rule's expression call an aggregate function anywhere? */
export function ruleUsesAggregates(engine: ExpressionEngineLike, expression: string): boolean {
  try {
    return astUsesAggregateFunctions(engine.parse(expression));
  } catch {
    return false;
  }
}

/**
 * Attach the aggregate-resolution fields to one predicate call's context.
 * All three are lazy getters, so a rule whose aggregate branch does not run
 * this call pays nothing.
 */
export function attachAggregateContext(
  ctx: EvaluationContext,
  api: unknown,
): EvaluationContext {
  const gridApi = api as GridApi | null | undefined;
  Object.defineProperties(ctx, {
    allRows: {
      configurable: true,
      enumerable: true,
      get: () => getAllRowsSnapshot(gridApi, STYLING_ALL_ROWS),
    },
    allRowsColumnCache: {
      configurable: true,
      enumerable: true,
      get: () => {
        // Ensure the snapshot (and thus generation) is current before
        // handing out its memo — same rule as the calculated columns.
        getAllRowsSnapshot(gridApi, STYLING_ALL_ROWS);
        return getAllRowsColumnCache(gridApi, STYLING_ALL_ROWS);
      },
    },
    resolveAggregate: {
      configurable: true,
      enumerable: true,
      get: () => lookupSsrmExprAggregate(gridApi),
    },
  });
  return ctx;
}

/**
 * Drop the CSRM snapshot for one grid — the styling runtime calls this on
 * every row flush and cell edit so an aggregate threshold can never read
 * yesterday's book. Cheap when no aggregate rule ever built a snapshot.
 */
export function invalidateStylingAggregates(api: unknown): void {
  invalidateAllRowsCache(api as GridApi | null | undefined, STYLING_ALL_ROWS);
}
