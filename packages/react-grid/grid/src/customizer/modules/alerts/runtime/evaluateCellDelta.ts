/**
 * Shared evaluation for one (row, column) delta — used by both
 * `cellValueChanged` (user edits / API setValue) and the `modelUpdated`
 * diff pass (host `rowData` stream updates).
 */

import type { ExpressionEngineLike, ExpressionNode } from '@wellsfargo-starui/engine';
import {
  computeRelativeChange,
  evaluateDataChangeRule,
  extractTriggerColumns,
  type AlertHit,
  type AlertRule,
  type DataChangeRule,
  type RelativeChangeRule,
} from '@wellsfargo-starui/engine';
import type { AlertDispatcher } from './dispatch';
import type { PreviousValuesStore } from './previousValues';

export function partitionEnabledRules(rules: ReadonlyArray<AlertRule>): {
  dataChange: DataChangeRule[];
  relativeChange: RelativeChangeRule[];
} {
  const dataChange: DataChangeRule[] = [];
  const relativeChange: RelativeChangeRule[] = [];
  for (const r of rules) {
    if (!r.enabled) continue;
    if (r.trigger.kind === 'dataChange') {
      dataChange.push(r as DataChangeRule);
    } else if (r.trigger.kind === 'relativeChange') {
      relativeChange.push(r as RelativeChangeRule);
    }
  }
  return { dataChange, relativeChange };
}

export interface EvaluateCellDeltaArgs {
  rowId: string;
  colId: string;
  prev: unknown;
  next: unknown;
  data: Record<string, unknown>;
  /**
   * Pre-partitioned enabled rules — callers hoist `partitionEnabledRules`
   * once per pass. The old shape re-partitioned (two array allocations +
   * a rules walk) inside EVERY cell delta, which on a streaming flush
   * meant per-changed-cell churn for a result that never varies within
   * the pass.
   */
  dataChange: ReadonlyArray<DataChangeRule>;
  relativeChange: ReadonlyArray<RelativeChangeRule>;
  engine: ExpressionEngineLike;
  dispatcher: AlertDispatcher;
  prevValues: PreviousValuesStore;
}

/** Evaluate dataChange + relativeChange for one cell delta; updates baseline. */
export function evaluateCellDelta(args: EvaluateCellDeltaArgs): void {
  const { rowId, colId, prev, next, data, dataChange, relativeChange, engine, dispatcher, prevValues } = args;

  for (const rule of dataChange) {
    const hit = evaluateDataChangeRule(
      rule,
      { rowId, data, changedColumn: colId, value: next },
      engine,
    );
    if (hit) dispatcher.dispatch(rule, hit);
  }

  for (const rule of relativeChange) {
    if (rule.trigger.column !== colId) continue;
    const hit = computeRelativeChange(rule, rowId, prev, next);
    if (hit) dispatcher.dispatch(rule, hit);
  }

  prevValues.set(rowId, colId, next);
}

/**
 * The set of column ids whose changes can affect some enabled alert rule.
 *
 * The old shape seeded this with EVERY grid column unconditionally, so on
 * a 52-column blotter `scanNode` did 52 `getValueByPath` reads + baseline
 * map ops per delivered row per flush even when one rule watched one
 * column. Now:
 *   - relativeChange rules contribute their trigger column;
 *   - column-scoped dataChange rules contribute their scope column;
 *   - column-LESS dataChange rules contribute the columns their
 *     expression actually references (same `extractTriggerColumns`
 *     dependency walk conditional-styling repaints use) — falling back
 *     to all grid columns only when the expression has no extractable
 *     column references (bare-variable-only or unparseable), where the
 *     dependency set is unknowable.
 *
 * `stable: true` means the set was derived purely from the rules (no
 * all-columns fallback), so callers may memoize it by the rules-array
 * reference; an unstable set depends on the live column list and must be
 * recomputed per pass.
 */
export function collectWatchedColIds(
  api: { getColumns?: () => Array<{ getColId: () => string }> | null },
  rules: ReadonlyArray<AlertRule>,
  engine: ExpressionEngineLike,
): { ids: Set<string>; stable: boolean } {
  const ids = new Set<string>();
  let watchAllColumns = false;
  for (const r of rules) {
    if (!r.enabled) continue;
    if (r.trigger.kind === 'relativeChange') {
      ids.add(r.trigger.column);
      continue;
    }
    if (r.trigger.kind !== 'dataChange') continue;
    if (r.trigger.column) {
      ids.add(r.trigger.column);
      continue;
    }
    let refs: Set<string> | null = null;
    try {
      refs = extractTriggerColumns(engine.parse(r.trigger.expression) as ExpressionNode);
    } catch {
      refs = null;
    }
    if (refs && refs.size > 0) for (const c of refs) ids.add(c);
    else watchAllColumns = true;
  }
  if (watchAllColumns) {
    try {
      const cols = api.getColumns?.();
      if (cols) {
        for (const c of cols) ids.add(c.getColId());
      }
    } catch {
      /* grid mid-teardown */
    }
  }
  return { ids, stable: !watchAllColumns };
}
