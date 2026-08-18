/**
 * Alerts module runtime — WIRING only. What decides whether a row change is a
 * hit, and the per-grid state that decision needs, is `alertsEvaluator.ts`.
 *
 * The four sources a hit can come from:
 *   - `cellValueChanged`   → one user edit, immediately
 *   - `platform.rows`      → the rAF-coalesced row-change delta from streaming
 *       · delta (full=false): only the changed/added nodes. The hot path.
 *       · full  (full=true):  a structural change (sort/filter/setRowData) with
 *         no per-row delta → a whole-grid pass. Rare, user-driven.
 *   - `data:alertHits`     → hits the DATA SOURCE found on rows this grid does
 *         not hold, the one channel by which an alert on an unloaded row
 *         reaches the bell
 *   - `platform.subscribe` → rules changed, so reset dispatcher timers
 *
 * GATE: when no alert rule is enabled the row subscriber returns immediately,
 * so an idle alerts module costs nothing per tick. This module previously
 * walked every row via `forEachNode` on EVERY `modelUpdated` — even with zero
 * rules — which was the dominant per-tick cost on large live grids.
 *
 * The previous-values store is per-grid, in-memory, and cleared on teardown. It
 * is intentionally NOT persisted with the profile — a fresh load should not
 * falsely fire relativeChange alerts against a stale baseline.
 */

import type { Module, PlatformHandle } from '@wellsfargo-starui/core';
import type { AlertsState } from '@wellsfargo-starui/core';
import { createAlertDispatcher, type AlertDispatcher } from './dispatch';
import { createAlertsEvaluator } from './alertsEvaluator';
import { createPreviousValuesStore } from './previousValues';

/**
 * Dispatch alert hits the DATA SOURCE found on rows this grid does not hold.
 *
 * The bell used to count only what the client had loaded, because a
 * `dataChange` rule is evaluated against the rows the grid materialises and a
 * paging grid materialises a window. Where the source can see the whole
 * dataset it says so, already deduped against the rows this session holds —
 * those arrive as a transaction and are evaluated against this session's own
 * baselines, so counting them here as well would count every visible hit
 * twice.
 *
 * Only `dataChange` rules, deliberately. A `relativeChange` rule compares
 * against a baseline this session recorded, and a row nobody has observed has
 * none — a source-detected "hit" on one would be a comparison against nothing.
 * A `rowChange` rule speaks about membership, which is not what this reports.
 */
function dispatchSourceAlertHits(
  platform: PlatformHandle<AlertsState>,
  dispatcher: AlertDispatcher,
  hits: ReadonlyArray<{ rowId: string; ruleId: string }>,
): void {
  if (hits.length === 0) return;
  const rulesById = new Map(
    platform
      .getState()
      .rules.filter((r) => r.enabled && r.trigger.kind === 'dataChange')
      .map((r) => [r.id, r]),
  );
  for (const hit of hits) {
    const rule = rulesById.get(hit.ruleId);
    if (!rule) continue;
    // No cell context: the rule is a row predicate and the row is not loaded.
    // Inventing a column or a value here would be inventing it.
    dispatcher.dispatch(rule, {
      ruleId: rule.id,
      rowId: hit.rowId,
      column: null,
      value: null,
      prevValue: null,
    });
  }
}

/** Run a teardown step, naming it if it throws. Captures nothing. */
function safely(label: string, fn: () => void): void {
  try {
    fn();
  } catch (err) {
    console.warn('[alerts] cleanup step failed:', label, err);
  }
}

export function activateAlerts(
  platform: PlatformHandle<AlertsState>,
): ReturnType<NonNullable<Module<AlertsState>['activate']>> {
  const disposers: Array<() => void> = [];
  const dispatcher = createAlertDispatcher(platform);
  const prevValues = createPreviousValuesStore();
  const evaluator = createAlertsEvaluator(
    platform,
    dispatcher,
    prevValues,
    platform.resources.expression(),
  );

  // Initial seeding + listener attachment, deferred until the grid is ready.
  disposers.push(
    platform.api.onReady((api) => {
      evaluator.seedFromGrid(api);
      // AG-Grid expects raw handlers; cast through to keep this file
      // framework-thin (no ag-grid-community imports leak in).
      const handler = evaluator.onCellValueChanged as unknown as () => void;
      api.addEventListener('cellValueChanged', handler);
      disposers.push(() => api.removeEventListener('cellValueChanged', handler));
    }),
  );

  // The shared, rAF-coalesced row-change signal replaces the per-tick
  // `modelUpdated` + `forEachNode` scan. GATE: no enabled rules → no work.
  disposers.push(
    platform.rows.subscribe((change) => {
      if (!evaluator.isEvaluationActive()) return;
      const rules = platform.getState().rules;
      if (!rules.some((r) => r.enabled)) return;
      if (change.full) evaluator.runFullPass(rules);
      else evaluator.runDelta(change, rules);
    }),
  );

  disposers.push(
    platform.events.on('data:alertHits', ({ gridId, hits }) => {
      if (gridId !== platform.gridId || !evaluator.isEvaluationActive()) return;
      dispatchSourceAlertHits(platform, dispatcher, hits);
    }),
  );

  // Reset dispatcher debounce timers when the rule list mutates (profile
  // switch, in-place edit). The previous-values store is preserved across
  // rule edits — relativeChange baselines are about the data stream, not
  // about which rules are watching it.
  disposers.push(
    platform.subscribe(() => {
      dispatcher.reset();
    }),
  );

  return () => {
    for (const d of disposers) {
      try {
        d();
      } catch {
        /* swallow — per-disposer */
      }
    }
    safely('previousValues.clear', () => prevValues.clear());
    safely('dispatcher.reset', () => dispatcher.reset());
  };
}
