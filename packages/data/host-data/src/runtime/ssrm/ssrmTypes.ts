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
  /**
   * Filter conditions the engine had no translation for. The block was served
   * WITHOUT them, so it holds more rows than the grid's filter asks for — the
   * main thread must surface this rather than paint it as a correct result.
   */
  unsupportedFilters?: readonly string[];
}

/**
 * Rows edited in a grid — cell edits, clipboard paste, fill handle — written
 * into the engine cache so every grid on the provider sees the same values
 * and a block refresh keeps them. Each row must carry the key column(s);
 * send the full row, since the engine upserts whole records. The upstream
 * feed is NOT written to: its next tick for that row wins.
 */
export interface SsrmApplyEditsRequest {
  rows: readonly Record<string, unknown>[];
}

export interface SsrmApplyEditsResult {
  applied: number;
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

/**
 * Suffix of the numeric shadow column the plane stamps next to every date
 * column at ingest (`Date.parse` of the stored string, or null). The engine
 * orders numbers but only tests strings for equality, so date range filters
 * and date sorts run against the shadow, never the string.
 */
export const SSRM_EPOCH_SUFFIX = '__epoch';

export function ssrmEpochColumn(column: string): string {
  return `${column}${SSRM_EPOCH_SUFFIX}`;
}

export interface SsrmViewSpec {
  /** ANDed together. */
  filter: SsrmFilterNode[];
  /**
   * The engine reads the direction from `sort` — a `dir` key is silently
   * ignored and the view comes back ascending, which is how every descending
   * sort in this stack was wrong before this shape was verified against the
   * WASM directly.
   */
  sort: Array<{ column: string; sort: 'asc' | 'desc' }>;
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
