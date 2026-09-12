/**
 * SSRM alert predicates — dataChange rules ride an engine membership watch
 * (plan §12 T5).
 *
 * Client alert evaluation only ever sees LOADED blocks: a row that crosses a
 * rule's threshold three pages below the viewport never fires. Here, every
 * enabled, un-column-scoped `dataChange` rule whose expression compiles under
 * the engine expression contract is registered as a predicate watch: the WASM
 * engine keeps the predicate's row set per revision and reports which keys
 * ENTER it (`viewDelta` ticks) — over ALL rows, loaded or not. Each entered
 * row is dispatched through the same debounce/rate-limit dispatcher as a
 * client hit.
 *
 * Rules the contract cannot express — diff refs (`oldValue`…), column-scoped
 * rules, `relativeChange` (it needs the previous value, which is a client
 * concept) — stay on the loaded-rows path; `engineWatched` tells the client
 * evaluator which rules to SKIP so a loaded row's transition cannot fire the
 * same rule twice.
 */
import type { GridApi } from 'ag-grid-community';
import {
  compileToEngineExpression,
  type AlertsState,
  type PlatformHandle,
} from '@wellsfargo-starui/core';
import type { SsrmExprNode } from '@wellsfargo-starui/data/runtime';
import { getSsrmSession } from '../../../../ssrm/ssrmSession.js';
import type { AlertDispatcher } from './dispatch';

/** Row key column the engine stamps on every materialized row. */
const ENGINE_KEY = '__key';

export function bindSsrmAlertPredicates(
  platform: PlatformHandle<AlertsState>,
  api: GridApi,
  dispatcher: AlertDispatcher,
  engineWatched: Set<string>,
): () => void {
  const provider = getSsrmSession(api)?.provider;
  if (!provider?.watchPredicate || !provider.unwatchPredicate || !provider.onSsrmTick) {
    return () => {};
  }
  const watch = provider.watchPredicate.bind(provider);
  const unwatch = provider.unwatchPredicate.bind(provider);
  const engine = platform.resources.expression();
  /** ruleId → the expression source its live engine watch was compiled from. */
  const registered = new Map<string, string>();

  const sync = (): void => {
    const rules = platform.getState().rules;
    const wanted = new Map<string, { source: string; expr: SsrmExprNode }>();
    for (const r of rules) {
      if (!r.enabled || r.trigger.kind !== 'dataChange' || r.trigger.column) continue;
      try {
        const { expr } = compileToEngineExpression(engine.parse(r.trigger.expression));
        if (expr) wanted.set(r.id, { source: r.trigger.expression, expr: expr as SsrmExprNode });
      } catch {
        /* does not parse — stays a client rule */
      }
    }
    // Drop watches whose rule is gone, disabled, or reworded.
    for (const [ruleId, source] of [...registered]) {
      if (wanted.get(ruleId)?.source === source) continue;
      registered.delete(ruleId);
      engineWatched.delete(ruleId);
      void unwatch(ruleId).catch(() => undefined);
    }
    // Register the new / changed ones. `engineWatched` flips BEFORE the RPC
    // resolves: from this rules pass on, the client path must not also fire
    // the rule; a failed registration flips it back to client evaluation.
    for (const [ruleId, w] of wanted) {
      if (registered.get(ruleId) === w.source) continue;
      registered.set(ruleId, w.source);
      engineWatched.add(ruleId);
      void watch({ ruleId, expr: w.expr }).catch(() => {
        registered.delete(ruleId);
        engineWatched.delete(ruleId);
      });
    }
  };

  const offTicks = provider.onSsrmTick((payload) => {
    if (payload.kind !== 'viewDelta' || !payload.ruleId) return;
    if (!registered.has(payload.ruleId)) return;
    const rule = platform.getState().rules.find((r) => r.id === payload.ruleId);
    if (!rule || !rule.enabled) return;
    const materialized = new Set<string>();
    for (const row of payload.rows ?? []) {
      const rowId = String(row[ENGINE_KEY] ?? '');
      if (!rowId) continue;
      materialized.add(rowId);
      dispatcher.dispatch(rule, {
        ruleId: rule.id,
        rowId,
        column: rule.trigger.kind === 'dataChange' ? rule.trigger.column ?? null : null,
        value: null,
        prevValue: null,
      });
    }
    // A burst beyond the engine's row cap still names every key.
    for (const key of payload.entered ?? []) {
      if (materialized.has(key)) continue;
      dispatcher.dispatch(rule, { ruleId: rule.id, rowId: key, column: null, value: null, prevValue: null });
    }
  });

  sync();
  const offRules = platform.subscribe(() => sync());

  return () => {
    offTicks();
    offRules();
    for (const ruleId of registered.keys()) void unwatch(ruleId).catch(() => undefined);
    registered.clear();
    engineWatched.clear();
  };
}
