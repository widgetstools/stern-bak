/**
 * Orchestrator for the conditional-styling runtime.
 *
 * Wires the four runtime subsystems (refresh schedulers, expiry timer,
 * trigger cache, header painter, timed activations) into a single
 * activate(platform) → dispose() function the Module shell calls.
 *
 * Dependency graph (← = depends on):
 *
 *   schedulers (refresh, targeted-refresh) ← no deps
 *   triggerCache ← platform
 *   headerPainter ← platform + diffCache
 *   expiry ← headerPainter.evaluate + schedulers.scheduleTargetedRefresh + schedulers.scheduleRefresh
 *   timedActivations ← triggerCache + diffCache + schedulers + expiry + headerPainter
 *
 * activate() owns:
 *   - the resource-cache lookup for the per-grid diff cache
 *   - registering AG-Grid api listeners (onReady, modelUpdated, filterChanged, cellValueChanged)
 *   - subscribing to platform state changes (rule edits)
 *   - the safely() cleanup wrapper that isolates teardown steps
 */

import type { Module, PlatformHandle } from '@wellsfargo-starui/core';
import {
  CONDITIONAL_DIFF_CACHE_KEY,
  CONDITIONAL_TIMED_RULE_CACHE_KEY,
  createTimedRuleStore,
} from '../transforms';
import type { TimedRuleStateByApi } from '../transforms';
import type { ConditionalStylingState } from '../state';
import { normalizeDuration } from './utils';
import {
  createExpiryScheduler,
  createRefreshScheduler,
  createTargetedRefreshScheduler,
} from './schedulers';
import { createTriggerCache } from './triggerCache';
import { createHeaderPainter, hasHeaderPaintRules } from './headerPainter';
import { createTimedActivations } from './timedActivations';

export function activateConditionalStyling(
  platform: PlatformHandle<ConditionalStylingState>,
): ReturnType<NonNullable<Module<ConditionalStylingState>['activate']>> {
  const disposers: Array<() => void> = [];
  const diffCacheByApi = platform.resources.cache<object, WeakMap<object, Map<string, { oldValue: unknown; newValue: unknown }>>>(
    CONDITIONAL_DIFF_CACHE_KEY,
  );
  // Per-grid timed-activation store. Registered under the GridApi in the
  // per-grid resource cache so the class-rule predicates (built in the
  // transformers with the same cache) read THIS grid's activations.
  // Previously this state was module-scoped — one map shared by every
  // grid in the renderer — so any grid's activate/teardown wiped every
  // other grid's timed activations, and one grid's liveness prune
  // (driven by its own filter) deleted rows still active elsewhere.
  const timedStore = createTimedRuleStore();
  const timedStateByApi = platform.resources.cache<object, typeof timedStore.byRowId>(
    CONDITIONAL_TIMED_RULE_CACHE_KEY,
  ) as TimedRuleStateByApi;

  // Subsystems.
  const refresh = createRefreshScheduler(platform);
  const targetedRefresh = createTargetedRefreshScheduler(platform);
  const triggers = createTriggerCache(platform);
  const headerPainter = createHeaderPainter(platform, diffCacheByApi);
  const expiry = createExpiryScheduler({
    store: timedStore,
    scheduleRefresh: refresh.scheduleRefresh,
    scheduleTargetedRefresh: targetedRefresh.scheduleTargetedRefresh,
    evaluate: headerPainter.evaluate,
  });
  const timed = createTimedActivations(platform, {
    store: timedStore,
    triggers,
    diffCacheByApi,
    scheduleRefresh: refresh.scheduleRefresh,
    scheduleTargetedRefresh: targetedRefresh.scheduleTargetedRefresh,
    armNextExpiry: expiry.armNextExpiry,
    evaluate: headerPainter.evaluate,
  });

  // Fire evaluate on every relevant data-side event — and once immediately
  // so profile loads paint without waiting for a first event.
  disposers.push(platform.api.onReady((api) => {
    // Register BEFORE the first activation pass so predicates evaluated
    // during the resulting repaint can already see the store.
    timedStateByApi.set(api as object, timedStore.byRowId);
    timed.processTimedActivations();
    headerPainter.evaluate();
    refresh.scheduleRefresh();
  }));
  // Coalesce the per-tick header-paint + timed-activation work onto the
  // platform's shared, timer-batched row-change signal instead of wiring a
  // private `modelUpdated` listener — so a burst of streaming flushes in one
  // frame triggers ONE pass, not one per tick. The delta payload is passed
  // through: timed activations touch ONLY the rows the flush changed
  // (falling back to a full walk on structural `full` changes).
  disposers.push(platform.rows.subscribe((change) => {
    timed.processTimedActivations(change);
    if (hasHeaderPaintRules(platform.getState())) {
      headerPainter.evaluate();
    }
  }));
  disposers.push(platform.api.on('filterChanged', () => {
    if (hasHeaderPaintRules(platform.getState())) {
      headerPainter.evaluate();
    }
  }));
  // NOTE: cellValueChanged is wired by timedActivations.attachCellValueChangedListener —
  // don't double-register here; it already runs evaluate() in its own handler.
  disposers.push(platform.api.onReady(() => {
    disposers.push(timed.attachCellValueChangedListener());
  }));

  // Rule-list changes: state subscription. Reconcile the timed-rule
  // state with the new rule set first — without this, a profile
  // switch that drops the previous profile's timed rules leaves
  // stale `rowUntil` / `cellsUntil` entries in this grid's store.
  // `getNextExpiry()` keeps returning a non-null timestamp,
  // the coalesced timer fires, re-arms with delay 8ms, and loops
  // forever — visible as repeated `armNextExpiry / expiry refresh
  // fired` traces with the same `firesAt` value.
  disposers.push(platform.subscribe(() => {
    const state = platform.getState();
    const activeTimedRuleIds = new Set<string>();
    for (const r of state.rules) {
      if (r.enabled && normalizeDuration(r.activeDurationMs) != null) {
        activeTimedRuleIds.add(r.id);
      }
    }
    timedStore.pruneByRuleSet(activeTimedRuleIds);
    triggers.rebuild(state.rules);
    expiry.armNextExpiry();
    headerPainter.evaluate();
    refresh.scheduleRefresh();
  }));
  // Seed the triggers cache with whatever rules already exist when
  // we activate — `platform.subscribe` fires on changes only, not on
  // mount, so the initial set would otherwise stay invisible until
  // the user edits a rule.
  triggers.rebuild(platform.getState().rules);

  // Per-step isolated teardown — any single step failing logs and lets
  // the rest run. Without this, an exception in (say) refreshRaf cancel
  // would skip clearing the expiryTimer, leaking a setTimeout that mutates
  // grid state indefinitely after dispose. Per the review's instruction:
  // never rely on disposer ordering for safety.
  const safely = (label: string, fn: () => void): void => {
    try {
      fn();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[conditional-styling] cleanup step failed:', label, err);
    }
  };

  return () => {
    safely('refresh.dispose', refresh.dispose);
    safely('targetedRefresh.dispose', targetedRefresh.dispose);
    safely('expiry.dispose', expiry.dispose);
    safely('timed.dispose', timed.dispose);
    safely('timedStore.clear', () => timedStore.clear());
    for (const d of disposers) { try { d(); } catch { /* swallow — per-disposer */ } }
    safely('remove header flash classes', () => {
      if (typeof document !== 'undefined') {
        document.querySelectorAll('.ag-header-cell[class*="ds-flash-hdr-"]').forEach((el) => {
          [...el.classList].forEach((c) => { if (c.startsWith('ds-flash-hdr-')) el.classList.remove(c); });
        });
      }
    });
  };
}
