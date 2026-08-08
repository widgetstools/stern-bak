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
}

/**
 * High-level SSRM server façade used inside the SharedWorker.
 * Implements {@link ICacheIngest} so any transport can populate the cache.
 */
export class SsrmServer implements ICacheIngest {
  readonly store: RowStore;
  readonly query: QueryEngine;
  private viewportInterest = new Map<string, Set<string>>();

  constructor(options: SsrmServerOptions) {
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
  setViewportInterest(sessionId: string, keys: string[]): void {
    this.viewportInterest.set(sessionId, new Set(keys));
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
    if (interest.size === 0) return [];
    return changedKeys.filter((k) => interest.has(k));
  }

  onTick(listener: TickListener): () => void {
    return this.store.onTick(listener);
  }
}

export type { TickEvent };
