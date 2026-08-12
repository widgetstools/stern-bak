import { aggregateRows, normalizeAgg, type AggSpec } from "./aggregations.js";
import { compareValues, rowPassesFilter } from "./filter.js";
import {
  parseQuickFilter,
  rowPassesQuickFilter,
} from "./quickFilter.js";
import type { RowStore } from "./RowStore.js";
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
import { ExpressionEngine } from "@wellsfargo-starui/core";

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
const DEFAULT_ORDER_CACHE_SIZE = 24;

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
 */
export class QueryEngine {
  private readonly store: RowStore;
  private readonly expr: ExpressionEngine;
  private rules: ExpressionRule[] = [];
  private compiled = new Map<string, (ctx: { data: Row; columns: Row; value: unknown; x: unknown }) => unknown>();
  private tree: TreeDataConfig | null = null;
  /** Insertion-ordered = LRU. Keyed by query shape, never by row window. */
  private readonly orderCache = new Map<string, CachedEntry>();
  private readonly orderCacheSize: number;

  constructor(options: QueryEngineOptions) {
    this.store = options.store;
    this.expr = options.expressionEngine ?? new ExpressionEngine();
    this.tree = options.tree ?? null;
    this.orderCacheSize = options.orderCacheSize ?? DEFAULT_ORDER_CACHE_SIZE;
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
      // Refresh LRU position.
      this.orderCache.delete(key);
      this.orderCache.set(key, hit);
      return hit.value as T;
    }
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

  /** Everything that changes *which* rows match, and in what order. */
  private static queryKey(
    request: SsrmGetRowsRequest,
    kind: string,
    extra?: unknown,
  ): string {
    return JSON.stringify([
      kind,
      request.filterModel ?? null,
      request.quickFilterText ?? '',
      request.sortModel ?? null,
      request.groupKeys ?? null,
      request.rowGroupCols?.map((c) => c.field) ?? null,
      extra ?? null,
    ]);
  }

  /** Drops every memoised order. Called when expression rules change. */
  private invalidateOrderCache(): void {
    this.orderCache.clear();
  }

  configureTree(config: TreeDataConfig | null): void {
    this.tree = config;
    this.invalidateOrderCache();
  }

  configureExpressions(rules: ExpressionRule[]): void {
    this.rules = rules;
    this.invalidateOrderCache();
    this.compiled.clear();
    for (const rule of rules) {
      try {
        this.compiled.set(rule.id, this.expr.compile(rule.expression));
      } catch {
        // Invalid expressions are skipped at configure time.
      }
    }
  }

  getRows(request: SsrmGetRowsRequest): SsrmGetRowsResult {
    if (this.tree?.enabled) {
      return this.treeBlock(request);
    }

    const groupCols = request.rowGroupCols ?? [];
    const groupKeys = request.groupKeys ?? [];
    const pivotCols = request.pivotCols ?? [];
    const pivoting = Boolean(request.pivotMode) || pivotCols.length > 0;
    const sep = request.pivotResultFieldSeparator ?? "_";
    const filtered = this.collectFilteredCached(
      request.filterModel,
      request.quickFilterText,
    );

    // Both scan the whole filtered set and neither depends on the row window,
    // so without memoising they would re-run per block and cancel out the
    // order cache entirely whenever value columns are configured.
    const pivotResultFields = pivoting
      ? this.memo(
          QueryEngine.queryKey(request, "pivotFields", [
            pivotCols.map((c) => c.field),
            request.valueCols ?? null,
            sep,
          ]),
          () => this.collectPivotResultFields(filtered, pivotCols, request, sep),
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
            ]),
            () =>
              pivoting
                ? this.pivotAggregate(filtered, pivotCols, request, sep)
                : this.valueAgg(filtered, request),
          )
        : undefined;

    // Leaf level: all group keys provided.
    if (groupKeys.length >= groupCols.length) {
      const leaf = this.leafBlock(filtered, request, groupCols, groupKeys);
      return {
        ...leaf,
        grandTotalData,
        pivotResultFields,
      };
    }

    // Intermediate group level
    const groupCol = groupCols[groupKeys.length]!;
    const field = groupCol.field;
    const scoped = filtered.filter((row) =>
      groupKeys.every((gk, i) => String(row[groupCols[i]!.field] ?? "") === gk),
    );

    // Bucketing + per-group aggregation + sort is the expensive part and is
    // window-independent; the key carries the aggregation inputs because they
    // change the group rows themselves.
    const groups = this.cachedOrder(
      QueryEngine.queryKey(request, "groups", [
        field,
        request.valueCols ?? null,
        pivotCols.map((c) => c.field),
        pivoting,
        sep,
      ]),
      () => {
        const buckets = new Map<string, Row[]>();
        for (const row of scoped) {
          const key = String(row[field] ?? "");
          let list = buckets.get(key);
          if (!list) {
            list = [];
            buckets.set(key, list);
          }
          list.push(row);
        }

        const built = [...buckets.entries()].map(([key, rows]) => {
          const agg = pivoting
            ? this.pivotAggregate(rows, pivotCols, request, sep)
            : this.valueAgg(rows, request);
          return {
            ...agg,
            [field]: key,
            __ssrmGroupKey: key,
            // Distinct child groups at next level, or leaf count when next is leaf.
            __ssrmChildCount: this.childCountForGroup(
              rows,
              groupCols,
              groupKeys.length + 1,
            ),
          } as Row;
        });

        return this.sortRows(built, request.sortModel, field);
      },
    );

    const start = request.startRow ?? 0;
    const end = request.endRow ?? groups.length;
    const slice = groups.slice(start, end).map((g) => this.enrich(g));

    return {
      rowData: slice,
      rowCount: groups.length,
      grandTotalData,
      pivotResultFields,
    };
  }

  getSetFilterValues(req: SetFilterValuesRequest): string[] {
    const fm = { ...(req.filterModel ?? {}) } as Record<string, unknown>;
    delete fm[req.column];

    const groupKeys = req.groupKeys;
    const groupCols = req.rowGroupCols ?? [];
    const inGroupPath = (row: Row): boolean => {
      if (!groupKeys) return true;
      return groupKeys.every(
        (gk, i) => String(row[groupCols[i]?.field ?? ""] ?? "") === gk,
      );
    };

    // Reuses the per-query memo (revision-bound), then narrows by group path
    // — a colour-link publish right after a block load pays no fresh scan.
    const filtered = this.collectFilteredCached(
      Object.keys(fm).length > 0 ? fm : null,
      req.quickFilterText,
    );
    const seen = new Set<string>();
    for (const row of filtered) {
      if (!inGroupPath(row)) continue;
      const v = row[req.column];
      seen.add(v == null ? "" : String(v));
    }
    return [...seen].sort((a, b) => a.localeCompare(b));
  }

  getGrandTotal(
    request: Pick<
      SsrmGetRowsRequest,
      "filterModel" | "valueCols" | "quickFilterText"
    >,
  ): Row {
    const filtered = this.collectFilteredCached(
      request.filterModel,
      request.quickFilterText,
    );
    return this.valueAgg(filtered, request);
  }

  /**
   * Apply configured expression rules to rows (calculated / style / alert / editable).
   * Used by `getRows` and by live tick fan-out so `applyServerSideTransaction`
   * patches carry the same enriched fields as SSRM blocks.
   */
  enrichRows(rows: Row[]): EnrichedRow[] {
    return rows.map((r) => this.enrich(r));
  }

  /** Field names produced by configured `calculated` expression rules. */
  calculatedFields(): string[] {
    return this.rules
      .filter((r) => r.kind === "calculated" && r.field)
      .map((r) => r.field!);
  }

  /**
   * Master-detail: detail rows for a master key (embedded array or related rows).
   */
  getDetailRows(req: DetailRowsRequest): Row[] {
    const master = this.store.getRow(req.masterKey);
    if (req.detailField) {
      if (!master) return [];
      const raw = master[req.detailField];
      return Array.isArray(raw) ? (raw as Row[]).map((r) => ({ ...r })) : [];
    }
    const parentField =
      req.detailParentField ??
      this.tree?.parentField ??
      "parentId";
    const out: Row[] = [];
    for (const row of this.store.iterate()) {
      if (String(row[parentField] ?? "") === String(req.masterKey)) {
        out.push(this.enrich({ ...row }));
      }
    }
    return out;
  }

  // ── Tree data ───────────────────────────────────────────────────────

  private treeKeyField(): string {
    return this.tree?.keyField ?? this.store.keyColumn;
  }

  private treeBlock(request: SsrmGetRowsRequest): SsrmGetRowsResult {
    const filtered = this.collectFilteredCached(
      request.filterModel,
      request.quickFilterText,
    );
    const groupKeys = request.groupKeys ?? [];
    const keyField = this.treeKeyField();
    const index = this.buildTreeIndex(filtered, keyField);

    let nodes: Row[];
    if (groupKeys.length === 0) {
      nodes = index.roots;
    } else {
      const parentKey = groupKeys[groupKeys.length - 1]!;
      nodes = index.childrenOf.get(parentKey) ?? [];
    }

    nodes = this.sortRows(nodes, request.sortModel, keyField);

    const start = request.startRow ?? 0;
    const end = request.endRow ?? nodes.length;
    const slice = nodes.slice(start, end).map((r) => {
      const key = String(r[keyField] ?? "");
      const childCount = (index.childrenOf.get(key) ?? []).length;
      const hasDetail = this.rowHasDetail(r);
      const out: EnrichedRow = {
        ...this.enrich(r),
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
        ? this.valueAgg(filtered, request)
        : undefined;

    return {
      rowData: slice,
      rowCount: nodes.length,
      grandTotalData,
    };
  }

  private rowHasDetail(row: Row): boolean {
    for (const [k, v] of Object.entries(row)) {
      if (k.startsWith("__")) continue;
      if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object") {
        return true;
      }
    }
    return Boolean(row.__ssrmHasDetail);
  }

  private buildTreeIndex(
    filtered: Row[],
    keyField: string,
  ): {
    roots: Row[];
    childrenOf: Map<string, Row[]>;
  } {
    const mode = this.tree?.mode ?? "parent";
    if (mode === "path") {
      return this.buildPathTreeIndex(filtered, keyField);
    }
    return this.buildParentTreeIndex(filtered, keyField);
  }

  private buildParentTreeIndex(
    filtered: Row[],
    keyField: string,
  ): {
    roots: Row[];
    childrenOf: Map<string, Row[]>;
  } {
    const parentField = this.tree?.parentField ?? "parentId";

    // Universe: filtered rows + their ancestors (so expand paths stay intact).
    const byKey = new Map<string, Row>();
    const matchKeys = new Set<string>();
    for (const row of filtered) {
      const k = row[keyField];
      if (k == null) continue;
      const key = String(k);
      byKey.set(key, row);
      matchKeys.add(key);
    }
    for (const key of [...matchKeys]) {
      let parentId = byKey.get(key)?.[parentField];
      while (parentId != null && parentId !== "") {
        const pk = String(parentId);
        if (byKey.has(pk)) {
          parentId = byKey.get(pk)![parentField];
          continue;
        }
        const ancestor = this.store.getRow(pk);
        if (!ancestor) break;
        byKey.set(pk, ancestor);
        parentId = ancestor[parentField];
      }
    }

    const childrenOf = new Map<string, Row[]>();
    const roots: Row[] = [];

    for (const [key, row] of byKey) {
      const parentId = row[parentField];
      if (parentId == null || parentId === "") {
        roots.push(row);
        continue;
      }
      const pk = String(parentId);
      if (!byKey.has(pk)) {
        // Orphan under current filter — surface as root.
        roots.push(row);
        continue;
      }
      let list = childrenOf.get(pk);
      if (!list) {
        list = [];
        childrenOf.set(pk, list);
      }
      list.push(row);
    }

    // Matched parents expose all store children (CSRM-like expand-after-filter).
    for (const pk of matchKeys) {
      const kids: Row[] = [];
      const seen = new Set<string>();
      for (const row of this.store.iterate()) {
        if (String(row[parentField] ?? "") !== pk) continue;
        const ck = row[keyField];
        if (ck == null) continue;
        const cks = String(ck);
        if (seen.has(cks)) continue;
        seen.add(cks);
        kids.push(byKey.get(cks) ?? row);
      }
      if (kids.length) childrenOf.set(pk, kids);
    }

    return { roots, childrenOf };
  }

  private buildPathTreeIndex(
    filtered: Row[],
    keyField: string,
  ): {
    roots: Row[];
    childrenOf: Map<string, Row[]>;
  } {
    const pathField = this.tree?.pathField ?? "orgHierarchy";
    const byKey = new Map<string, Row>();
    const pathOf = new Map<string, string[]>();

    const ensureRow = (row: Row): string | null => {
      const k = row[keyField];
      if (k == null) return null;
      const key = String(k);
      byKey.set(key, row);
      const path = row[pathField];
      if (Array.isArray(path)) pathOf.set(key, path.map(String));
      return key;
    };

    for (const row of filtered) ensureRow(row);

    // Pull ancestors by path prefix from the full store
    for (const row of this.store.iterate()) {
      const path = row[pathField];
      if (!Array.isArray(path) || path.length === 0) continue;
      const key = ensureRow(row);
      if (!key) continue;
    }

    // Restrict to matches + ancestors (path prefixes of matches)
    const matchKeys = new Set(
      [...filtered]
        .map((r) => (r[keyField] != null ? String(r[keyField]) : null))
        .filter((k): k is string => k != null),
    );
    const keep = new Set<string>();
    for (const mk of matchKeys) {
      const path = pathOf.get(mk);
      if (!path) {
        keep.add(mk);
        continue;
      }
      // Keep every node whose path is a prefix of this match path
      for (const [key, p] of pathOf) {
        if (p.length <= path.length && p.every((seg, i) => seg === path[i])) {
          keep.add(key);
        }
      }
    }

    const childrenOf = new Map<string, Row[]>();
    const roots: Row[] = [];

    for (const key of keep) {
      const row = byKey.get(key) ?? this.store.getRow(key);
      if (!row) continue;
      const path = pathOf.get(key) ?? [];
      if (path.length <= 1) {
        roots.push(row);
        continue;
      }
      // Parent = node with path.slice(0,-1)
      const parentPath = path.slice(0, -1);
      let parentKey: string | null = null;
      for (const [k, p] of pathOf) {
        if (
          p.length === parentPath.length &&
          p.every((seg, i) => seg === parentPath[i])
        ) {
          parentKey = k;
          break;
        }
      }
      if (!parentKey) {
        roots.push(row);
        continue;
      }
      let list = childrenOf.get(parentKey);
      if (!list) {
        list = [];
        childrenOf.set(parentKey, list);
      }
      list.push(row);
    }

    // Matched parents: include all store children under their path
    for (const mk of matchKeys) {
      const parentPath = pathOf.get(mk);
      if (!parentPath) continue;
      const kids: Row[] = [];
      for (const [k, p] of pathOf) {
        if (p.length !== parentPath.length + 1) continue;
        if (!parentPath.every((seg, i) => seg === p[i])) continue;
        const row = byKey.get(k) ?? this.store.getRow(k);
        if (row) kids.push(row);
      }
      if (kids.length) childrenOf.set(mk, kids);
    }

    return { roots, childrenOf };
  }

  /**
   * Filtered rows for a query, memoised per store revision. Every block of a
   * query — plus its grand total and pivot field collection — reuses one scan
   * instead of walking the whole store again.
   */
  private collectFilteredCached(
    filterModel: SsrmGetRowsRequest["filterModel"],
    quickFilterText?: string | null,
  ): Row[] {
    const key = JSON.stringify([
      "filtered",
      filterModel ?? null,
      quickFilterText ?? "",
    ]);
    return this.cachedOrder(key, () =>
      this.collectFiltered(filterModel, quickFilterText),
    );
  }

  private collectFiltered(
    filterModel: SsrmGetRowsRequest["filterModel"],
    quickFilterText?: string | null,
  ): Row[] {
    const parts = parseQuickFilter(quickFilterText);
    const out: Row[] = [];
    // Quick-filter first (cached substring checks), then column filter model —
    // same effective result as CSRM, optimized for the hot path.
    if (parts.length === 0) {
      for (const row of this.store.iterate()) {
        if (rowPassesFilter(row, filterModel)) out.push(row);
      }
      return out;
    }
    for (const [key, row] of this.store.iterateEntries()) {
      if (!rowPassesQuickFilter(this.store.getQuickFilterText(key), parts)) {
        continue;
      }
      if (rowPassesFilter(row, filterModel)) out.push(row);
    }
    return out;
  }

  private leafBlock(
    filtered: Row[],
    request: SsrmGetRowsRequest,
    groupCols: NonNullable<SsrmGetRowsRequest["rowGroupCols"]>,
    groupKeys: string[],
  ): SsrmGetRowsResult {
    // Scoping + sorting depend only on the query shape, never on the row
    // window — so every block of one query reuses this single ordered array.
    const rows = this.cachedOrder(
      QueryEngine.queryKey(request, "leaf"),
      () => {
        let scoped = filtered;
        if (groupKeys.length > 0) {
          scoped = filtered.filter((row) =>
            groupKeys.every(
              (gk, i) => String(row[groupCols[i]!.field] ?? "") === gk,
            ),
          );
        }
        return this.sortRows(scoped, request.sortModel);
      },
    );
    const start = request.startRow ?? 0;
    const end = request.endRow ?? rows.length;
    const slice = rows.slice(start, end).map((r) => this.enrich(r));
    const groupData =
      (request.valueCols?.length ?? 0) > 0
        ? this.memo(
            QueryEngine.queryKey(request, "leafAgg", request.valueCols ?? null),
            () => this.valueAgg(rows, request),
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
    const field = groupCols[nextGroupIndex]!.field;
    const keys = new Set<string>();
    for (const row of rows) keys.add(String(row[field] ?? ""));
    return keys.size;
  }

  private pivotKey(
    row: Row,
    pivotCols: NonNullable<SsrmGetRowsRequest["pivotCols"]>,
    sep: string,
  ): string {
    return pivotCols.map((c) => String(row[c.field] ?? "")).join(sep);
  }

  private collectPivotResultFields(
    rows: Row[],
    pivotCols: NonNullable<SsrmGetRowsRequest["pivotCols"]>,
    request: Pick<SsrmGetRowsRequest, "valueCols">,
    sep: string,
  ): string[] {
    if (!pivotCols.length || !(request.valueCols?.length ?? 0)) return [];
    const keys = new Set<string>();
    for (const row of rows) keys.add(this.pivotKey(row, pivotCols, sep));
    const fields: string[] = [];
    const sortedKeys = [...keys].sort((a, b) => a.localeCompare(b));
    for (const pk of sortedKeys) {
      for (const vc of request.valueCols ?? []) {
        if (!vc.field) continue;
        fields.push(`${pk}${sep}${vc.field}`);
      }
    }
    return fields;
  }

  /** Aggregate rows into pivoted secondary fields (`{pivotKey}_{field}`). */
  private pivotAggregate(
    rows: Row[],
    pivotCols: NonNullable<SsrmGetRowsRequest["pivotCols"]>,
    request: Pick<SsrmGetRowsRequest, "valueCols">,
    sep: string,
  ): Row {
    if (!pivotCols.length) return this.valueAgg(rows, request);
    const buckets = new Map<string, Row[]>();
    for (const row of rows) {
      const key = this.pivotKey(row, pivotCols, sep);
      let list = buckets.get(key);
      if (!list) {
        list = [];
        buckets.set(key, list);
      }
      list.push(row);
    }
    const out: Row = {};
    for (const [pk, bucket] of buckets) {
      const agg = this.valueAgg(bucket, request);
      for (const [field, value] of Object.entries(agg)) {
        out[`${pk}${sep}${field}`] = value;
      }
    }
    return out;
  }

  private valueAgg(
    rows: Row[],
    request: Pick<SsrmGetRowsRequest, "valueCols">,
  ): Row {
    const specs: AggSpec[] = (request.valueCols ?? [])
      .filter((v) => v.field)
      .map((v) => ({
        field: v.field,
        aggFunc: normalizeAgg(v.aggFunc),
      }));
    if (specs.length === 0) return {};
    return aggregateRows(rows, specs);
  }

  private sortRows(
    rows: Row[],
    sortModel: SsrmGetRowsRequest["sortModel"],
    fallbackField?: string,
  ): Row[] {
    if (!sortModel || sortModel.length === 0) {
      if (!fallbackField) return rows;
      return [...rows].sort((a, b) =>
        compareValues(a[fallbackField], b[fallbackField], "asc"),
      );
    }
    return [...rows].sort((a, b) => {
      for (const s of sortModel) {
        const c = compareValues(a[s.colId], b[s.colId], s.sort);
        if (c !== 0) return c;
      }
      return 0;
    });
  }

  private enrich(row: Row): EnrichedRow {
    if (this.rules.length === 0) return row;
    const out: EnrichedRow = { ...row };
    const ctxBase = { data: out, columns: out, value: null as unknown, x: null as unknown };
    const editable: Record<string, boolean> = {};
    let style: Record<string, string | number | undefined> | undefined;
    let alert: boolean | string | undefined;

    for (const rule of this.rules) {
      const fn = this.compiled.get(rule.id);
      if (!fn) continue;
      try {
        if (rule.kind === "calculated" && rule.field) {
          const value = fn({ ...ctxBase, value: out[rule.field], x: out[rule.field] });
          out[rule.field] = value;
        } else if (rule.kind === "style") {
          const value = fn(ctxBase);
          if (value && typeof value === "object") {
            style = { ...(style ?? {}), ...(value as Record<string, string | number | undefined>) };
          } else if (typeof value === "string" && value) {
            style = { ...(style ?? {}), backgroundColor: value };
          }
        } else if (rule.kind === "alert") {
          const value = fn(ctxBase);
          if (value) alert = typeof value === "string" ? value : true;
        } else if (rule.kind === "editable") {
          const value = !!fn(ctxBase);
          if (rule.field) editable[rule.field] = value;
          else out.__ssrmEditable = value;
        }
      } catch {
        // swallow per-row expression errors
      }
    }
    if (style) out.__ssrmStyle = style;
    if (alert !== undefined) out.__ssrmAlert = alert;
    if (Object.keys(editable).length) {
      out.__ssrmEditable =
        typeof out.__ssrmEditable === "boolean"
          ? out.__ssrmEditable
          : { ...(typeof out.__ssrmEditable === "object" ? out.__ssrmEditable : {}), ...editable };
    }
    return out;
  }
}
