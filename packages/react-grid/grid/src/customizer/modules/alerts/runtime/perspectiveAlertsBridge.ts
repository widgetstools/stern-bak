/**
 * Feed alerts from the worker instead of from this window's rows.
 *
 * The client-side path evaluates rules against `platform.rows` — the
 * rAF-coalesced delta of row nodes this window holds. Under Perspective it
 * holds the blocks in the viewport, so that delta describes a few hundred
 * rows and every alert on the rest of the book simply never fires. Silently:
 * the panel stays empty and looks like a quiet market.
 *
 * Each enabled rule opens ONE worker subscription instead, and the results
 * come back as `AlertHit`s produced by the SAME evaluators the client path
 * uses (`computeRelativeChange` / `evaluateDataChangeRule`, called worker-side
 * — see `perspectiveQueryEngine`). Nothing here re-implements a rule.
 *
 * **`RowChangeBus` is untouched and is not involved.** It is a client-side
 * delta bus and stays exactly as it was; Perspective alerts never route
 * through it, because they now have their own correct signal rather than
 * needing to impersonate one.
 */

import type { AlertHit, AlertRule } from '@wellsfargo-starui/core';
import type { PerspectiveChangeRuleQuery, PerspectiveRowSnapshot } from '@wellsfargo-starui/types';
import type { PerspectiveGridQueries } from '../../../../engine/types.js';

export interface PerspectiveAlertsBridgeOpts {
  queries: PerspectiveGridQueries;
  /** Current rules. Only the enabled ones open subscriptions. */
  rules: readonly AlertRule[];
  /** Where a hit goes — the same dispatcher the client path feeds. */
  dispatch(rule: AlertRule, hit: AlertHit): void;
  /**
   * Compile a `dataChange` rule's boolean expression to Perspective source.
   * Absent, or returning null, means the rule is skipped rather than served
   * from a client-side evaluation that would only see the viewport.
   */
  compileExpression?(source: string): string | null;
  /** Reported once per rule that cannot be served. */
  onUnsupported?(ruleId: string, reason: string): void;
}

/** Which worker query a rule maps onto, or why it maps onto none. */
export type AlertRuleQueryPlan =
  | { kind: 'changeRule'; ruleId: string; query: PerspectiveChangeRuleQuery }
  | { kind: 'matchSet'; ruleId: string; source: string }
  | { kind: 'unsupported'; ruleId: string; reason: string };

/**
 * Map one rule onto a worker query.
 *
 * `relativeChange` is a change rule by construction — it compares a value
 * against its predecessor, which is exactly what the feed's shadow map holds.
 *
 * `dataChange` is a boolean expression over a row that just changed, so it is
 * also a change rule; the expression rides along and the worker evaluates it
 * per changed row.
 *
 * `rowChange` (`ROW_ADDED` / `ROW_REMOVED`) is left to the client path
 * deliberately, not overlooked: a row entering or leaving the BOOK is not
 * something a filtered View reports, and answering it from block loads would
 * fire on scrolling.
 */
export function planAlertRuleQuery(rule: AlertRule): AlertRuleQueryPlan {
  const { trigger } = rule;

  if (trigger.kind === 'relativeChange') {
    return {
      kind: 'changeRule',
      ruleId: rule.id,
      query: {
        kind: 'changeRule',
        ruleId: rule.id,
        field: trigger.column,
        mode: 'relativeChange',
        changeMode: trigger.mode,
        ...(trigger.threshold !== undefined ? { threshold: trigger.threshold } : {}),
        ...(trigger.direction !== undefined ? { direction: trigger.direction } : {}),
      },
    };
  }

  if (trigger.kind === 'dataChange') {
    if (!trigger.column) {
      // The shadow map is scoped to named fields — that scoping is what keeps
      // it from doubling the worker's memory for the book. A rule with no
      // column would need every field shadowed.
      return {
        kind: 'unsupported',
        ruleId: rule.id,
        reason:
          'A dataChange rule needs a column scope on the Perspective engine: the '
          + 'worker shadows only the fields some rule names.',
      };
    }
    return {
      kind: 'changeRule',
      ruleId: rule.id,
      query: {
        kind: 'changeRule',
        ruleId: rule.id,
        field: trigger.column,
        mode: 'dataChange',
        expression: trigger.expression,
      },
    };
  }

  return {
    kind: 'unsupported',
    ruleId: rule.id,
    reason:
      'Row add/remove is not observable from a filtered View — answering it from '
      + 'block loads would fire on scrolling.',
  };
}

/**
 * Open one subscription per enabled rule. Returns a disposer that closes all
 * of them; call it and re-create on any rule-list change rather than
 * diffing — a rule edit is a user action, not a hot path.
 */
export function createPerspectiveAlertsBridge(opts: PerspectiveAlertsBridgeOpts): () => void {
  const { queries, rules, dispatch, onUnsupported } = opts;
  const releases: Array<() => void> = [];
  const byId = new Map(rules.map((rule) => [rule.id, rule]));

  for (const rule of rules) {
    if (!rule.enabled) continue;
    const plan = planAlertRuleQuery(rule);

    if (plan.kind === 'unsupported') {
      onUnsupported?.(plan.ruleId, plan.reason);
      continue;
    }

    if (plan.kind === 'changeRule') {
      releases.push(
        queries.watchChangeRule(plan.query, (hits) => {
          for (const hit of hits) {
            const target = byId.get(hit.ruleId);
            if (target) dispatch(target, hit);
          }
        }),
      );
      continue;
    }

    releases.push(
      queries.watchMatchSet(plan.source, (transition) => {
        if (!transition) return;
        for (const row of transition.newlyMatched) {
          dispatch(rule, toHit(rule.id, row));
        }
      }),
    );
  }

  return () => {
    for (const release of releases.splice(0)) {
      try {
        release();
      } catch {
        /* a release that already ran is not an error */
      }
    }
  };
}

function toHit(ruleId: string, row: PerspectiveRowSnapshot): AlertHit {
  return {
    ruleId,
    rowId: row.id,
    column: null,
    value: null,
    prevValue: null,
  };
}
