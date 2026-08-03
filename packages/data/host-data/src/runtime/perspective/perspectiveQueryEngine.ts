/**
 * Answer whole-book questions ONCE, in the worker, for every window that
 * asked.
 *
 * The questions — how many rows match this saved filter, does any row
 * satisfy this style rule, what are this column's distinct values, which
 * rows just tripped an alert — all have the same shape: a standing
 * subscription over a Table, re-evaluated when the Table changes. Serving
 * them per window means one full-book View per window per question, all
 * queued behind each other in the same serialized engine the block reads a
 * user is actually waiting for go through. Serving them here means a
 * REGISTRY: subscriptions whose query translates to the same View share
 * that View, so N blotters watching one saved filter cost the engine one
 * recompute, not N.
 *
 * That dedupe is the design, not a bonus. A worker-side mirror of
 * per-window polling would be the same cost in a different thread.
 *
 * Three rules the engine is built around, each learned the expensive way:
 *
 *   1. **Never delete a View with a read in flight.** Uncatchable wasm
 *      borrow error, from a microtask, which can take the whole
 *      SharedWorker down and every blotter with it. Every View here is
 *      wrapped in `createSafeView` before anything reads it.
 *   2. **Throttle.** Reads serialize over one ProxySession. An unthrottled
 *      recompute puts whole-book View builds in front of the block the user
 *      is scrolling toward.
 *   3. **A question that cannot be answered EXACTLY answers `null`.** Never
 *      a number. `toPerspectiveFilterClauses` drops what it cannot
 *      translate, which is right for a View and wrong for a count: the
 *      number comes back silently too large, and a badge reading "matches
 *      20,000 rows" is a confidently wrong answer.
 *
 * Every translation reuses `@wellsfargo-starui/core` — the same functions
 * the window's own view config builder calls. A second implementation would
 * let a filter mean one thing in the grid and another in the badge above it.
 */

import {
  createSafeView,
  isFilterModelMappable,
  toPerspectiveViewConfig,
  computeRelativeChange,
  evaluateDataChangeRule,
  type AgFilterItem,
  type AlertHit,
  type DataChangeRule,
  type DeletableView,
  type ExpressionEngineLike,
  type PerspectiveAggregate,
  type PerspectiveViewConfig,
  type RelativeChangeRule,
  type SafeView,
  viewConfigKey,
} from '@wellsfargo-starui/core';
import type {
  PerspectiveAlertHit,
  PerspectiveChangeRuleQuery,
  PerspectiveMatchSetQuery,
  PerspectiveQueryAggregate,
  PerspectiveQueryFilterState,
  PerspectiveQueryResult,
  PerspectiveQuerySpec,
  PerspectiveRowFieldChange,
  PerspectiveRowSnapshot,
} from '@wellsfargo-starui/types';

type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/**
 * Compile-time drift guard. `@wellsfargo-starui/types` is a foundation
 * package and may not import `@wellsfargo-starui/core`, so two shapes are
 * restated there rather than shared. This is the seam where both are
 * visible, so this is where they are checked — these stop typechecking the
 * moment the definitions diverge.
 */
export const PERSPECTIVE_QUERY_TYPES_MATCH_CORE: [
  MutuallyAssignable<PerspectiveQueryAggregate, PerspectiveAggregate>,
  MutuallyAssignable<PerspectiveAlertHit, AlertHit>,
] = [true, true];

/** Alias of the boolean expression column a compiled rule rides as. */
const MATCH_COLUMN = '__match__';

/**
 * Alias of the constant expression column an unGROUPED aggregate rides as.
 * An ungrouped View is just rows and has no total row at all; one constant
 * column produces exactly one group, whose row 0 is the total over the
 * whole filtered book. Same trick the window uses for its grand total row.
 */
const TOTAL_GROUP = '__total__';

/**
 * Minimum gap between recomputes of one registry entry.
 *
 * This ceiling used to be a per-window `countMinIntervalMs` /
 * `valuesMinIntervalMs` on the row engine, back when every window polled
 * for itself. It belongs to the WORKER now, because one recompute here
 * serves every window that asked — throttling it per window would have
 * throttled N independent scans instead of the single one they share.
 */
export const DEFAULT_RECOMPUTE_THROTTLE_MS = 250;

/**
 * Distinct values a set filter may carry.
 *
 * Past this the engine REFUSES rather than truncating: a value list quietly
 * missing half its entries reads as "these are all the values", which is
 * wrong in a way the user has no way to see. Same convention as the export
 * ceiling. The decision lives here because here is where the values are
 * counted — a caller cannot refuse what it was never told about.
 */
export const DEFAULT_DISTINCT_VALUES_LIMIT = 500;

/**
 * Rows a single `matchSet` transition may carry.
 *
 * A rule that suddenly matches thousands of rows is not an alert, it is a
 * filter — and shipping a truncated prefix of it would fire the wrong
 * alerts and silently drop the rest. Refused loudly; the matched set still
 * advances, so the NEXT transition is a small diff and normal service
 * resumes on its own.
 */
export const DEFAULT_MATCH_SET_SNAPSHOT_CAP = 200;

// ─── The Table + change surfaces the engine reads ───────────────────

/** The slice of a Perspective `Table` this needs. */
export interface QueryTableLike {
  view(config: PerspectiveViewConfig): Promise<DeletableView>;
}

/**
 * Field-level before/after for `changeRule`, which is the one query a View
 * cannot answer: it needs the PREVIOUS value, and an upsert Table does not
 * hold one — writing a row replaces it. Supplied by the table feed's shadow
 * map, which is why the engine takes it rather than deriving it.
 */
export interface PerspectiveChangeSource {
  /** Shadow these fields. The returned release drops this watcher's claim. */
  watch(fields: readonly string[]): () => void;
  /** Field changes, batched per ingest. Returns an unsubscribe. */
  onChanges(cb: (changes: readonly PerspectiveRowFieldChange[]) => void): () => void;
}

export interface PerspectiveQuerySource {
  /** Name the Table is hosted under — half of every registry key. */
  tableName: string;
  table: QueryTableLike;
  /** "The Table changed". Returns an unsubscribe. */
  onUpdate(cb: () => void): () => void;
  /** Index column, so a row snapshot can carry its id. */
  keyColumn: string;
  /** Absent means `changeRule` subscriptions are refused rather than silent. */
  changes?: PerspectiveChangeSource;
}

export interface PerspectiveQuerySubscription {
  subId: string;
  /**
   * Whatever the caller uses to identify a window — the hub passes the
   * `PortLike`. Held only so {@link PerspectiveQueryEngine.releaseOwner}
   * can drop a disconnected window's subscriptions without the caller
   * having to remember which they were.
   */
  owner: object;
  source: PerspectiveQuerySource;
  query: PerspectiveQuerySpec;
  onResult(result: PerspectiveQueryResult): void;
}

export interface PerspectiveQueryEngineOpts {
  recomputeThrottleMs?: number;
  distinctValuesLimit?: number;
  matchSetSnapshotCap?: number;
  /** Injected so tests drive time without real timers. */
  setTimer?(cb: () => void, ms: number): unknown;
  clearTimer?(handle: unknown): void;
  /**
   * Evaluates `dataChange` rule expressions. INJECTED rather than imported
   * for the same reason `loadPerspective` is — a worker that never opens a
   * blotter should not carry the expression stack. Absent, `dataChange`
   * subscriptions are refused with a reason rather than never firing.
   */
  expressionEngine?: ExpressionEngineLike;
  onError?(stage: 'view' | 'read' | 'change', error: unknown): void;
}

export interface PerspectiveQueryEngine {
  subscribe(sub: PerspectiveQuerySubscription): void;
  unsubscribe(subId: string): void;
  /** Drop every subscription a disconnected window owned. */
  releaseOwner(owner: object): void;
  /** Deduped registry entries — the number of Views, not of subscribers. */
  readonly entryCount: number;
  readonly subscriberCount: number;
  stop(): Promise<void>;
}

// ─── Registry ───────────────────────────────────────────────────────

interface Subscriber {
  subId: string;
  owner: object;
  onResult(result: PerspectiveQueryResult): void;
  /**
   * `matchSet` only. A window joining an entry that is already matching
   * rows has seen none of them, so its first push is the WHOLE current set
   * rather than the diff its peers get.
   */
  needsFullSet?: boolean;
}

interface Entry {
  key: string;
  source: PerspectiveQuerySource;
  query: PerspectiveQuerySpec;
  subscribers: Map<string, Subscriber>;
  view: SafeView | null;
  /** Ids currently matching — `matchSet` only. */
  matched: Set<string>;
  /** Last scalar answer, replayed to a late joiner so it need not wait a tick. */
  last: PerspectiveQueryResult | null;
  releases: (() => void)[];
  timer: unknown;
  running: boolean;
  again: boolean;
  disposed: boolean;
}

const REFUSED = (reason: string): PerspectiveQueryResult => ({ kind: 'refused', reason });

/** Filter half of a query, in the shape `toPerspectiveViewConfig` takes. */
function filterState(query: PerspectiveQueryFilterState) {
  return {
    filterModel: (query.filterModel ?? null) as Record<string, AgFilterItem> | null,
    quickFilterText: query.quickFilterText,
    quickFilterColumns: query.quickFilterColumns,
  };
}

/** A boolean expression column plus the clause that selects it. */
function expressionConfig(source: string, columns?: readonly string[]): PerspectiveViewConfig {
  const config: PerspectiveViewConfig = {
    expressions: { [MATCH_COLUMN]: source },
    filter: [[MATCH_COLUMN, '==', true]],
  };
  if (columns && columns.length > 0) config.columns = [...columns];
  return config;
}

/**
 * The View config a query translates to, or `null` for queries that need no
 * View at all (`changeRule` is driven by the feed's shadow map).
 */
export function toQueryViewConfig(
  query: PerspectiveQuerySpec,
  keyColumn: string,
): PerspectiveViewConfig | null {
  switch (query.kind) {
    case 'count':
      return toPerspectiveViewConfig(filterState(query));
    case 'countExpression':
      return expressionConfig(query.source);
    case 'aggregate': {
      const base = toPerspectiveViewConfig(filterState(query));
      return {
        ...base,
        expressions: { ...(base.expressions ?? {}), [TOTAL_GROUP]: "'ALL'" },
        group_by: [TOTAL_GROUP],
        aggregates: { ...(base.aggregates ?? {}), [query.colId]: query.aggregate },
      };
    }
    case 'distinctValues':
      return { group_by: [query.colId], columns: [query.colId] };
    case 'matchSet':
      return expressionConfig(query.source, [keyColumn, ...(query.columns ?? [])]);
    case 'changeRule':
      return null;
  }
}

/**
 * Registry key. Two subscriptions collide here exactly when they should
 * share a View — which is why the key is over the TRANSLATED config, not
 * over the request: two windows can reach the same filter through different
 * saved profiles, and it is the View they should share.
 */
export function queryRegistryKey(
  tableName: string,
  query: PerspectiveQuerySpec,
  keyColumn: string,
): string {
  const config = toQueryViewConfig(query, keyColumn);
  const discriminator =
    query.kind === 'changeRule'
      ? // `ruleId` is carried into every hit, so two rules with identical
        // parameters must NOT share an entry — the second would receive the
        // first one's id.
        JSON.stringify([
          query.ruleId,
          query.field,
          query.mode,
          query.changeMode ?? null,
          query.threshold ?? null,
          query.direction ?? null,
          query.expression ?? null,
        ])
      : query.kind === 'distinctValues'
        ? JSON.stringify([query.colId, query.limit ?? null])
        : query.kind === 'aggregate'
          ? JSON.stringify([query.colId, query.aggregate, viewConfigKey(config!)])
          : viewConfigKey(config!);
  return `${tableName} ${query.kind} ${discriminator}`;
}

export function createPerspectiveQueryEngine(
  opts: PerspectiveQueryEngineOpts = {},
): PerspectiveQueryEngine {
  const {
    recomputeThrottleMs = DEFAULT_RECOMPUTE_THROTTLE_MS,
    distinctValuesLimit = DEFAULT_DISTINCT_VALUES_LIMIT,
    matchSetSnapshotCap = DEFAULT_MATCH_SET_SNAPSHOT_CAP,
    setTimer = (cb, ms) => setTimeout(cb, ms),
    clearTimer = (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
    expressionEngine,
    onError = () => {},
  } = opts;

  const entries = new Map<string, Entry>();
  const bySubId = new Map<string, Entry>();
  let stopped = false;

  // ─── Publish ──────────────────────────────────────────────────────

  function publish(entry: Entry, result: PerspectiveQueryResult): void {
    for (const sub of [...entry.subscribers.values()]) {
      deliver(sub, result);
    }
  }

  function deliver(sub: Subscriber, result: PerspectiveQueryResult): void {
    try {
      sub.onResult(result);
    } catch (err) {
      // A throwing sink is one window's problem; the rest must still be fed.
      onError('read', err);
    }
  }

  // ─── Reads ────────────────────────────────────────────────────────

  async function ensureView(entry: Entry): Promise<SafeView | null> {
    if (entry.view) return entry.view;
    const config = toQueryViewConfig(entry.query, entry.source.keyColumn);
    if (!config) return null;
    const view = await entry.source.table.view(config);
    if (entry.disposed) {
      // Built into a torn-down entry: close it here or it leaks a live View
      // recomputing on every table update for nobody.
      await createSafeView(view).close();
      return null;
    }
    entry.view = createSafeView(view);
    return entry.view;
  }

  async function readCount(entry: Entry): Promise<number | null> {
    const view = await ensureView(entry);
    return view ? await view.rows() : null;
  }

  async function computeAggregate(entry: Entry): Promise<PerspectiveQueryResult> {
    const query = entry.query as Extract<PerspectiveQuerySpec, { kind: 'aggregate' }>;
    if (!isFilterModelMappable(filterState(query).filterModel)) {
      return { kind: 'aggregate', value: null };
    }
    const view = await ensureView(entry);
    if (!view) return { kind: 'aggregate', value: null };
    // Row 0 of the single synthetic group IS the total over the filtered book.
    const columns = await view.read({ start_row: 0, end_row: 1 });
    const cell = columns?.[query.colId]?.[0];
    return { kind: 'aggregate', value: typeof cell === 'number' ? cell : null };
  }

  async function computeDistinctValues(entry: Entry): Promise<PerspectiveQueryResult> {
    const query = entry.query as Extract<PerspectiveQuerySpec, { kind: 'distinctValues' }>;
    const ceiling = Math.min(query.limit ?? distinctValuesLimit, distinctValuesLimit);
    const view = await ensureView(entry);
    if (!view) return REFUSED('no view');
    const rows = await view.rows();
    if (rows === null) return REFUSED('view closed while reading distinct values');
    // Row 0 is the grand total of the grouped View, not a value.
    const distinct = Math.max(0, rows - 1);
    if (distinct > ceiling) {
      return REFUSED(
        `Column '${query.colId}' has ${distinct} distinct values, past the `
          + `${ceiling}-value ceiling. Refusing rather than returning a truncated list.`,
      );
    }
    const columns = await view.read({ start_row: 1, end_row: rows });
    const paths = columns?.__ROW_PATH__;
    if (!Array.isArray(paths)) return { kind: 'distinctValues', values: [] };
    const values = paths.map((path) =>
      Array.isArray(path) && path.length > 0 ? path[path.length - 1] : null,
    );
    return { kind: 'distinctValues', values };
  }

  async function computeMatchSet(entry: Entry): Promise<PerspectiveQueryResult | null> {
    const query = entry.query as PerspectiveMatchSetQuery;
    const view = await ensureView(entry);
    if (!view) return REFUSED('no view');
    const rows = await view.rows();
    if (rows === null) return REFUSED('view closed while reading matches');
    const columns = (rows > 0 ? await view.read({ start_row: 0, end_row: rows }) : {}) ?? {};

    const { keyColumn } = entry.source;
    const ids = (columns[keyColumn] ?? []).map((v) => String(v));
    const next = new Set(ids);
    const previous = entry.matched;
    entry.matched = next;

    const snapshotOf = (index: number): PerspectiveRowSnapshot => {
      const data: Record<string, unknown> = {};
      for (const name of query.columns ?? []) data[name] = columns[name]?.[index];
      return { id: ids[index], data };
    };

    const newlyUnmatched = [...previous].filter((id) => !next.has(id));
    const enteredIdx: number[] = [];
    for (let i = 0; i < ids.length; i++) if (!previous.has(ids[i])) enteredIdx.push(i);

    // Every subscriber shares one read; only the SHAPE of their push
    // differs, so a window that joined mid-flight sees the set it walked
    // into rather than a diff against a history it never had.
    for (const sub of [...entry.subscribers.values()]) {
      if (sub.needsFullSet) {
        sub.needsFullSet = false;
        deliver(sub, matchSetPush(ids.map((_, i) => i), [], snapshotOf, matchSetSnapshotCap));
        continue;
      }
      deliver(sub, matchSetPush(enteredIdx, newlyUnmatched, snapshotOf, matchSetSnapshotCap));
    }
    // Already delivered per-subscriber.
    return null;
  }

  async function computeResult(entry: Entry): Promise<PerspectiveQueryResult | null> {
    switch (entry.query.kind) {
      case 'count': {
        if (!isFilterModelMappable(filterState(entry.query).filterModel)) {
          return { kind: 'count', count: null };
        }
        return { kind: 'count', count: await readCount(entry) };
      }
      case 'countExpression':
        return { kind: 'countExpression', count: await readCount(entry) };
      case 'aggregate':
        return computeAggregate(entry);
      case 'distinctValues':
        return computeDistinctValues(entry);
      case 'matchSet':
        return computeMatchSet(entry);
      case 'changeRule':
        // Driven by the feed's shadow map, not by re-reading the Table.
        return null;
    }
  }

  // ─── Throttled recompute ──────────────────────────────────────────

  function schedule(entry: Entry): void {
    if (entry.disposed || stopped || entry.timer !== null) return;
    entry.timer = setTimer(() => {
      entry.timer = null;
      void run(entry);
    }, recomputeThrottleMs);
  }

  async function run(entry: Entry): Promise<void> {
    if (entry.disposed || stopped) return;
    // Serialized deliberately: reads queue over one ProxySession, so
    // overlapping recomputes of one entry only lengthen the queue the
    // user's block reads are waiting in.
    if (entry.running) {
      entry.again = true;
      return;
    }
    entry.running = true;
    try {
      const result = await computeResult(entry);
      if (entry.disposed || result === null) return;
      entry.last = result;
      publish(entry, result);
    } catch (err) {
      onError('view', err);
      if (!entry.disposed) publish(entry, REFUSED(messageOf(err)));
    } finally {
      entry.running = false;
      if (entry.again && !entry.disposed) {
        entry.again = false;
        schedule(entry);
      }
    }
  }

  // ─── changeRule ───────────────────────────────────────────────────

  function attachChangeRule(entry: Entry): string | null {
    const query = entry.query as PerspectiveChangeRuleQuery;
    const changes = entry.source.changes;
    if (!changes) {
      return `Provider '${entry.source.tableName}' exposes no field-change feed, so `
        + 'a changeRule subscription would never fire.';
    }
    if (query.mode === 'dataChange' && !expressionEngine) {
      return 'This worker was built without an expression engine, so a dataChange '
        + 'rule cannot be evaluated here.';
    }
    entry.releases.push(changes.watch([query.field]));
    entry.releases.push(
      changes.onChanges((batch) => {
        if (entry.disposed) return;
        const hits = evaluateChanges(query, batch);
        if (hits.length > 0) publish(entry, { kind: 'changeRule', hits });
      }),
    );
    return null;
  }

  function evaluateChanges(
    query: PerspectiveChangeRuleQuery,
    batch: readonly PerspectiveRowFieldChange[],
  ): PerspectiveAlertHit[] {
    const hits: PerspectiveAlertHit[] = [];
    for (const change of batch) {
      if (change.field !== query.field) continue;
      try {
        const hit =
          query.mode === 'relativeChange'
            ? computeRelativeChange(
                toRelativeChangeRule(query),
                change.key,
                change.oldValue,
                change.newValue,
              )
            : evaluateDataChangeRule(
                toDataChangeRule(query),
                {
                  rowId: change.key,
                  data: change.row,
                  changedColumn: change.field,
                  value: change.newValue,
                },
                expressionEngine!,
              );
        if (hit) hits.push(hit);
      } catch (err) {
        onError('change', err);
      }
    }
    return hits;
  }

  // ─── Public surface ───────────────────────────────────────────────

  function disposeEntry(entry: Entry): Promise<void> {
    entry.disposed = true;
    if (entry.timer !== null) {
      clearTimer(entry.timer);
      entry.timer = null;
    }
    for (const release of entry.releases.splice(0)) {
      try {
        release();
      } catch {
        /* a release that already ran is not an error */
      }
    }
    entries.delete(entry.key);
    const view = entry.view;
    entry.view = null;
    // `close()` drains in-flight reads BEFORE deleting. Skipping that is
    // the uncatchable crash this whole module is arranged around.
    return view ? view.close() : Promise.resolve();
  }

  return {
    get entryCount() {
      return entries.size;
    },
    get subscriberCount() {
      return bySubId.size;
    },

    subscribe(sub: PerspectiveQuerySubscription): void {
      if (stopped) {
        sub.onResult(REFUSED('The Perspective query engine is stopped.'));
        return;
      }
      if (bySubId.has(sub.subId)) return;

      const key = queryRegistryKey(sub.source.tableName, sub.query, sub.source.keyColumn);
      let entry = entries.get(key);
      const fresh = entry === undefined;
      if (!entry) {
        entry = {
          key,
          source: sub.source,
          query: sub.query,
          subscribers: new Map(),
          view: null,
          matched: new Set(),
          last: null,
          releases: [],
          timer: null,
          running: false,
          again: false,
          disposed: false,
        };
        entries.set(key, entry);
      }

      const subscriber: Subscriber = {
        subId: sub.subId,
        owner: sub.owner,
        onResult: sub.onResult,
        needsFullSet: sub.query.kind === 'matchSet',
      };
      entry.subscribers.set(sub.subId, subscriber);
      bySubId.set(sub.subId, entry);

      if (fresh) {
        if (sub.query.kind === 'changeRule') {
          const refusal = attachChangeRule(entry);
          if (refusal) {
            void disposeEntry(entry);
            bySubId.delete(sub.subId);
            deliver(subscriber, REFUSED(refusal));
            return;
          }
        } else {
          entry.releases.push(entry.source.onUpdate(() => schedule(entry!)));
        }
      }

      // A late joiner to a scalar entry gets the standing answer at once
      // instead of waiting out a throttle window for a question already
      // answered. `matchSet` and `changeRule` carry transitions, which
      // replaying would misreport, so they wait for the next evaluation —
      // which for `matchSet` is the full-set push scheduled below.
      if (entry.last && subscriber.needsFullSet !== true) {
        deliver(subscriber, entry.last);
      } else if (sub.query.kind !== 'changeRule') {
        void run(entry);
      }
    },

    unsubscribe(subId: string): void {
      const entry = bySubId.get(subId);
      if (!entry) return;
      bySubId.delete(subId);
      entry.subscribers.delete(subId);
      // The View outlives one window on purpose — that is the dedupe. It
      // goes when the LAST subscriber does.
      if (entry.subscribers.size === 0) void disposeEntry(entry);
    },

    releaseOwner(owner: object): void {
      for (const [subId, entry] of [...bySubId]) {
        if (entry.subscribers.get(subId)?.owner !== owner) continue;
        bySubId.delete(subId);
        entry.subscribers.delete(subId);
        if (entry.subscribers.size === 0) void disposeEntry(entry);
      }
    },

    async stop(): Promise<void> {
      stopped = true;
      bySubId.clear();
      for (const entry of [...entries.values()]) await disposeEntry(entry);
      entries.clear();
    },
  };
}

// ─── Helpers ────────────────────────────────────────────────────────

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * One `matchSet` push, or a refusal when the transition is too large to
 * carry. The matched set has already advanced by the time this runs, so a
 * refusal costs this transition and not the next one.
 */
function matchSetPush(
  enteredIdx: readonly number[],
  newlyUnmatched: readonly string[],
  snapshotOf: (index: number) => PerspectiveRowSnapshot,
  cap: number,
): PerspectiveQueryResult {
  if (enteredIdx.length > cap) {
    return REFUSED(
      `${enteredIdx.length} rows newly matched at once, past the ${cap}-row snapshot `
        + 'cap. Refusing rather than shipping a truncated prefix.',
    );
  }
  return {
    kind: 'matchSet',
    newlyMatched: enteredIdx.map(snapshotOf),
    newlyUnmatched: [...newlyUnmatched],
  };
}

/**
 * Rebuild the rule shape core's evaluators take. Only the fields they read
 * are populated — this is a call adapter, not a rule store, and inventing a
 * second rule type here is exactly what "do not write a second evaluator"
 * rules out.
 */
function toRelativeChangeRule(query: PerspectiveChangeRuleQuery): RelativeChangeRule {
  return {
    id: query.ruleId,
    name: query.ruleId,
    enabled: true,
    priority: 0,
    severity: 'info',
    trigger: {
      kind: 'relativeChange',
      column: query.field,
      mode: query.changeMode ?? 'ANY_CHANGE',
      ...(query.threshold !== undefined ? { threshold: query.threshold } : {}),
      ...(query.direction !== undefined ? { direction: query.direction } : {}),
    },
  } as RelativeChangeRule;
}

function toDataChangeRule(query: PerspectiveChangeRuleQuery): DataChangeRule {
  return {
    id: query.ruleId,
    name: query.ruleId,
    enabled: true,
    priority: 0,
    severity: 'info',
    trigger: {
      kind: 'dataChange',
      expression: query.expression ?? '',
      column: query.field,
    },
  } as DataChangeRule;
}
