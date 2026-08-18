/**
 * The alerts EVALUATOR: everything that decides whether a row change is a hit,
 * and the per-grid state that decision needs.
 *
 * Split out of `activateAlerts`, which is now wiring alone. The two are
 * genuinely separate concerns — this one never touches a disposer or a
 * subscription, and `activate` never touches a baseline or a watched-column
 * memo — and the split is what brought `activateAlerts` under the 80-line
 * ceiling it had been 120 lines over (WORKLOG item 21).
 *
 * Everything that needs no per-grid state is a module-level function taking
 * {@link EvaluatorDeps}; the factory keeps only what genuinely mutates across
 * calls (the observed-row set and the watched-column memo). That is what keeps
 * the factory itself inside the ceiling rather than just moving the problem.
 */
import type { GridApi, PlatformHandle, RowChange } from '@wellsfargo-starui/core';
import { detectRowChanges, type AlertsState } from '@wellsfargo-starui/core';
import { getValueByPath } from '@wellsfargo-starui/types';
import type { AlertDispatcher } from './dispatch';
import {
  collectWatchedColIds,
  evaluateCellDelta,
  partitionEnabledRules,
} from './evaluateCellDelta';
import type { PreviousValuesStore } from './previousValues';

/** Structural shape of an AG-Grid row node — avoids leaking an ag-grid import. */
type RowNodeLike = { id?: unknown; data?: Record<string, unknown> };

type PartitionedRules = ReturnType<typeof partitionEnabledRules>;

/** What every evaluation step needs, and nothing more. */
export interface EvaluatorDeps {
  readonly platform: PlatformHandle<AlertsState>;
  readonly dispatcher: AlertDispatcher;
  readonly prevValues: PreviousValuesStore;
  readonly engine: ReturnType<PlatformHandle<AlertsState>['resources']['expression']>;
}

export interface CellValueChangedEvent {
  node?: unknown;
  column?: { getColId?: () => string };
  oldValue?: unknown;
  newValue?: unknown;
  data?: Record<string, unknown>;
}

export interface AlertsEvaluator {
  /** Streaming hot path — only the nodes the transaction touched. */
  runDelta(change: RowChange, rules: AlertsState['rules']): void;
  /** Structural change (sort/filter/setRowData) — whole-grid pass. */
  runFullPass(rules: AlertsState['rules']): void;
  /** One user edit, immediately. */
  onCellValueChanged(evt: CellValueChangedEvent): void;
  /** Record the rows and baselines this session starts from. */
  seedFromGrid(api: GridApi): void;
  /** Is evaluation switched on and not paused? */
  isEvaluationActive(): boolean;
}

export function resolveRowId(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null;
  const candidate = (node as { id?: unknown }).id;
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null;
}

function hasEnabledRowChangeRules(
  rules: ReadonlyArray<{ enabled: boolean; trigger: { kind: string } }>,
): boolean {
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

function isEvaluationActive(platform: PlatformHandle<AlertsState>): boolean {
  const settings = platform.getState().settings;
  return settings.enabled && settings.evaluationMode !== 'paused';
}

/** Dispatch ROW_ADDED / ROW_REMOVED hits for a given add/remove id set. */
function dispatchRowChanges(
  dispatcher: AlertDispatcher,
  added: Array<{ id: string }>,
  removed: Array<{ id: string }>,
  rules: AlertsState['rules'],
): void {
  if (added.length === 0 && removed.length === 0) return;
  const hits = detectRowChanges(added, removed, rules);
  if (hits.length === 0) return;
  const rulesById = new Map(rules.map((r) => [r.id, r]));
  for (const hit of hits) {
    const rule = rulesById.get(hit.ruleId);
    if (rule) dispatcher.dispatch(rule, hit);
  }
}

/**
 * Evaluate dataChange / relativeChange rules against ONE row node, comparing
 * each watched column against its stored baseline. Seeds the baseline on first
 * observation (no fire). Shared by the delta and full-pass paths.
 */
function scanNode(
  deps: EvaluatorDeps,
  node: RowNodeLike,
  partitioned: PartitionedRules,
  watchedCols: ReadonlySet<string>,
): void {
  const rowId = resolveRowId(node);
  if (!rowId) return;
  const data = node.data ?? {};
  for (const colId of watchedCols) {
    const next = getValueByPath(data, colId);
    const prev = deps.prevValues.get(rowId, colId);
    if (prev === undefined) {
      deps.prevValues.set(rowId, colId, next);
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
      engine: deps.engine,
      dispatcher: deps.dispatcher,
      prevValues: deps.prevValues,
    });
  }
}

function handleCellValueChanged(deps: EvaluatorDeps, evt: CellValueChangedEvent): void {
  if (!isEvaluationActive(deps.platform)) return;

  const rowId = resolveRowId(evt.node);
  if (!rowId) return;
  const colId = evt.column?.getColId?.();
  if (!colId) return;

  const data = evt.data ?? (evt.node as RowNodeLike | undefined)?.data ?? {};
  const prev = deps.prevValues.get(rowId, colId);
  const partitioned = partitionEnabledRules(deps.platform.getState().rules);

  evaluateCellDelta({
    rowId,
    colId,
    prev: prev ?? evt.oldValue,
    next: evt.newValue,
    data,
    dataChange: partitioned.dataChange,
    relativeChange: partitioned.relativeChange,
    engine: deps.engine,
    dispatcher: deps.dispatcher,
    prevValues: deps.prevValues,
  });
}

/**
 * Reconcile the observed-row set on a full pass, dispatching ROW_ADDED /
 * ROW_REMOVED where the diff is meaningful, and return the new set.
 *
 * `canAddressUnloadedRows` is the ONE thing a full pass has to know before it
 * may treat "an id I can no longer see" as "a row that left". Where the rows
 * this grid materialises are NOT the dataset — a grid paging blocks in and out
 * as the user scrolls — the id-set diff reports every scroll as a burst of
 * arrivals and departures, and every rule fires on cache churn rather than on
 * data. So the pass then does no id bookkeeping at all: real arrivals reach
 * `runDelta` from the transaction, and the baselines of rows that merely
 * scrolled out are KEPT (dropping them is why a genuine change across a
 * scroll-out and back never fired). A capability branch, not a row-model
 * branch: this module never asks which row model produced it.
 */
function reconcileRowMembership(
  deps: EvaluatorDeps,
  api: GridApi,
  rules: AlertsState['rules'],
  known: Set<string>,
): Set<string> {
  if (!deps.platform.data.capabilities.canAddressUnloadedRows.supported) return known;

  const next = snapshotRowIds(api);
  if (hasEnabledRowChangeRules(rules)) {
    const added: Array<{ id: string }> = [];
    const removed: Array<{ id: string }> = [];
    for (const id of next) if (!known.has(id)) added.push({ id });
    for (const id of known) if (!next.has(id)) removed.push({ id });
    dispatchRowChanges(deps.dispatcher, added, removed, rules);
  }
  for (const id of known) if (!next.has(id)) deps.prevValues.deleteRow(id);
  return next;
}

/**
 * Seed prev-value baselines so the FIRST `cellValueChanged` after activation
 * isn't treated as a first observation — but ONLY for the columns alert rules
 * actually watch, not every (row × column) cell. The old all-columns seed was
 * ~rows×cols `getValueByPath`+set on mount — ~1M ops at 5000 rows × 200 cols,
 * even with zero rules — a pure load-time tax. A rule added later seeds its
 * column's baseline on its first observed change (`scanNode` treats
 * `prev === undefined` as baseline-only, no fire), which is the correct
 * conservative behaviour.
 */
function seedBaselines(
  deps: EvaluatorDeps,
  api: GridApi,
  watchedCols: ReadonlySet<string>,
): void {
  if (watchedCols.size === 0) return;
  try {
    // DISPLAY, not dataset: same session-baseline scan.
    // eslint-disable-next-line no-restricted-properties
    api.forEachNode((node) => {
      const id = resolveRowId(node);
      if (!id) return;
      const data = (node as RowNodeLike).data ?? {};
      for (const colId of watchedCols) {
        deps.prevValues.set(id, colId, getValueByPath(data, colId));
      }
    });
  } catch {
    /* grid mid-teardown */
  }
}

export function createAlertsEvaluator(
  platform: PlatformHandle<AlertsState>,
  dispatcher: AlertDispatcher,
  prevValues: PreviousValuesStore,
  engine: EvaluatorDeps['engine'],
): AlertsEvaluator {
  const deps: EvaluatorDeps = { platform, dispatcher, prevValues, engine };
  let knownRowIds: Set<string> = new Set();

  // Watched-column memo. Rules state is immutable, so a same-reference rules
  // array yields the same rule-derived set; only the (rare) all-columns
  // fallback depends on the live column list and is recomputed per pass.
  let memoRules: AlertsState['rules'] | null = null;
  let memoCols: Set<string> | null = null;
  const watchedCols = (api: GridApi, rules: AlertsState['rules']): Set<string> => {
    if (memoRules === rules && memoCols) return memoCols;
    const { ids, stable } = collectWatchedColIds(api, rules, engine);
    memoRules = stable ? rules : null;
    memoCols = stable ? ids : null;
    return ids;
  };

  /** The columns to scan, or `null` when there is nothing to scan for. */
  const scanScope = (api: GridApi, rules: AlertsState['rules']) => {
    const partitioned = partitionEnabledRules(rules);
    if (partitioned.dataChange.length === 0 && partitioned.relativeChange.length === 0) {
      return null;
    }
    const cols = watchedCols(api, rules);
    return cols.size === 0 ? null : { partitioned, cols };
  };

  return {
    isEvaluationActive: () => isEvaluationActive(platform),

    onCellValueChanged: (evt) => handleCellValueChanged(deps, evt),

    /**
     * Delta path (streaming hot path): evaluate ONLY the nodes the transaction
     * actually touched. No whole-grid `forEachNode`.
     */
    runDelta(change, rules) {
      // Row add/remove alerts come straight from the transaction delta.
      const added: Array<{ id: string }> = [];
      const removed: Array<{ id: string }> = [];
      for (const n of change.added) { const id = resolveRowId(n); if (id) added.push({ id }); }
      for (const n of change.removed) { const id = resolveRowId(n); if (id) removed.push({ id }); }
      if (hasEnabledRowChangeRules(rules)) {
        dispatchRowChanges(dispatcher, added, removed, rules);
      }

      // Keep knownRowIds current (consumed by the full-pass diff) + drop
      // baselines for removed rows.
      for (const { id } of added) knownRowIds.add(id);
      for (const { id } of removed) { knownRowIds.delete(id); prevValues.deleteRow(id); }

      const api = platform.api.api;
      if (!api) return;
      const scope = scanScope(api, rules);
      if (!scope) return;
      for (const node of change.updated) scanNode(deps, node, scope.partitioned, scope.cols);
      // New rows: seed baselines so their first subsequent tick compares cleanly.
      for (const node of change.added) scanNode(deps, node, scope.partitioned, scope.cols);
    },

    /**
     * Full pass (structural change — sort/filter/setRowData): re-detect row
     * add/remove via id-set diff and re-scan every row for cell deltas. Rare
     * and user-driven, never the streaming hot path.
     *
     * The value-delta scan walks the rows this grid holds, and deliberately no
     * further: a rule compares against a baseline this session observed, so a
     * row nobody has ever seen has nothing to compare against and paging the
     * dataset to reach it would cost a full transfer to learn nothing.
     */
    runFullPass(rules) {
      const api = platform.api.api;
      if (!api) return;
      knownRowIds = reconcileRowMembership(deps, api, rules, knownRowIds);
      const scope = scanScope(api, rules);
      if (!scope) return;
      try {
        // DISPLAY, not dataset: see above.
        // eslint-disable-next-line no-restricted-properties
        api.forEachNode((node) => scanNode(deps, node, scope.partitioned, scope.cols));
      } catch {
        /* grid mid-teardown */
      }
    },

    seedFromGrid(api) {
      knownRowIds = snapshotRowIds(api);
      const rules = platform.getState().rules;
      const scope = scanScope(api, rules);
      if (scope) seedBaselines(deps, api, scope.cols);
    },
  };
}
