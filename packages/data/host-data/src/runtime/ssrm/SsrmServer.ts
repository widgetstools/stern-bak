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
}

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

  constructor(options: SsrmServerOptions) {
    this.maxInterestBlocks = Math.max(
      1,
      options.maxInterestBlocks ?? DEFAULT_MAX_INTEREST_BLOCKS,
    );
    this.store = new RowStore({
      keyColumn: options.keyColumn,
      projectFields: options.projectFields,
    });
    this.query = new QueryEngine({
      store: this.store,
      tree: options.tree,
    });
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
}

export type { TickEvent };
