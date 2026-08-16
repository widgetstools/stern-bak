/** Transport-agnostic row record. */
export type Row = Record<string, unknown>;

export type AggFunc = "sum" | "min" | "max" | "avg" | "count";

/** Subset of AG Grid IServerSideGetRowsRequest we honour. */
export interface SsrmGetRowsRequest {
  startRow?: number;
  endRow?: number;
  rowGroupCols?: Array<{ id: string; field: string; displayName?: string }>;
  valueCols?: Array<{
    id: string;
    field: string;
    aggFunc?: string | null;
    displayName?: string;
  }>;
  pivotCols?: Array<{ id: string; field: string }>;
  /** True when AG Grid pivot mode is on (SSRM request). */
  pivotMode?: boolean;
  groupKeys?: string[];
  filterModel?: Record<string, unknown> | null;
  sortModel?: Array<{ colId: string; sort: "asc" | "desc" }>;
  /**
   * CSRM-parity quick filter text. Not sent by AG Grid for SSRM — the React
   * adapter injects it from the demo/app quick-filter input.
   */
  quickFilterText?: string | null;
  /**
   * Fields the quick filter searches — the requesting grid's own columns,
   * hidden ones included only when `includeHiddenColumnsInQuickFilter` is on.
   * CSRM searches columns, not raw row fields; one plane serves many grids
   * with different column sets, so the scope travels with the query rather
   * than being baked into the plane. Omitted ⇒ every field (this engine's
   * long-standing behaviour, and the only honest answer when the caller has
   * no column state to report).
   */
  quickFilterColumns?: string[] | null;
  /** Pivot result field separator (matches grid `serverSidePivotResultFieldSeparator`). */
  pivotResultFieldSeparator?: string;
}

/** SSRM tree-data configuration (flat RowStore → hierarchical getRows). */
export interface TreeDataConfig {
  enabled: boolean;
  /**
   * `parent` — rows linked by `parentField` → keyField.
   * `path` — rows carry a path array in `pathField` (CSRM getDataPath style).
   */
  mode: "parent" | "path";
  /** Parent key field (parent mode). Default `parentId`. */
  parentField?: string;
  /** Path array field (path mode). Default `orgHierarchy`. */
  pathField?: string;
  /** Node id field. Defaults to the store key column. */
  keyField?: string;
}

export interface DetailRowsRequest {
  masterKey: string;
  /**
   * If set, detail rows are the array stored on the master row at this field
   * (e.g. `callRecords`).
   */
  detailField?: string;
  /**
   * If set (and no detailField), load related rows from the store where
   * `row[detailParentField] === masterKey`.
   */
  detailParentField?: string;
}

export interface SsrmGetRowsResult {
  rowData: Row[];
  rowCount: number;
  /** Group-level aggregation payload when requested (leaf blocks). */
  groupData?: Row;
  /** Root grand-total row for `grandTotalRow` footer (CSRM-parity). */
  grandTotalData?: Row;
  /** Pivot secondary field ids for AG Grid to generate columns. */
  pivotResultFields?: string[];
}

export interface SetFilterValuesRequest {
  column: string;
  /** Optional filter model to scope unique values (other columns). */
  filterModel?: Record<string, unknown> | null;
  /** Active quick-filter text (scopes uniques like CSRM). */
  quickFilterText?: string | null;
  /** Quick-filter column scope — see {@link SsrmGetRowsRequest.quickFilterColumns}. */
  quickFilterColumns?: string[] | null;
  /**
   * Optional group path to scope values to (colour-link publishing for a
   * selected group row whose descendants are not loaded client-side).
   * `groupKeys[i]` is the group value at `rowGroupCols[i].field`.
   * An empty array with `rowGroupCols` set means "the whole current query"
   * (select-all).
   */
  groupKeys?: string[];
  rowGroupCols?: Array<{ field: string }>;
}

export interface ExpressionRule {
  id: string;
  /** Column field for calculated columns; omit for row-level rules. */
  field?: string;
  expression: string;
  kind: "calculated" | "style" | "alert" | "editable";
}

export interface StyleResult {
  [cssProp: string]: string | number | undefined;
}

export interface EnrichedRow extends Row {
  /**
   * Fields on this row that the QUERY PLANE computed — the `calculated`
   * expression rules configured for the asking session. The grid returns
   * these verbatim instead of re-evaluating the expression against the rows
   * its block cache happens to hold. Key and reader live in
   * `@wellsfargo-starui/core` (`COMPUTED_FIELDS_KEY` / `readComputedField`)
   * so both ends share one definition.
   */
  __ssrmCalculated?: readonly string[];
  __ssrmStyle?: StyleResult;
  __ssrmAlert?: boolean | string;
  __ssrmEditable?: Record<string, boolean> | boolean;
  __ssrmChildCount?: number;
  __ssrmGroupKey?: string;
  /** SSRM tree: expandable group node (for `isServerSideGroup`). */
  __ssrmTreeGroup?: boolean;
  /** Alias for AG Grid examples that check `data.group`. */
  group?: boolean;
  /** Master-detail: row has detail records. */
  __ssrmHasDetail?: boolean;
}

export interface TickEvent {
  type: "rows" | "aggregates" | "setFilter" | "snapshot";
  keys?: string[];
  columns?: string[];
  /**
   * Full post-upsert rows for this tick (for SSRM applyServerSideTransaction).
   * Hub enriches these with expression rules before fan-out when configured.
   */
  rows?: Row[];
  /** Opaque session filter — clients refresh SSRM as needed. */
  revision: number;
}

export interface CacheStats {
  rowCount: number;
  revision: number;
  keyColumn: string;
  columns: string[];
}

export interface ICacheIngest {
  replaceSnapshot(rows: Row[]): void;
  upsert(rows: Row[]): void;
  remove(keys: string[]): void;
  clear(): void;
}
