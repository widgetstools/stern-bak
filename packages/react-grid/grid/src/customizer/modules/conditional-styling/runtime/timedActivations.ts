/**
 * Timed-rule activation engine.
 *
 * Two entry points:
 *
 *  - `processTimedActivations()` — bulk pass after `modelUpdated`. Walks
 *    every row, diffs against the previous-render snapshot per known
 *    column path, evaluates every timed rule whose triggers fired, and
 *    upserts cell/row activations into this grid's TimedRuleStore.
 *
 *  - `attachCellValueChangedListener()` — per-tick path. Wires AG-Grid's
 *    `cellValueChanged` event to evaluate timed rules immediately for the
 *    one cell that changed, then enqueues a cross-column targeted refresh
 *    if the changed column was a "trigger" for any cell-scope rule (so
 *    the rule's verdict propagates uniformly across `scope.columns`).
 *
 * State owned by this module:
 *   - `previousByRow` — last-render path→value snapshots per row, used
 *     for diff-driven trigger detection in the bulk pass
 *   - the cellValueChanged disposer
 *
 * Dependencies are injected as a deps bag so the orchestrator wires
 * everything explicitly; this module never reaches across boundaries
 * to grab shared state.
 */

import type { PlatformHandle, RowChange } from '@wellsfargo-starui/engine';
import type { GridApi } from 'ag-grid-community';
import { getValueByPath } from '@wellsfargo-starui/types';
import type { DiffCacheByApi, TimedRuleStore } from '../transforms';
import type { ConditionalStylingState } from '../state';
import {
  buildColumnsContextFromDiffs,
  isTimedTraceOn,
  normalizeDuration,
  resolveRowId,
  traceTimed,
} from './utils';
import type { TriggerCache } from './triggerCache';
import { hasHeaderPaintRules } from './headerPainter';

export interface TimedActivationsDeps {
  /** This grid's timed-activation store — per-grid, never module-shared. */
  store: TimedRuleStore;
  triggers: TriggerCache;
  diffCacheByApi: DiffCacheByApi;
  scheduleRefresh: () => void;
  scheduleTargetedRefresh: (
    rowIds: Iterable<string>,
    colIds: Iterable<string>,
    includesRowScope: boolean,
  ) => void;
  armNextExpiry: () => void;
  /** Header repaint after rule verdicts may have flipped. */
  evaluate: () => void;
}

export interface TimedActivations {
  /**
   * Row-change pass. With a non-`full` {@link RowChange}, touches ONLY
   * the delivered added/updated rows (the streaming hot path); with no
   * argument or `full: true`, walks the whole model and prunes
   * liveness (onReady seed, sort/filter/setRowData).
   */
  processTimedActivations: (change?: RowChange) => void;
  /** Wire up the per-tick cellValueChanged path. Returns a disposer. */
  attachCellValueChangedListener: () => () => void;
  /** Drop all in-memory snapshots (used by the orchestrator at teardown). */
  dispose: () => void;
}

export function createTimedActivations(
  platform: PlatformHandle<ConditionalStylingState>,
  deps: TimedActivationsDeps,
): TimedActivations {
  const previousByRow = new Map<string, Map<string, unknown>>();

  const processTimedActivations = (change?: RowChange): void => {
    const api = platform.api.api;
    if (!api) return;
    const state = platform.getState();
    const engine = platform.resources.expression();
    const now = Date.now();
    const timedRules = state.rules.filter((r) => r.enabled && normalizeDuration(r.activeDurationMs) != null);
    if (timedRules.length === 0) return;
    let activatedThisPass = false;

    // Path-keyed diff surface. Drive change detection by AG-Grid's
    // actual colIds (which carry dot-paths when a colDef's `field`
    // walks into a nested object), unioned with every column ANY
    // active rule's expression depends on (rule triggers may reference
    // fields that are part of the row data but not surfaced as
    // AG-Grid columns).
    //
    // Top-level `Object.entries(data)` walking misses nested changes:
    //   - For `{ x: { z: { price: 100 } } }`, entries yields `['x']`,
    //     never `'x.z.price'` — a tick that ONLY changes the deep
    //     leaf would either be invisible (in-place mutation: `x` is
    //     the same reference) or recorded under the wrong key (object
    //     replacement: diff stored under `'x'`, but the expression
    //     reads `[x.z.price.old]` which doesn't resolve through that
    //     entry). Both cases produce silent no-ops.
    //
    // Resolving each known path via `getValueByPath` walks the
    // current data on every read, so in-place mutation is detected
    // correctly and sparse rows (path absent on this row) compare
    // `undefined`-to-`undefined` cleanly without false positives.
    const knownPaths = new Set<string>();
    try {
      const cols = (api as { getColumns?: () => Array<{ getColId: () => string }> | null }).getColumns?.();
      if (cols) {
        for (const c of cols) knownPaths.add(c.getColId());
      }
    } catch {
      /* grid mid-teardown */
    }
    for (const rule of timedRules) {
      const trig = deps.triggers.get(rule);
      if (trig) for (const t of trig) knownPaths.add(t);
    }

    const rowDiffCache = deps.diffCacheByApi.get(api as object);

    // Per-node work, shared by the delta and full passes. Returns the
    // row id (for full-pass liveness bookkeeping) or null when the node
    // is unkeyable. Allocation discipline: the previous-values Map is
    // MUTATED in place (only changed paths are rewritten) — the old
    // shape allocated a fresh Map per row per pass, ~160k discarded
    // Maps/sec at streaming rates, almost all for unchanged rows.
    const processNode = (node: unknown): string | null => {
      const rowId = resolveRowId(node);
      if (!rowId) return null;
      const data = (node as { data?: Record<string, unknown> }).data ?? {};
      let prev = previousByRow.get(rowId);
      if (!prev) {
        prev = new Map<string, unknown>();
        previousByRow.set(rowId, prev);
      }
      const changedKeys: string[] = [];
      const changedOld: unknown[] = [];
      for (const path of knownPaths) {
        const cur = getValueByPath(data, path);
        const old = prev.get(path);
        if (!Object.is(old, cur)) {
          changedKeys.push(path);
          changedOld.push(old);
          prev.set(path, cur);
        }
      }
      if (changedKeys.length === 0) return rowId;

      // Keep diff context in sync for expressions that use .old/.new refs.
      // Path-keyed entries so `[x.z.price.old]` resolves through the
      // own-property write in `buildColumnsContextFromDiffs`, not by
      // accidentally falling back to dot-walking the current data.
      if (rowDiffCache && typeof node === 'object' && node) {
        let rowDiffs = rowDiffCache.get(node as object);
        if (!rowDiffs) {
          rowDiffs = new Map();
          rowDiffCache.set(node as object, rowDiffs);
        }
        for (let i = 0; i < changedKeys.length; i++) {
          const path = changedKeys[i];
          rowDiffs.set(path, { oldValue: changedOld[i], newValue: prev.get(path) });
        }
      }

      const columns = buildColumnsContextFromDiffs(
        data,
        rowDiffCache?.get(node as object),
      );

      for (const rule of timedRules) {
        const ttlMs = normalizeDuration(rule.activeDurationMs);
        if (ttlMs == null) continue;
        if (rule.scope.type === 'row') {
          let match = false;
          try {
            match = Boolean(
              engine.parseAndEvaluate(rule.expression, {
                x: null,
                value: null,
                data,
                columns,
              }),
            );
          } catch {
            match = false;
          }
          if (!match) continue;
          deps.store.upsertRowActivation(rowId, rule.id, now + ttlMs);
          activatedThisPass = true;
          if (isTimedTraceOn()) traceTimed('row rule activated (model diff)', { rowId, ruleId: rule.id, until: now + ttlMs });
          continue;
        }

        // Cross-column contract: the expression is a row-level
        // predicate, and `scope.columns` is the paint surface. Evaluate
        // ONCE per row (not per scoped column) and — if the predicate
        // is true — activate every column in `scope.columns`, even
        // ones whose own value didn't change in this transaction.
        //
        // Bounded re-evaluation: skip the rule entirely when NONE of
        // the columns its expression depends on appear in this row's
        // changedKeys, so untouched rows don't re-evaluate on every
        // modelUpdated. Falls back to "always evaluate" when we can't
        // identify trigger columns (parse failure, literal expression).
        const triggers = deps.triggers.get(rule);
        const hasRelevantChange =
          !triggers || triggers.size === 0 ||
          changedKeys.some((k) => triggers.has(k));
        if (!hasRelevantChange) continue;
        let match = false;
        try {
          match = Boolean(
            engine.parseAndEvaluate(rule.expression, {
              x: null,
              value: null,
              data,
              columns,
            }),
          );
        } catch {
          match = false;
        }
        if (!match) continue;
        for (const colId of rule.scope.columns) {
          deps.store.upsertCellActivation(rowId, rule.id, colId, now + ttlMs);
          activatedThisPass = true;
          if (isTimedTraceOn()) traceTimed('cell rule activated (model diff)', { rowId, ruleId: rule.id, colId, until: now + ttlMs });
        }
      }

      return rowId;
    };

    if (change !== undefined && !change.full) {
      // Delta pass — the streaming hot path. The RowChangeBus already
      // knows exactly which rows the flush touched; the old shape
      // ignored that payload and forEachNode-scanned all 20k rows ×
      // every known path per flush (~8M path reads/sec with one timed
      // rule armed). Removed rows drop their snapshot immediately;
      // timed-state entries for them expire via the timer / next full
      // pass. No pruning here — a delta pass cannot know full liveness.
      for (const node of change.updated) processNode(node);
      for (const node of change.added) processNode(node);
      for (const node of change.removed) {
        const rowId = resolveRowId(node);
        if (rowId) previousByRow.delete(rowId);
      }
    } else {
      // Full pass — onReady seed and structural changes (sort/filter/
      // setRowData). The only place liveness pruning is sound.
      const activeRowIds = new Set<string>();
      api.forEachNode((node) => {
        const rowId = processNode(node);
        if (rowId) activeRowIds.add(rowId);
      });
      for (const rowId of previousByRow.keys()) {
        if (!activeRowIds.has(rowId)) previousByRow.delete(rowId);
      }
      deps.store.prune(activeRowIds);
    }

    // Rearm coalesced expiry timer once per pass — cheaper than one
    // setTimeout per cell activation, regardless of mutationsPerTick.
    // Also force a `cellClassRules` re-evaluation: AG-Grid evaluates
    // class rules during the transaction, BEFORE firing modelUpdated,
    // so the predicates ran with the *old* (empty) timed state and
    // missed our just-written activations. Without this refresh the
    // timed style window appears to do nothing on live ticks.
    // Bounded firing: only fires when we actually wrote activations
    // this pass — at most once per modelUpdated (~3/sec at typical
    // tick rates), NOT once per cellValueChanged (~30/sec).
    if (activatedThisPass) {
      deps.armNextExpiry();
      deps.scheduleRefresh();
    }
  };

  const attachCellValueChangedListener = (): (() => void) => {
    const api = platform.api.api;
    if (!api) return () => {};
    let rowDiffCache = deps.diffCacheByApi.get(api as object);
    if (!rowDiffCache) {
      rowDiffCache = new WeakMap();
      deps.diffCacheByApi.set(api as object, rowDiffCache);
    }
    const safeRowDiffCache = rowDiffCache;
    const onCellValueChanged = (event: {
      node?: unknown;
      column?: { getColId?: () => string };
      api?: unknown;
      oldValue?: unknown;
      newValue?: unknown;
    }) => {
      onCellValueChangedHandler(event, api, safeRowDiffCache, platform, deps);
    };
    api.addEventListener('cellValueChanged', onCellValueChanged);
    return () => {
      api.removeEventListener('cellValueChanged', onCellValueChanged);
    };
  };

  const dispose = () => {
    previousByRow.clear();
  };

  return { processTimedActivations, attachCellValueChangedListener, dispose };
}

/**
 * cellValueChanged handler — extracted to a top-level function purely so
 * the closure remains thin (was 220 LOC inline in the original; now lives
 * here where the parameter list documents the surface).
 */
function onCellValueChangedHandler(
  event: {
    node?: unknown;
    column?: { getColId?: () => string };
    api?: unknown;
    oldValue?: unknown;
    newValue?: unknown;
  },
  api: GridApi,
  rowDiffCache: WeakMap<object, Map<string, { oldValue: unknown; newValue: unknown }>>,
  platform: PlatformHandle<ConditionalStylingState>,
  deps: TimedActivationsDeps,
): void {
  const node = event.node;
  const getColId = event.column?.getColId;
  if (!node || typeof node !== 'object' || typeof getColId !== 'function') return;
  const colId = getColId();
  if (!colId) return;
  const now = Date.now();
  // One flag probe per event — every traceTimed below builds a payload
  // object, and this handler runs per changed cell under live ticks.
  const trace = isTimedTraceOn();
  if (trace) {
    traceTimed('cellValueChanged', {
      rowId: resolveRowId(node),
      colId,
      oldValue: event.oldValue,
      newValue: event.newValue,
    });
  }
  let rowDiffs = rowDiffCache.get(node as object);
  if (!rowDiffs) {
    rowDiffs = new Map();
    rowDiffCache.set(node as object, rowDiffs);
  }
  rowDiffs.set(colId, { oldValue: event.oldValue, newValue: event.newValue });

  const rowData = (node as { data?: Record<string, unknown> }).data ?? {};
  const state = platform.getState();
  const engine = platform.resources.expression();
  let activatedThisEvent = false;
  for (const rule of state.rules) {
    if (!rule.enabled) continue;
    const ttlMs = normalizeDuration(rule.activeDurationMs);
    if (ttlMs == null) continue;
    if (trace) {
      traceTimed('evaluating timed rule', {
        ruleId: rule.id,
        scope: rule.scope.type,
        ttlMs,
      });
    }
    if (rule.scope.type === 'row') {
      let match = false;
      try {
        const columns = buildColumnsContextFromDiffs(
          rowData,
          rowDiffCache.get(node as object),
        );
        match = Boolean(
          engine.parseAndEvaluate(rule.expression, {
            x: null,
            value: null,
            data: rowData,
            columns,
          }),
        );
      } catch {
        match = false;
      }
      if (trace) traceTimed('row rule match result', { ruleId: rule.id, match });
      if (!match) continue;
      const rowId = resolveRowId(node);
      if (!rowId) continue;
      deps.store.upsertRowActivation(rowId, rule.id, now + ttlMs);
      if (trace) traceTimed('row rule activated', { rowId, ruleId: rule.id, until: now + ttlMs });
      activatedThisEvent = true;
      continue;
    }
    for (const scopedColId of rule.scope.columns) {
      // Dot-walk for nested fields so `x` / `value` bindings see
      // the right leaf when a colDef's `field` is e.g.
      // `'position.price'`. Top-level subscript access would
      // return `undefined` for any nested column.
      const value = getValueByPath(rowData, scopedColId);
      let match = false;
      try {
        const columns = buildColumnsContextFromDiffs(
          rowData,
          rowDiffCache.get(node as object),
        );
        match = Boolean(
          engine.parseAndEvaluate(rule.expression, {
            x: value,
            value,
            data: rowData,
            columns,
          }),
        );
      } catch {
        match = false;
      }
      if (trace) traceTimed('cell rule match result', { ruleId: rule.id, scopedColId, match });
      if ((globalThis as { __CS_CROSS_COL_TRACE__?: boolean }).__CS_CROSS_COL_TRACE__) {
        // eslint-disable-next-line no-console
        console.debug('[cs:cross-col] timed-rule cellValueChanged eval', {
          changedColId: colId,
          ruleId: rule.id,
          expression: rule.expression,
          scopeColumns: rule.scope.columns,
          scopedColId,
          match,
          ttlMs,
        });
      }
      if (!match) continue;
      const rowId = resolveRowId(node);
      if (!rowId) continue;
      deps.store.upsertCellActivation(rowId, rule.id, scopedColId, now + ttlMs);
      if (trace) {
        traceTimed('cell rule activated', {
          rowId,
          ruleId: rule.id,
          scopedColId,
          until: now + ttlMs,
        });
      }
      activatedThisEvent = true;
    }
  }

  // Only refresh when we wrote a timed activation this event —
  // AG-Grid already re-evaluated class rules during the
  // transaction, so an unconditional refresh on every
  // cellValueChanged is what caused the input-focus theft.
  // Activations have to be picked up though, so refresh in that
  // case only.
  if (activatedThisEvent) {
    deps.armNextExpiry();
    deps.scheduleRefresh();
  }

  // Trigger-driven cross-column repaint.
  //
  // When the changed column is a "trigger" (referenced by some
  // cell-scope rule's expression), AG-Grid's own re-evaluation
  // covers only THIS cell — but the rule's verdict applies to
  // the whole `scope.columns` surface. Without this targeted
  // refresh, a rule like `[price.old] < [price.new]` with scope
  // `['side','quantity']` would never repaint `side`/`quantity`
  // when `price` ticks, which is the bug the user reported as
  // "only the first column gets styled".
  //
  // Surface accumulated here goes through the existing
  // `scheduleTargetedRefresh` batcher so multiple changes in the
  // same tick coalesce into one `refreshCells` call.
  const rowIdForRefresh = resolveRowId(node);
  const crossColTrace = (
    globalThis as { __CS_CROSS_COL_TRACE__?: boolean }
  ).__CS_CROSS_COL_TRACE__;
  if (crossColTrace) {
    // eslint-disable-next-line no-console
    console.debug('[cs:cross-col] cellValueChanged', {
      colId,
      rowId: rowIdForRefresh,
      ruleCount: state.rules.length,
    });
  }
  if (rowIdForRefresh) {
    const colsToRefresh = new Set<string>();
    for (const rule of state.rules) {
      if (!rule.enabled) continue;
      if (rule.scope.type !== 'cell') continue;
      const triggers = deps.triggers.get(rule);
      if (crossColTrace) {
        // eslint-disable-next-line no-console
        console.debug('[cs:cross-col] rule check', {
          ruleId: rule.id,
          expression: rule.expression,
          scopeColumns: rule.scope.columns,
          triggersFound: triggers ? [...triggers] : null,
          triggersHasChangedCol: triggers ? triggers.has(colId) : false,
        });
      }
      if (!triggers || !triggers.has(colId)) continue;
      for (const c of rule.scope.columns) {
        // The changed column is already refreshed by AG-Grid; no
        // need to enqueue it. Skipping here keeps the targeted
        // surface minimal.
        if (c === colId) continue;
        colsToRefresh.add(c);
      }
    }
    if (colsToRefresh.size > 0) {
      if (crossColTrace) {
        // eslint-disable-next-line no-console
        console.debug('[cs:cross-col] scheduling refresh', {
          rowId: rowIdForRefresh,
          columns: [...colsToRefresh],
        });
      }
      deps.scheduleTargetedRefresh([rowIdForRefresh], colsToRefresh, false);
    } else if (crossColTrace) {
      // eslint-disable-next-line no-console
      console.debug('[cs:cross-col] no cols to refresh — either no matching rule or only the changed col was scoped');
    }
  }

  // Header repaint only when header-paint rules exist — this handler
  // fires per cellValueChanged (~30/sec under live edit/tick load) and
  // deps.evaluate() runs the up-to-20k-row header-painter scan; the
  // other call sites already gate on hasHeaderPaintRules.
  if (hasHeaderPaintRules(state)) deps.evaluate();
}
