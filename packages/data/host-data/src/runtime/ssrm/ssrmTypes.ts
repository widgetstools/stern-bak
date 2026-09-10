/** AG Grid 36 SSRM getRows request (subset we persist across the worker port). */
export interface SsrmColRef {
  id: string;
  field?: string;
  displayName?: string;
  aggFunc?: string;
}

export interface SsrmGetRowsRequest {
  startRow?: number;
  endRow?: number;
  rowGroupCols?: readonly SsrmColRef[];
  valueCols?: readonly SsrmColRef[];
  pivotCols?: readonly SsrmColRef[];
  pivotMode?: boolean;
  groupKeys?: readonly unknown[];
  filterModel?: Record<string, unknown> | null;
  sortModel?: readonly { colId: string; sort: 'asc' | 'desc' }[];
  quickFilterText?: string;
}

export interface SsrmGetRowsResult {
  rowData: readonly Record<string, unknown>[];
  rowCount: number;
  groupData?: Record<string, unknown>;
  grandTotalData?: Record<string, unknown>;
  pivotResultFields?: string[];
}

export interface SsrmTickPayload {
  kind: 'rowDelta' | 'groupDelta';
  upserts?: readonly Record<string, unknown>[];
  removals?: readonly string[];
  reset?: boolean;
  groups?: readonly Record<string, unknown>[];
  removed?: readonly string[];
}

export interface SsrmWatchGroupsRequest {
  groupBy: readonly string[];
  aggregates?: Record<string, string>;
}

/**
 * The engine's filter operator set — NOT AG Grid's. Anything outside it has no
 * translation and is reported as unsupported rather than sent and silently
 * dropped (a filter the engine never sees shows MORE rows than the user asked
 * for, which looks like working software).
 */
export type SsrmFilterOp =
  | 'equals' | 'notEqual' | 'equalsIgnoreCase' | 'notEqualIgnoreCase'
  | 'contains' | 'notContains' | 'startsWith' | 'endsWith'
  | 'greaterThan' | 'greaterThanOrEqual' | 'lessThan' | 'lessThanOrEqual'
  | 'inRange' | 'in' | 'blank' | 'notBlank';

export interface SsrmFilterCondition {
  column: string;
  op: SsrmFilterOp;
  value?: unknown;
  /** Upper bound — `inRange` only. */
  valueTo?: unknown;
}

/**
 * A disjunction. The engine ANDs the top-level filter list, so AG Grid's
 * OR-combined conditions become one of these instead of being flattened —
 * flattening an OR shows fewer rows than the user asked for.
 */
export interface SsrmFilterOr {
  op: 'or';
  conditions: SsrmFilterNode[];
}

export type SsrmFilterNode = SsrmFilterCondition | SsrmFilterOr;

export interface SsrmViewSpec {
  /** ANDed together. */
  filter: SsrmFilterNode[];
  sort: Array<{ column: string; dir: 'asc' | 'desc' }>;
  groupBy?: string[];
  splitBy?: string[];
  aggregates?: Record<string, string>;
  columns?: string[];
  depth?: number;
}

/**
 * Row count for a filter the grid has NOT applied — the saved-filter pill
 * badges. The client can't scan for this under SSRM: it only holds the blocks
 * it has loaded, so a client-side count reports block statistics, not totals.
 */
export interface SsrmRowCountRequest {
  filterModel?: Record<string, unknown> | null;
  quickFilterText?: string;
}

export interface SsrmRowCountResult {
  rowCount: number;
}

/** One aggregation the status bar (or a grouped view) can ask the engine for. */
export type SsrmAggFn = 'sum' | 'avg' | 'min' | 'max' | 'count';

export interface SsrmAggSpec {
  column: string;
  fn: SsrmAggFn;
  /** Result key. Defaults to `${column}_${fn}`. */
  as?: string;
}

export interface SsrmAggregatesRequest {
  filterModel?: Record<string, unknown> | null;
  quickFilterText?: string;
  specs: readonly SsrmAggSpec[];
}

export interface SsrmAggregatesResult {
  values: Record<string, number>;
}

/** Distinct values for one column — populates an AG Grid set filter. */
export interface SsrmColumnValuesRequest {
  column: string;
  /** Cap on returned values; the engine's group read is bounded. */
  limit?: number;
  /** Narrow the distinct scan to the other columns' active filters. */
  filterModel?: Record<string, unknown> | null;
}

export interface SsrmColumnValuesResult {
  column: string;
  values: readonly unknown[];
  /** True when `limit` cut the list short. */
  truncated: boolean;
}
