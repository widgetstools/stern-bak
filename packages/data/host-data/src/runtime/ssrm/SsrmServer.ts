import { QueryEngine } from "./QueryEngine.js";
import { RowStore, type TickListener } from "./RowStore.js";
import {
  computeStatusBar,
  type StatusBarRequest,
  type StatusBarSummary,
} from "./statusBar.js";
import type {
  DetailRowsRequest,
  ExpressionRule,
  ICacheIngest,
  Row,
  SetFilterValuesRequest,
  SsrmGetRowsRequest,
  SsrmGetRowsResult,
  TickEvent,
  TreeDataConfig,
} from "./types.js";

export interface SsrmServerOptions {
  keyColumn: string;
  projectFields?: string[];
  tree?: TreeDataConfig | null;
  /**
   * How many loaded blocks of viewport interest to retain per session.
   * Mirrors the grid's `maxBlocksInCache`: AG Grid keeps that many blocks
   * rendered, so the worker must keep ticking all of them.
   */
  maxInterestBlocks?: number;
  /**
   * Trailing-edge window (ms) over which `rows` ticks are accumulated and
   * key-conflated before a single {@link SsrmFlushEvent} is published.
   * Cache ingest (`upsert`/`replaceSnapshot`/`remove`) is never throttled —
   * only the flush notification is windowed. Default `0` = passthrough:
   * one flush per store tick, matching today's per-frame behaviour.
   */
  publishWindowMs?: number;
  /** Injectable timer (hub pattern) — defaults to `setTimeout`. */
  setTimer?: (cb: () => void, ms: number) => unknown;
  /** Injectable timer clear (hub pattern) — defaults to `clearTimeout`. */
  clearTimer?: (handle: unknown) => void;
}

/**
 * Revision-stamped, windowed notification derived from store ticks.
 * Unlike a raw {@link TickEvent}, a flush is always a settled, deduped
 * view: `keys`/`columns` are unions accumulated since the last flush, and
 * `revision` is the store revision AT FLUSH TIME (not at accumulation
 * start), so a consumer that reacts to a flush always sees a consistent
 * snapshot of the store as of that revision.
 */
export interface SsrmFlushEvent {
  type: 'rows' | 'snapshot';
  /** Union of changed keys since the last flush (empty for snapshot). */
  keys: string[];
  /** Union of changed columns since the last flush. */
  columns: string[];
  /** Store revision AT FLUSH TIME — the consistency stamp. */
  revision: number;
  /** Keys accumulated before dedup — `- keys.length` were conflated. */
  updatesAccumulated: number;
}

type FlushListener = (event: SsrmFlushEvent) => void;

/**
 * Identifies which block of which query a `setViewportInterest` call covers.
 * Same `queryId` → interest accumulates across blocks; a new `queryId`
 * (filter/sort/group changed) → prior blocks are discarded.
 */
export interface ViewportInterestScope {
  blockKey: string;
  queryId: string;
  /**
   * Whether the session has an active filter (column filter or quick filter).
   * A filtered session needs *every* changed row, even ones outside its
   * viewport, because a row that starts matching the filter is only
   * discoverable by inspecting it. An unfiltered session needs nothing
   * beyond its viewport.
   */
  hasFilter?: boolean;
}

/** Matches `maxBlocksInCache={20}` on the SSRM grid surfaces. */
const DEFAULT_MAX_INTEREST_BLOCKS = 20;

/** Bucket used when a caller identifies no block (whole-viewport replace). */
const UNSCOPED_BLOCK = '__unscoped__';

interface SessionInterest {
  queryId: string | null;
  /** Insertion-ordered, oldest first — doubles as the LRU list. */
  blocks: Map<string, Set<string>>;
  /** Flattened union of every block, kept for O(1) tick lookups. */
  union: Set<string>;
  hasFilter: boolean;
}

/**
 * High-level SSRM server façade used inside the SharedWorker.
 * Implements {@link ICacheIngest} so any transport can populate the cache.
 */
export class SsrmServer implements ICacheIngest {
  readonly store: RowStore;
  readonly query: QueryEngine;
  private viewportInterest = new Map<string, SessionInterest>();
  private readonly maxInterestBlocks: number;

  // ── Windowed flush ────────────────────────────────────────────────
  private readonly publishWindowMs: number;
  private readonly setTimer: (cb: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private flushListeners = new Set<FlushListener>();
  private pendingKeys = new Set<string>();
  private pendingColumns = new Set<string>();
  private pendingCount = 0;
  private windowTimer: unknown | null = null;
  private readonly unsubscribeTick: () => void;

  constructor(options: SsrmServerOptions) {
    this.maxInterestBlocks = Math.max(
      1,
      options.maxInterestBlocks ?? DEFAULT_MAX_INTEREST_BLOCKS,
    );
    this.publishWindowMs = options.publishWindowMs ?? 0;
    this.setTimer = options.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
    this.clearTimer =
      options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.store = new RowStore({
      keyColumn: options.keyColumn,
      projectFields: options.projectFields,
    });
    this.query = new QueryEngine({
      store: this.store,
      tree: options.tree,
    });
    this.unsubscribeTick = this.store.onTick((event) => this.handleTick(event));
  }

  // ── Ingest ──────────────────────────────────────────────────────────
  replaceSnapshot(rows: Row[]): void {
    this.store.replaceSnapshot(rows);
  }

  upsert(rows: Row[]): void {
    this.store.upsert(rows);
  }

  remove(keys: string[]): void {
    this.store.remove(keys);
  }

  clear(): void {
    this.store.clear();
  }

  // ── Query ───────────────────────────────────────────────────────────
  getRows(request: SsrmGetRowsRequest): SsrmGetRowsResult {
    return this.query.getRows(request);
  }

  getSetFilterValues(req: SetFilterValuesRequest): string[] {
    return this.query.getSetFilterValues(req);
  }

  getGrandTotal(
    request: Pick<
      SsrmGetRowsRequest,
      "filterModel" | "valueCols" | "quickFilterText"
    >,
  ): Row {
    return this.query.getGrandTotal(request);
  }

  getStatusBar(request: StatusBarRequest = {}): StatusBarSummary {
    return computeStatusBar(this.store, request);
  }

  configureExpressions(rules: ExpressionRule[]): void {
    this.query.configureExpressions(rules);
  }

  configureTree(config: TreeDataConfig | null): void {
    this.query.configureTree(config);
  }

  getDetailRows(request: DetailRowsRequest): Row[] {
    return this.query.getDetailRows(request);
  }

  /**
   * Re-run expression enrichment on rows (e.g. tick payloads before
   * `applyServerSideTransaction` so calculated columns stay populated).
   */
  enrichRows(rows: Row[]) {
    return this.query.enrichRows(rows);
  }

  /** Calculated expression output fields (for cell-flash column targeting). */
  calculatedFields(): string[] {
    return this.query.calculatedFields();
  }

  getStats() {
    return this.store.getStats();
  }

  // ── Tick interest (viewport keys per session) ───────────────────────
  /**
   * Records the rows a session currently has loaded.
   *
   * With a {@link ViewportInterestScope}, interest accumulates across the
   * blocks of one query and is bounded by `maxInterestBlocks` (LRU). Without
   * one, the call replaces the session's interest wholesale.
   */
  setViewportInterest(
    sessionId: string,
    keys: string[],
    scope?: ViewportInterestScope,
  ): void {
    const blockKey = scope?.blockKey ?? UNSCOPED_BLOCK;
    const queryId = scope?.queryId ?? null;

    const previous = this.viewportInterest.get(sessionId);
    // A different query (or an unscoped replace) invalidates prior blocks.
    const entry =
      previous && scope && previous.queryId === queryId
        ? previous
        : {
            queryId,
            blocks: new Map<string, Set<string>>(),
            union: new Set<string>(),
            hasFilter: false,
          };
    entry.hasFilter = scope?.hasFilter ?? false;

    // Re-inserting moves the block to the most-recently-used end.
    entry.blocks.delete(blockKey);
    entry.blocks.set(blockKey, new Set(keys));

    while (entry.blocks.size > this.maxInterestBlocks) {
      const oldest = entry.blocks.keys().next().value;
      if (oldest === undefined) break;
      entry.blocks.delete(oldest);
    }

    entry.union = new Set<string>();
    for (const block of entry.blocks.values()) {
      for (const key of block) entry.union.add(key);
    }

    this.viewportInterest.set(sessionId, entry);
  }

  clearViewportInterest(sessionId: string): void {
    this.viewportInterest.delete(sessionId);
  }

  /**
   * Returns keys from a tick that intersect a session's viewport interest.
   * - No interest entry yet (session not initialized) → all changed keys
   * - Explicit empty interest (e.g. filter matched 0 rows) → none
   *   (returning all keys here caused Loading ↔ No Matching Rows flicker)
   */
  interestedKeys(sessionId: string, changedKeys: string[] | undefined): string[] {
    if (!changedKeys) return [];
    const interest = this.viewportInterest.get(sessionId);
    if (!interest) return changedKeys;
    if (interest.union.size === 0) return [];
    return changedKeys.filter((k) => interest.union.has(k));
  }

  /**
   * Whether a session still needs rows that fall outside its viewport.
   *
   * Only filtered sessions do: a row that changes into matching their filter
   * is invisible to them otherwise. For an unfiltered session, rows outside
   * the viewport are pure waste — enriched and posted for nothing.
   * A session that has not reported a viewport yet gets everything.
   */
  wantsUnmatchedRows(sessionId: string): boolean {
    const interest = this.viewportInterest.get(sessionId);
    return interest ? interest.hasFilter : true;
  }

  onTick(listener: TickListener): () => void {
    return this.store.onTick(listener);
  }

  // ── Windowed flush ────────────────────────────────────────────────
  /**
   * Subscribe to revision-stamped, windowed flush notifications derived
   * from store ticks (see {@link SsrmFlushEvent}). Cache ingest is never
   * throttled — this only windows *notification*. Returns an unsubscribe.
   */
  onFlush(listener: FlushListener): () => void {
    this.flushListeners.add(listener);
    return () => this.flushListeners.delete(listener);
  }

  /**
   * Quiesces flush notification: clears any pending window timer and
   * unsubscribes from the store's raw tick stream, so ingest arriving
   * after `dispose()` no longer re-enters `handleTick` and resumes
   * flushing/re-arming timers. Ingest itself stays ungated — cache writes
   * after `dispose()` still succeed, they just produce no flush. Safe to
   * call with nothing armed (and safe to call more than once).
   */
  dispose(): void {
    this.unsubscribeTick();
    if (this.windowTimer != null) {
      this.clearTimer(this.windowTimer);
      this.windowTimer = null;
    }
    this.pendingKeys.clear();
    this.pendingColumns.clear();
    this.pendingCount = 0;
  }

  private handleTick(event: TickEvent): void {
    if (event.type === 'snapshot') {
      // Snapshot invalidates any accumulation in flight — flush immediately.
      if (this.windowTimer != null) {
        this.clearTimer(this.windowTimer);
        this.windowTimer = null;
      }
      this.pendingKeys.clear();
      this.pendingColumns.clear();
      this.pendingCount = 0;
      this.emitFlush({
        type: 'snapshot',
        keys: [],
        columns: [],
        revision: this.store.getRevision(),
        updatesAccumulated: 0,
      });
      return;
    }

    if (event.type !== 'rows') return;

    if (this.publishWindowMs <= 0) {
      // Passthrough: one flush per store tick (today's per-frame behaviour).
      const keys = [...new Set(event.keys ?? [])];
      this.emitFlush({
        type: 'rows',
        keys,
        columns: [...(event.columns ?? [])],
        revision: this.store.getRevision(),
        updatesAccumulated: (event.keys ?? []).length,
      });
      return;
    }

    // Windowed: accumulate + key-conflate until the trailing-edge timer fires.
    for (const key of event.keys ?? []) {
      this.pendingKeys.add(key);
      this.pendingCount++;
    }
    for (const col of event.columns ?? []) this.pendingColumns.add(col);

    if (this.windowTimer == null) {
      this.windowTimer = this.setTimer(() => this.flushWindow(), this.publishWindowMs);
    }
  }

  private flushWindow(): void {
    this.windowTimer = null;
    const keys = [...this.pendingKeys];
    const columns = [...this.pendingColumns];
    const updatesAccumulated = this.pendingCount;
    this.pendingKeys.clear();
    this.pendingColumns.clear();
    this.pendingCount = 0;
    if (keys.length === 0 && updatesAccumulated === 0) return;
    this.emitFlush({
      type: 'rows',
      keys,
      columns,
      revision: this.store.getRevision(),
      updatesAccumulated,
    });
  }

  /**
   * Fan out to every flush listener, isolating each call so one throwing
   * listener can't block delivery to listeners after it in the loop, and
   * can't propagate back through `RowStore.emit()` and surface out of the
   * `upsert()`/`replaceSnapshot()` call that triggered ingest (matches the
   * hub's own fan-out convention — see `postDataEvent` in
   * `SharedWorkerDataServicesHub.ts`).
   */
  private emitFlush(event: SsrmFlushEvent): void {
    for (const l of this.flushListeners) {
      try {
        l(event);
      } catch {
        // Swallow — a misbehaving listener must not break delivery to
        // other listeners or to the unrelated raw onTick pass-through.
      }
    }
  }
}

export type { TickEvent };
