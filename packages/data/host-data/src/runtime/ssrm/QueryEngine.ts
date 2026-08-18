import { getPathAccessor } from "@wellsfargo-starui/types";
import { resolveAggFunc } from "./aggregations.js";
import { ExpressionRuleStore, type AggregateScope } from "./expressionRules.js";
import {
  aggregateValueCols,
  collectPivotResultFields,
  pivotAggregate,
} from "./queryAggregation.js";
import { sortGroupRows, sortRows } from "./querySort.js";
import {
  buildQuickFilterText,
  parseQuickFilter,
  rowPassesQuickFilter,
  rowPassesQuickFilterScoped,
} from "./quickFilter.js";
import type { RowStore } from "./RowStore.js";
import { SessionOverlay, type SessionQueryState } from "./SessionOverlay.js";
import {
  buildTreeIndex,
  rowHasDetail,
  treeKeyField,
} from "./treeIndex.js";
import type {
  DetailRowsRequest,
  EnrichedRow,
  ExpressionRule,
  Row,
  SetFilterValuesRequest,
  SsrmGetRowsRequest,
  SsrmGetRowsResult,
  TreeDataConfig,
} from "./types.js";
import {
  assertFilterModelSupported,
  compileRowExclusion,
  doesRowMatchFilterModel,
  ExpressionEngine,
} from "@wellsfargo-starui/core";

export interface QueryEngineOptions {
  store: RowStore;
  expressionEngine?: ExpressionEngine;
  tree?: TreeDataConfig | null;
  /**
   * How many distinct query orders to retain. One plane serves every grid on
   * the provider, so this is sized for "a few grids each scrolling their own
   * view", not for one. `0` disables caching.
   */
  orderCacheSize?: number;
}

/**
 * Memo entries kept per plane. One query shape contributes up to four
 * (filtered set, leaf/group order, grand total, pivot fields), and one plane
 * serves every grid on the provider — so this is roughly "six concurrent
 * query shapes". The row arrays hold references, not copies: at 100k rows an
 * order entry is ~800 KB, so the whole cache stays in the low tens of MB.
 */
export const DEFAULT_ORDER_CACHE_SIZE = 24;

/**
 * A materialised query order, valid only for the store revision it was built
 * from. Any ingest (snapshot, tick, removal) bumps the revision and strands
 * every entry, which is what keeps the cache from ever serving stale rows.
 */
interface CachedEntry {
  revision: number;
  value: unknown;
}

/**
 * SSRM query plane: filter → group → sort → page, plus set-filter values
 * and expression enrichment on returned blocks.
 *
 * Row values are read through the repo's cached path accessors, so a column
 * whose field is a dot path (`quote.bid`) filters, sorts, groups and
 * aggregates on the nested value the projector kept — see
 * `providers/fieldProjection.ts`.
 *
 * Anything the engine cannot evaluate — an unknown filter operator, an
 * unknown `aggFunc` — is REFUSED (`UnsupportedQueryError`), once per query
 * and before any row is scanned. The alternative, which this replaced, was a
 * `default:` arm that answered a different question and said nothing.
 */
export class QueryEngine {
  private readonly store: RowStore;
  private readonly exprRules: ExpressionRuleStore;
  /** Per-session edits and row exclusions — see {@link SessionOverlay}. */
  private readonly overlay: SessionOverlay;
  private detachTick: (() => void) | null = null;
  private tree: TreeDataConfig | null = null;
  /** Insertion-ordered = LRU. Keyed by query shape, never by row window. */
  private readonly orderCache = new Map<string, CachedEntry>();
  private orderCacheSize: number;
  /** Whole-store aggregate view for calculated columns, bound to the store
   *  revision that built it. See {@link aggregateScope}. */
  private aggScope: { revision: number; scope: AggregateScope } | null = null;
  /** Observability — see {@link getMemoStats}. */
  private memoHits = 0;
  private memoMisses = 0;

  constructor(options: QueryEngineOptions) {
    this.store = options.store;
    this.overlay = new SessionOverlay(options.store.keyColumn);
    this.exprRules = new ExpressionRuleStore(options.expressionEngine);
    this.tree = options.tree ?? null;
    this.orderCacheSize = options.orderCacheSize ?? DEFAULT_ORDER_CACHE_SIZE;

    // Source wins. When the store re-delivers a row, its values are the truth
    // for the FIELDS it carried, so those patches are dropped — per field, so
    // a tick that moves `price` does not silently discard a pending edit to a
    // different column of the same row. The listener is a no-op while no
    // session holds an overlay, which is the normal case.
    this.detachTick = options.store.onTick((event) => {
      if (!this.overlay.active) return;
      if (event.keys?.length) this.overlay.onSourceRows(event.keys, event.columns);
      // A snapshot replaces everything, so nothing pending survives it.
      else if (event.type === "snapshot") this.overlay.clearAll();
    });
  }

  /** Detach the store listener. Idempotent. */
  dispose(): void {
    this.detachTick?.();
    this.detachTick = null;
  }

  /**
   * Resizes the memo. One live session (blotter) contributes up to a
   * handful of concurrent entries (filtered set, leaf/group order, grand
   * total, pivot fields) across its sort/group/filter variants, so callers
   * size this off the live session count rather than a fixed constant —
   * see {@link SsrmServer}, which recomputes this on every viewport-interest
   * change. Shrinking evicts the oldest entries down to the new size
   * immediately; growing takes effect on the next `memo()` call.
   */
  setOrderCacheSize(n: number): void {
    this.orderCacheSize = n;
    while (this.orderCache.size > this.orderCacheSize) {
      const oldest = this.orderCache.keys().next().value;
      if (oldest === undefined) break;
      this.orderCache.delete(oldest);
    }
  }

  /**
   * Memoises a materialised row order for one query shape.
   *
   * `startRow` / `endRow` are deliberately absent from every cache key: the
   * whole point is that paging through a query reuses one order. Entries are
   * bound to `store.getRevision()`, so a tick invalidates them rather than
   * being papered over.
   */
  private memo<T>(key: string, build: () => T): T {
    if (this.orderCacheSize <= 0) return build();
    const revision = this.store.getRevision();
    const hit = this.orderCache.get(key);
    if (hit && hit.revision === revision) {
      this.memoHits++;
      // Refresh LRU position.
      this.orderCache.delete(key);
      this.orderCache.set(key, hit);
      return hit.value as T;
    }
    this.memoMisses++;
    const value = build();
    this.orderCache.delete(key);
    this.orderCache.set(key, { revision, value });
    while (this.orderCache.size > this.orderCacheSize) {
      const oldest = this.orderCache.keys().next().value;
      if (oldest === undefined) break;
      this.orderCache.delete(oldest);
    }
    return value;
  }

  private cachedOrder(key: string, build: () => Row[]): Row[] {
    return this.memo(key, build);
  }

  /**
   * Everything that changes *which* rows match, and in what order — INCLUDING
   * the requesting session's own overlay. Every order derived from a query has
   * to carry it: a session's pending edits and exclusions change the row set
   * and its order, so an entry built for one session is not an answer for
   * another. `sessionIdentity` is `''` for a session with no overlay, which is
   * almost all of them, and those keep sharing one entry.
   */
  private static queryKey(
    request: SsrmGetRowsRequest,
    kind: string,
    extra?: unknown,
    sessionIdentity = "",
  ): string {
    return JSON.stringify([
      kind,
      sessionIdentity,
      request.filterModel ?? null,
      request.quickFilterText ?? '',
      // Only when a quick filter is actually running: the column scope has no
      // effect without one, and a 100-name array in every key would grow the
      // hot path's string for nothing.
      request.quickFilterText ? request.quickFilterColumns ?? null : null,
      request.sortModel ?? null,
      request.groupKeys ?? null,
      request.rowGroupCols?.map((c) => c.field) ?? null,
      extra ?? null,
    ]);
  }

  /**
   * Refuse a query naming something this engine cannot evaluate, before any
   * work happens. Deterministic by construction: it reads the request, never
   * the rows, so an empty store refuses exactly what a full one does.
   */
  private static assertSupported(
    request: Pick<SsrmGetRowsRequest, "filterModel" | "valueCols">,
  ): void {
    assertFilterModelSupported(request.filterModel);
    for (const col of request.valueCols ?? []) {
      if (col.field) resolveAggFunc(col.aggFunc);
    }
  }

  /** Drops every memoised order. Called when expression rules change. */
  private invalidateOrderCache(): void {
    this.orderCache.clear();
  }

  configureTree(config: TreeDataConfig | null): void {
    this.tree = config;
    this.invalidateOrderCache();
  }

  /**
   * `sessionId` omitted = configures the GLOBAL rule set (today's behaviour,
   * keyed internally under `''`) — every session that hasn't configured its
   * own rules resolves to it. See {@link ExpressionRuleStore}.
   */
  configureExpressions(rules: ExpressionRule[], sessionId?: string): void {
    this.exprRules.configure(rules, sessionId);
    this.invalidateOrderCache();
  }

  /** Drops one session's own rules (called on session detach). Global rules are untouched. */
  clearSessionExpressions(sessionId: string): void {
    this.exprRules.clearSession(sessionId);
    this.overlay.clear(sessionId);
  }

  /**
   * Record a session's pending edits, so its own queries see them and a block
   * refetch stops discarding them.
   *
   * Deliberately NOT written into the shared `RowStore`: that store is
   * per-provider and shared by every grid attached to it, so an edit written
   * there would appear in every other window — which a client-side grid does
   * not do (its transaction takes a copy of the row) and which nobody asked
   * for. Roadmap Phase 4, decision 1.
   */
  setSessionPatches(
    sessionId: string,
    patches: ReadonlyArray<{ key: string; fields: Row }>,
  ): void {
    this.overlay.setPatches(sessionId, patches);
  }

  /** Forget a session's edits — all, or just the named rows. */
  clearSessionPatches(sessionId: string, keys?: readonly string[]): void {
    this.overlay.clearPatches(sessionId, keys);
  }

  /**
   * Install a session's row-exclusion rule from its EXPRESSION — the
   * exclude-when-true string the customizer's Custom Settings panel holds.
   * `null` or an unparseable rule clears it.
   *
   * The expression rather than a predicate, because the expression is what
   * crosses the worker boundary: a function does not survive a structured
   * clone. It compiles here, on the engine this plane already uses for
   * calculated columns, through `@wellsfargo-starui/core`'s
   * {@link compileRowExclusion} — the same compiler the client-side external
   * filter uses, so a rule cannot mean one thing in a CSRM grid and another
   * here.
   *
   * Applied before paging, so counts, totals and scroll position agree with
   * what the user sees. The client-side external filter could never do that
   * under this row model: AG Grid only consults `doesExternalFilterPass` from
   * its client-side filtering stage, so under SSRM the rule was inert and
   * `rowCount` — which the scrollbar is built from — counted excluded rows.
   */
  setSessionExclude(sessionId: string, expression: string | null): void {
    this.overlay.setExclude(
      sessionId,
      compileRowExclusion(this.exprRules.engine, expression),
    );
  }

  getRows(request: SsrmGetRowsRequest, sessionId?: string): SsrmGetRowsResult {
    QueryEngine.assertSupported(request);
    if (this.tree?.enabled) {
      return this.treeBlock(request, sessionId);
    }

    const groupCols = request.rowGroupCols ?? [];
    const groupKeys = request.groupKeys ?? [];
    const pivotCols = request.pivotCols ?? [];
    const pivoting = Boolean(request.pivotMode) || pivotCols.length > 0;
    const sep = request.pivotResultFieldSeparator ?? "_";
    // One identity for every cache key this query derives — '' when the
    // session has no overlay, which keeps clean sessions on the shared entries.
    const sessionKey = this.overlay.stateFor(sessionId)?.identity ?? "";
    const filtered = this.collectFilteredCached(request, sessionId);

    // Both scan the whole filtered set and neither depends on the row window,
    // so without memoising they would re-run per block and cancel out the
    // order cache entirely whenever value columns are configured.
    const pivotResultFields = pivoting
      ? this.memo(
          QueryEngine.queryKey(request, "pivotFields", [
            pivotCols.map((c) => c.field),
            request.valueCols ?? null,
            sep,
          ], sessionKey),
          () => collectPivotResultFields(filtered, pivotCols, request.valueCols, sep),
        )
      : undefined;

    const grandTotalData =
      groupKeys.length === 0 && (request.valueCols?.length ?? 0) > 0
        ? this.memo(
            QueryEngine.queryKey(request, "grandTotal", [
              request.valueCols ?? null,
              pivotCols.map((c) => c.field),
              pivoting,
              sep,
            ], sessionKey),
            () =>
              pivoting
                ? pivotAggregate(filtered, pivotCols, request.valueCols, sep)
                : aggregateValueCols(filtered, request.valueCols),
          )
        : undefined;

    // Leaf level: all group keys provided.
    if (groupKeys.length >= groupCols.length) {
      const leaf = this.leafBlock(filtered, request, groupCols, groupKeys, sessionId);
      return {
        ...leaf,
        grandTotalData,
        pivotResultFields,
      };
    }

    const group = this.groupBlock(filtered, request, groupCols, groupKeys, sessionId);
    return { ...group, grandTotalData, pivotResultFields };
  }

  /**
   * One block of an intermediate group level: bucket the scoped rows by the
   * level's field, aggregate each bucket into a group row, sort, then page.
   *
   * Bucketing + per-group aggregation + sort is the expensive part and is
   * window-independent, so every block of one query reuses a single ordered
   * array — the cache key carries the aggregation inputs because they change
   * the group rows themselves.
   */
  private groupBlock(
    filtered: Row[],
    request: SsrmGetRowsRequest,
    groupCols: NonNullable<SsrmGetRowsRequest["rowGroupCols"]>,
    groupKeys: string[],
    sessionId?: string,
  ): SsrmGetRowsResult {
    const field = groupCols[groupKeys.length]!.field;
    const pivotCols = request.pivotCols ?? [];
    const pivoting = Boolean(request.pivotMode) || pivotCols.length > 0;
    const sep = request.pivotResultFieldSeparator ?? "_";
    const sessionKey = this.overlay.stateFor(sessionId)?.identity ?? "";
    const scoped = this.scopeToGroupPath(filtered, groupCols, groupKeys);

    const groups = this.cachedOrder(
      QueryEngine.queryKey(request, "groups", [
        field,
        request.valueCols ?? null,
        pivotCols.map((c) => c.field),
        pivoting,
        sep,
      ], sessionKey),
      () => {
        const readGroup = getPathAccessor(field);
        const buckets = new Map<string, Row[]>();
        for (const row of scoped) {
          const key = String(readGroup(row) ?? "");
          let list = buckets.get(key);
          if (!list) {
            list = [];
            buckets.set(key, list);
          }
          list.push(row);
        }

        const built = [...buckets.entries()].map(([key, rows]) => ({
          ...(pivoting
            ? pivotAggregate(rows, pivotCols, request.valueCols, sep)
            : aggregateValueCols(rows, request.valueCols)),
          [field]: key,
          __ssrmGroupKey: key,
          // Distinct child groups at next level, or leaf count when next is leaf.
          __ssrmChildCount: this.childCountForGroup(
            rows,
            groupCols,
            groupKeys.length + 1,
          ),
        }) as Row);

        return sortGroupRows(built, request.sortModel, field);
      },
    );

    const start = request.startRow ?? 0;
    const end = request.endRow ?? groups.length;
    return {
      rowData: groups.slice(start, end).map((g) => this.enrich(g, sessionId)),
      rowCount: groups.length,
    };
  }

  getSetFilterValues(req: SetFilterValuesRequest): string[] {
    QueryEngine.assertSupported({ filterModel: req.filterModel });
    const fm = { ...(req.filterModel ?? {}) } as Record<string, unknown>;
    delete fm[req.column];

    const groupKeys = req.groupKeys;
    const groupCols = req.rowGroupCols ?? [];
    const groupReaders = groupCols.map((c) => getPathAccessor(c.field ?? ""));
    const inGroupPath = (row: Row): boolean => {
      if (!groupKeys) return true;
      return groupKeys.every(
        (gk, i) => String(groupReaders[i]?.(row) ?? "") === gk,
      );
    };

    // Reuses the per-query memo (revision-bound), then narrows by group path
    // — a colour-link publish right after a block load pays no fresh scan.
    const filtered = this.collectFilteredCached({
      filterModel: Object.keys(fm).length > 0 ? fm : null,
      quickFilterText: req.quickFilterText,
      quickFilterColumns: req.quickFilterColumns,
    });
    const readValue = getPathAccessor(req.column);
    const seen = new Set<string>();
    for (const row of filtered) {
      if (!inGroupPath(row)) continue;
      const v = readValue(row);
      seen.add(v == null ? "" : String(v));
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  }

  getGrandTotal(
    request: Pick<
      SsrmGetRowsRequest,
      "filterModel" | "valueCols" | "quickFilterText" | "quickFilterColumns"
    >,
  ): Row {
    QueryEngine.assertSupported(request);
    const filtered = this.collectFilteredCached(request);
    return aggregateValueCols(filtered, request.valueCols);
  }

  /**
   * Apply configured expression rules to rows (calculated / style / alert / editable).
   * Used by `getRows` and by live tick fan-out so `applyServerSideTransaction`
   * patches carry the same enriched fields as SSRM blocks.
   */
  enrichRows(rows: Row[], sessionId?: string): EnrichedRow[] {
    return rows.map((r) => this.enrich(r, sessionId));
  }

  /** Field names produced by configured `calculated` expression rules. */
  calculatedFields(sessionId?: string): string[] {
    return this.exprRules.calculatedFields(sessionId);
  }

  /** Cumulative order-cache (`memo()`) hit/miss counts, for {@link SsrmServer.getStats}. */
  getMemoStats(): { memoHits: number; memoMisses: number } {
    return { memoHits: this.memoHits, memoMisses: this.memoMisses };
  }

  /**
   * Master-detail: detail rows for a master key (embedded array or related rows).
   */
  getDetailRows(req: DetailRowsRequest): Row[] {
    const master = this.store.getRow(req.masterKey);
    if (req.detailField) {
      if (!master) return [];
      const raw = getPathAccessor(req.detailField)(master);
      return Array.isArray(raw) ? (raw as Row[]).map((r) => ({ ...r })) : [];
    }
    const parentField =
      req.detailParentField ??
      this.tree?.parentField ??
      "parentId";
    const readParent = getPathAccessor(parentField);
    const out: Row[] = [];
    for (const row of this.store.iterate()) {
      if (String(readParent(row) ?? "") === String(req.masterKey)) {
        out.push(this.enrich({ ...row }));
      }
    }
    return out;
  }

  // ── Tree data ───────────────────────────────────────────────────────

  /**
   * One block of a tree query. The index builders live in `treeIndex.ts`;
   * what stays here is the part that shares sorting, aggregation and
   * enrichment with every other block path.
   */
  private treeBlock(request: SsrmGetRowsRequest, sessionId?: string): SsrmGetRowsResult {
    const filtered = this.collectFilteredCached(request);
    const groupKeys = request.groupKeys ?? [];
    const keyField = treeKeyField(this.tree, this.store);
    const index = buildTreeIndex(this.store, this.tree, filtered, keyField);

    let nodes: Row[];
    if (groupKeys.length === 0) {
      nodes = index.roots;
    } else {
      const parentKey = groupKeys[groupKeys.length - 1]!;
      nodes = index.childrenOf.get(parentKey) ?? [];
    }

    nodes = sortRows(nodes, request.sortModel, keyField);

    const readKey = getPathAccessor(keyField);
    const start = request.startRow ?? 0;
    const end = request.endRow ?? nodes.length;
    const slice = nodes.slice(start, end).map((r) => {
      const key = String(readKey(r) ?? "");
      const childCount = (index.childrenOf.get(key) ?? []).length;
      const hasDetail = rowHasDetail(r);
      const out: EnrichedRow = {
        ...this.enrich(r, sessionId),
        __ssrmTreeGroup: childCount > 0,
        group: childCount > 0,
        __ssrmChildCount: childCount,
        __ssrmGroupKey: key,
        __ssrmHasDetail: hasDetail,
      };
      return out;
    });

    const grandTotalData =
      groupKeys.length === 0 && (request.valueCols?.length ?? 0) > 0
        ? aggregateValueCols(filtered, request.valueCols)
        : undefined;

    return {
      rowData: slice,
      rowCount: nodes.length,
      grandTotalData,
    };
  }

  /**
   * Filtered rows for a query, memoised per store revision. Every block of a
   * query — plus its grand total and pivot field collection — reuses one scan
   * instead of walking the whole store again.
   */
  private collectFilteredCached(
    request: Pick<
      SsrmGetRowsRequest,
      "filterModel" | "quickFilterText" | "quickFilterColumns"
    >,
    sessionId?: string,
  ): Row[] {
    const quickFilterText = request.quickFilterText ?? "";
    const session = this.overlay.stateFor(sessionId);
    const key = JSON.stringify([
      "filtered",
      request.filterModel ?? null,
      quickFilterText,
      quickFilterText ? request.quickFilterColumns ?? null : null,
      // Empty for a session with no overlay, which is almost every grid — so
      // clean sessions keep sharing one entry, exactly as before. Only a
      // session that actually edits or excludes forks the cache, and only for
      // as long as it holds state.
      session?.identity ?? "",
    ]);
    return this.cachedOrder(key, () => this.collectFiltered(request, session));
  }

  private collectFiltered(
    request: Pick<
      SsrmGetRowsRequest,
      "filterModel" | "quickFilterText" | "quickFilterColumns"
    >,
    session: SessionQueryState | null,
  ): Row[] {
    const filterModel = request.filterModel;
    const parts = parseQuickFilter(request.quickFilterText);
    const columns = request.quickFilterColumns ?? null;
    const out: Row[] = [];

    // The session's own view of the data — its pending edits merged in, its
    // excluded rows dropped — established BEFORE the filter model runs, so an
    // edited value filters and sorts on the value the user can see, and an
    // excluded row is absent from counts and paging alike rather than being
    // hidden after the fact.
    if (session) {
      for (const [key, row] of this.store.iterateEntries()) {
        const view = session.view(row);
        if (session.excluded(view)) continue;
        if (parts.length > 0) {
          // An unpatched row keeps the store's cached aggregate, which acts
          // as a prefilter. A PATCHED row's cache is stale and the cache is
          // only sound as a prefilter when it is a superset — an edit can add
          // a matching value the cached string never had — so the patched
          // row's text is rebuilt from the view instead.
          const passes =
            view === row
              ? rowPassesQuickFilterScoped(
                  this.store.getQuickFilterText(key),
                  row,
                  parts,
                  columns,
                )
              : rowPassesQuickFilter(
                  buildQuickFilterText(view, columns ?? undefined),
                  parts,
                );
          if (!passes) continue;
        }
        if (doesRowMatchFilterModel(view, filterModel)) out.push(view);
      }
      return out;
    }

    // Quick-filter first (cached substring checks), then column filter model —
    // same effective result as CSRM, optimized for the hot path.
    if (parts.length === 0) {
      for (const row of this.store.iterate()) {
        if (doesRowMatchFilterModel(row, filterModel)) out.push(row);
      }
      return out;
    }
    for (const [key, row] of this.store.iterateEntries()) {
      if (
        !rowPassesQuickFilterScoped(
          this.store.getQuickFilterText(key),
          row,
          parts,
          columns,
        )
      ) {
        continue;
      }
      if (doesRowMatchFilterModel(row, filterModel)) out.push(row);
    }
    return out;
  }

  /** Rows under a group path — `groupKeys[i]` matched against `rowGroupCols[i]`. */
  private scopeToGroupPath(
    filtered: Row[],
    groupCols: NonNullable<SsrmGetRowsRequest["rowGroupCols"]>,
    groupKeys: string[],
  ): Row[] {
    if (groupKeys.length === 0) return filtered;
    const readers = groupCols.map((c) => getPathAccessor(c.field));
    return filtered.filter((row) =>
      groupKeys.every((gk, i) => String(readers[i]?.(row) ?? "") === gk),
    );
  }

  private leafBlock(
    filtered: Row[],
    request: SsrmGetRowsRequest,
    groupCols: NonNullable<SsrmGetRowsRequest["rowGroupCols"]>,
    groupKeys: string[],
    sessionId?: string,
  ): SsrmGetRowsResult {
    const sessionKey = this.overlay.stateFor(sessionId)?.identity ?? "";
    // Scoping + sorting depend only on the query shape, never on the row
    // window — so every block of one query reuses this single ordered array.
    const rows = this.cachedOrder(
      QueryEngine.queryKey(request, "leaf", null, sessionKey),
      () =>
        sortRows(
          this.scopeToGroupPath(filtered, groupCols, groupKeys),
          request.sortModel,
        ),
    );
    const start = request.startRow ?? 0;
    const end = request.endRow ?? rows.length;
    const slice = rows.slice(start, end).map((r) => this.enrich(r, sessionId));
    const groupData =
      (request.valueCols?.length ?? 0) > 0
        ? this.memo(
            QueryEngine.queryKey(request, "leafAgg", request.valueCols ?? null, sessionKey),
            () => aggregateValueCols(rows, request.valueCols),
          )
        : undefined;
    return {
      rowData: slice,
      rowCount: rows.length,
      groupData,
    };
  }

  /**
   * Child count for SSRM `getChildCount`: next-level distinct groups, or leaf
   * row count when the next level is leaves.
   */
  private childCountForGroup(
    rows: Row[],
    groupCols: NonNullable<SsrmGetRowsRequest["rowGroupCols"]>,
    nextGroupIndex: number,
  ): number {
    if (nextGroupIndex >= groupCols.length) return rows.length;
    const read = getPathAccessor(groupCols[nextGroupIndex]!.field);
    const keys = new Set<string>();
    for (const row of rows) keys.add(String(read(row) ?? ""));
    return keys.size;
  }

  /**
   * Apply configured expression rules (calculated / style / alert / editable)
   * to one row. `sessionId` resolves to that session's own rules if it has
   * configured any, else the global (sessionless-configured) set — see
   * {@link ExpressionRuleStore}.
   *
   * Memoised order-cache entries (see {@link memo} / {@link cachedOrder})
   * always hold RAW, pre-enrichment rows: every call site enriches the
   * *sliced* page after retrieving from cache
   * (`groups.slice(...).map((g) => this.enrich(g, sessionId))`,
   * `rows.slice(...).map((r) => this.enrich(r, sessionId))`), never before
   * caching. So sharing one memo entry across sessions is safe — no
   * session's calculated columns are ever baked into a cached value another
   * session could read back.
   */
  private enrich(row: Row, sessionId?: string): EnrichedRow {
    return this.exprRules.enrich(row, sessionId, this.aggregateScope(sessionId));
  }

  /**
   * The whole-store view a column-wide calculated column folds over
   * (`SUM([price])`), or `undefined` when this session has no such rule.
   *
   * Scope is the WHOLE store, unfiltered — the client-side row model's
   * `forEachNode` snapshot is unfiltered too, and the same expression must not
   * mean "total of everything" in one grid and "total of what's showing" in
   * the other.
   *
   * Bound to the store revision, so a tick rebuilds it exactly once and every
   * enriched row of every block in between shares one pass per column. The
   * scope object identity is what carries that sharing — rebuilding it per row
   * would re-map the column per row.
   */
  private aggregateScope(sessionId?: string): AggregateScope | undefined {
    if (!this.exprRules.usesAggregates(sessionId)) return undefined;
    const revision = this.store.getRevision();
    if (!this.aggScope || this.aggScope.revision !== revision) {
      this.aggScope = {
        revision,
        scope: {
          allRows: [...this.store.iterate()],
          allRowsColumnCache: new Map<string, unknown[]>(),
          allRowsAggregateCache: new Map<string, unknown>(),
        },
      };
    }
    return this.aggScope.scope;
  }
}
