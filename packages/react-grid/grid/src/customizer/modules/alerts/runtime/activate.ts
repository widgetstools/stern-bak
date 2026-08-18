/**
 * Alerts module runtime — listens to the platform's shared row-change signal
 * and routes hits through the dispatcher. No CSS injection, no DOM watchers;
 * alerts are pure event-driven.
 *
 * Wiring:
 *   - cellValueChanged   → evaluate dataChange + relativeChange rules for the
 *                          one edited cell (user edits, immediate)
 *   - platform.rows      → the rAF-coalesced row-change delta from streaming
 *       · delta (full=false): evaluate ONLY the changed/added nodes, and read
 *         row add/remove straight from the transaction delta — NO whole-grid
 *         `forEachNode` scan per tick. This is the hot path.
 *       · full  (full=true):  a structural change (sort/filter/setRowData) with
 *         no per-row delta → fall back to a whole-grid pass. Rare, user-driven.
 *   - platform.subscribe (rules changed) → reset dispatcher timers
 *
 * GATE: when no alert rule is enabled the subscriber returns immediately, so an
 * idle alerts module costs nothing per tick. Previously this module walked
 * every row via `forEachNode` on EVERY `modelUpdated` (even with zero rules,
 * and synchronously in 'realtime' mode) — the dominant per-tick cost that made
 * large live grids sluggish.
 *
 * The previous-values store is per-grid, in-memory, and cleared on teardown. It
 * is intentionally NOT persisted with the profile — a fresh load should not
 * falsely fire relativeChange alerts against a stale baseline.
 */

import type { GridApi, Module, PlatformHandle, RowChange } from '@wellsfargo-starui/core';
import { detectRowChanges, type AlertsState } from '@wellsfargo-starui/core';

/** Structural shape of an AG-Grid row node — avoids leaking an ag-grid import. */
type RowNodeLike = { id?: unknown; data?: Record<string, unknown> };
import { getValueByPath } from '@wellsfargo-starui/types';
import { createAlertDispatcher, type AlertDispatcher } from './dispatch';
import {
  collectWatchedColIds,
  evaluateCellDelta,
  partitionEnabledRules,
} from './evaluateCellDelta';
import { createPreviousValuesStore } from './previousValues';

type PartitionedRules = ReturnType<typeof partitionEnabledRules>;

function resolveRowId(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null;
  const candidate = (node as { id?: unknown }).id;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
}

interface CellValueChangedEvent {
  node?: unknown;
  column?: { getColId?: () => string };
  oldValue?: unknown;
  newValue?: unknown;
  data?: Record<string, unknown>;
}

function hasEnabledRowChangeRules(rules: ReadonlyArray<{ enabled: boolean; trigger: { kind: string } }>): boolean {
  return rules.some((r) => r.enabled && r.trigger.kind === 'rowChange');
}

function snapshotRowIds(api: GridApi): Set<string> {
  const ids = new Set<string>();
  try {
    // DISPLAY, not dataset: this seeds the per-session PREVIOUS-VALUE
    // baselines a value-change alert compares against. A row nobody has
    // observed has nothing to compare to, so paging the dataset here would
    // cost a full transfer to learn nothing. Phase 3 note 1.
    // eslint-disable-next-line no-restricted-properties
    api.forEachNode((node) => {
      const id = resolveRowId(node);
      if (id) ids.add(id);
    });
  } catch {
    /* grid mid-teardown */
  }
  return ids;
}

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
 *
 * Module-level rather than a closure inside `activateAlerts` only to keep that
 * function from growing; it needs nothing from its scope but the two arguments.
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
  const engine = platform.resources.expression();

  let knownRowIds: Set<string> = new Set();

  // Watched-column memo. Rules state is immutable, so a same-reference
  // rules array yields the same rule-derived set; only the (rare)
  // all-columns fallback depends on the live column list and is
  // recomputed per pass.
  let watchedMemoRules: AlertsState['rules'] | null = null;
  let watchedMemoCols: Set<string> | null = null;
  const getWatchedCols = (api: GridApi, rules: AlertsState['rules']): Set<string> => {
    if (watchedMemoRules === rules && watchedMemoCols) return watchedMemoCols;
    const { ids, stable } = collectWatchedColIds(api, rules, engine);
    if (stable) {
      watchedMemoRules = rules;
      watchedMemoCols = ids;
    } else {
      watchedMemoRules = null;
      watchedMemoCols = null;
    }
    return ids;
  };

  const isEvaluationActive = (): boolean => {
    const settings = platform.getState().settings;
    return settings.enabled && settings.evaluationMode !== 'paused';
  };

  /** Dispatch ROW_ADDED / ROW_REMOVED hits for a given add/remove id set. */
  const dispatchRowChanges = (
    added: Array<{ id: string }>,
    removed: Array<{ id: string }>,
    rules: AlertsState['rules'],
  ): void => {
    if (added.length === 0 && removed.length === 0) return;
    const hits = detectRowChanges(added, removed, rules);
    if (hits.length === 0) return;
    const rulesById = new Map(rules.map((r) => [r.id, r]));
    for (const hit of hits) {
      const rule = rulesById.get(hit.ruleId);
      if (rule) dispatcher.dispatch(rule, hit);
    }
  };

  /**
   * Evaluate dataChange / relativeChange rules against ONE row node, comparing
   * each watched column against its stored baseline. Seeds the baseline on
   * first observation (no fire). Shared by the delta and full-pass paths.
   */
  const scanNode = (
    node: RowNodeLike,
    partitioned: PartitionedRules,
    watchedCols: ReadonlySet<string>,
  ): void => {
    const rowId = resolveRowId(node);
    if (!rowId) return;
    const data = (node as { data?: Record<string, unknown> }).data ?? {};
    for (const colId of watchedCols) {
      const next = getValueByPath(data, colId);
      const prev = prevValues.get(rowId, colId);
      if (prev === undefined) {
        prevValues.set(rowId, colId, next);
        continue;
      }
      if (Object.is(prev, next)) continue;
      evaluateCellDelta({
        rowId,
        colId,
        prev,
        next,
        data,
        dataChange: partitioned.dataChange,
        relativeChange: partitioned.relativeChange,
        engine,
        dispatcher,
        prevValues,
      });
    }
  };

  /**
   * Delta path (streaming hot path): evaluate ONLY the nodes the transaction
   * actually touched. No whole-grid `forEachNode`.
   */
  const runDelta = (change: RowChange, rules: AlertsState['rules']): void => {
    // Row add/remove alerts come straight from the transaction delta.
    if (hasEnabledRowChangeRules(rules)) {
      const added: Array<{ id: string }> = [];
      const removed: Array<{ id: string }> = [];
      for (const n of change.added) { const id = resolveRowId(n); if (id) added.push({ id }); }
      for (const n of change.removed) { const id = resolveRowId(n); if (id) removed.push({ id }); }
      dispatchRowChanges(added, removed, rules);
    }

    // Keep knownRowIds current (consumed by the full-pass diff) + drop
    // baselines for removed rows.
    for (const n of change.added) { const id = resolveRowId(n); if (id) knownRowIds.add(id); }
    for (const n of change.removed) {
      const id = resolveRowId(n);
      if (id) { knownRowIds.delete(id); prevValues.deleteRow(id); }
    }

    const partitioned = partitionEnabledRules(rules);
    if (partitioned.dataChange.length === 0 && partitioned.relativeChange.length === 0) return;
    const api = platform.api.api;
    if (!api) return;
    const watchedCols = getWatchedCols(api, rules);
    if (watchedCols.size === 0) return;

    for (const node of change.updated) scanNode(node, partitioned, watchedCols);
    // New rows: seed baselines so their first subsequent tick compares cleanly.
    for (const node of change.added) scanNode(node, partitioned, watchedCols);
  };

  /**
   * Is the set of rows this grid materialises the same set as the dataset?
   *
   * `canAddressUnloadedRows` is exactly that question, and it is the ONE thing
   * a full pass has to know before it may treat "an id I can no longer see" as
   * "a row that left". Where the two sets differ — a grid paging blocks in and
   * out as the user scrolls — the id-set diff reports every scroll as a burst
   * of arrivals and departures, and every ROW_ADDED / ROW_REMOVED rule fires
   * on cache churn rather than on data. This is a capability branch, not a
   * row-model branch: the module never asks which row model produced it.
   */
  const idsSpanDataset = (): boolean =>
    platform.data.capabilities.canAddressUnloadedRows.supported;

  /**
   * Reconcile the observed-row set on a full pass, and dispatch ROW_ADDED /
   * ROW_REMOVED where the diff is meaningful.
   *
   * Where it is not, the pass does no id bookkeeping at all: real arrivals and
   * departures reach `runDelta` from the transaction, the baselines of rows
   * that merely scrolled out are KEPT (dropping them is why a genuine change
   * across a scroll-out and back never fired), and the whole-grid id walk is
   * skipped rather than run for an answer that would be discarded.
   */
  const reconcileRowMembership = (api: GridApi, rules: AlertsState['rules']): void => {
    if (!idsSpanDataset()) return;

    const next = snapshotRowIds(api);
    if (hasEnabledRowChangeRules(rules)) {
      const added: Array<{ id: string }> = [];
      const removed: Array<{ id: string }> = [];
      for (const id of next) if (!knownRowIds.has(id)) added.push({ id });
      for (const id of knownRowIds) if (!next.has(id)) removed.push({ id });
      dispatchRowChanges(added, removed, rules);
    }
    for (const id of knownRowIds) if (!next.has(id)) prevValues.deleteRow(id);
    knownRowIds = next;
  };

  /**
   * Full pass (structural change — sort/filter/setRowData): re-detect row
   * add/remove via id-set diff and re-scan every row for cell deltas. Rare and
   * user-driven, never the streaming hot path.
   *
   * The value-delta scan walks the rows this grid holds, and deliberately no
   * further: a dataChange / relativeChange rule compares against a baseline
   * this session observed, so a row nobody has ever seen has nothing to
   * compare against and paging the dataset to reach it would cost a full
   * transfer to learn nothing.
   */
  const runFullPass = (rules: AlertsState['rules']): void => {
    const api = platform.api.api;
    if (!api) return;

    reconcileRowMembership(api, rules);

    const partitioned = partitionEnabledRules(rules);
    if (partitioned.dataChange.length === 0 && partitioned.relativeChange.length === 0) return;
    const watchedCols = getWatchedCols(api, rules);
    if (watchedCols.size === 0) return;
    try {
      // DISPLAY, not dataset: the full pass compares each row against the
      // baseline this session recorded for it — see above.
      // eslint-disable-next-line no-restricted-properties
      api.forEachNode((node) => scanNode(node, partitioned, watchedCols));
    } catch {
      /* grid mid-teardown */
    }
  };

  const onCellValueChanged = (evt: CellValueChangedEvent) => {
    if (!isEvaluationActive()) return;

    const node = evt.node;
    const rowId = resolveRowId(node);
    if (!rowId) return;
    const colId = evt.column?.getColId?.();
    if (!colId) return;

    const data = evt.data ?? (node as { data?: Record<string, unknown> }).data ?? {};
    const newValue = evt.newValue;
    const prev = prevValues.get(rowId, colId);
    const partitioned = partitionEnabledRules(platform.getState().rules);

    evaluateCellDelta({
      rowId,
      colId,
      prev: prev ?? evt.oldValue,
      next: newValue,
      data,
      dataChange: partitioned.dataChange,
      relativeChange: partitioned.relativeChange,
      engine,
      dispatcher,
      prevValues,
    });
  };

  // Initial seeding + listener attachment, deferred until the grid is ready.
  disposers.push(
    platform.api.onReady((api) => {
      knownRowIds = snapshotRowIds(api);
      // Seed prev-value baselines so the FIRST cellValueChanged after activation
      // isn't treated as a first observation — but ONLY for the columns alert
      // rules actually watch, not every (row × column) cell. With no enabled
      // data/relative rules there's nothing to observe, so skip the walk
      // entirely. (The old all-columns seed was ~rows×cols `getValueByPath`+set
      // on mount — ~1M ops at 5000 rows × 200 cols, even with zero rules — a
      // pure load-time tax.) A rule added later seeds its column's baseline on
      // its first observed change (scanNode treats `prev === undefined` as
      // baseline-only, no fire), which is the correct conservative behaviour.
      try {
        const rules = platform.getState().rules;
        const { dataChange, relativeChange } = partitionEnabledRules(rules);
        if (dataChange.length > 0 || relativeChange.length > 0) {
          const watchedCols = getWatchedCols(api, rules);
          if (watchedCols.size > 0) {
            // DISPLAY, not dataset: same session-baseline scan.
            // eslint-disable-next-line no-restricted-properties
            api.forEachNode((node) => {
              const id = resolveRowId(node);
              if (!id) return;
              const data = (node as { data?: Record<string, unknown> }).data ?? {};
              for (const colId of watchedCols) {
                prevValues.set(id, colId, getValueByPath(data, colId));
              }
            });
          }
        }
      } catch {
        /* grid mid-teardown */
      }

      // AG-Grid expects raw handlers; cast through to keep this file
      // framework-thin (no ag-grid-community imports leak in).
      const handler = onCellValueChanged as unknown as () => void;
      api.addEventListener('cellValueChanged', handler);
      disposers.push(() => api.removeEventListener('cellValueChanged', handler));
    }),
  );

  // The shared, rAF-coalesced row-change signal replaces the per-tick
  // `modelUpdated` + `forEachNode` scan. GATE: no enabled rules → no work.
  disposers.push(
    platform.rows.subscribe((change) => {
      if (!isEvaluationActive()) return;
      const rules = platform.getState().rules;
      if (!rules.some((r) => r.enabled)) return;
      if (change.full) runFullPass(rules);
      else runDelta(change, rules);
    }),
  );

  // Hits the DATA SOURCE found on rows this grid does not hold — the one
  // channel by which an alert on an unloaded row reaches the bell. See
  // {@link dispatchSourceAlertHits}.
  disposers.push(
    platform.events.on('data:alertHits', ({ gridId, hits }) => {
      if (gridId !== platform.gridId || !isEvaluationActive()) return;
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
