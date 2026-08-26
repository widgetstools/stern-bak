/**
 * A small, total query language over already-fetched rows — filter, group,
 * aggregate, sort, limit.
 *
 * This is the "cell" the assistant runs. The model doesn't write code and
 * nothing is evaluated: it fills in a structured query, and this executes it
 * deterministically. Same inputs, same table, every time — which is what makes
 * the numbers in an answer trustworthy, and what keeps arbitrary
 * model-authored code out of the app.
 *
 * Pure: no config, no I/O, no provider.
 */

export const FILTER_OPS = [
  'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith', 'in', 'between', 'isEmpty', 'notEmpty',
] as const;
export type FilterOp = (typeof FILTER_OPS)[number];

export const AGG_FNS = ['sum', 'avg', 'min', 'max', 'count', 'countDistinct'] as const;
export type AggFn = (typeof AGG_FNS)[number];

export interface FilterClause {
  column: string;
  op: FilterOp;
  value?: unknown;
}

export interface Aggregation {
  column: string;
  fn: AggFn;
  /** Output column name; defaults to `<fn>_<column>`. */
  as?: string;
}

export interface DataQuery {
  columns?: string[];
  filter?: FilterClause[];
  groupBy?: string[];
  aggregate?: Aggregation[];
  sortBy?: { column: string; direction?: 'asc' | 'desc' };
  limit?: number;
}

export interface QueryResult {
  columns: string[];
  rows: Array<Record<string, unknown>>;
  /** Rolled up rather than raw rows — which rules a scatter out when charting. */
  grouped: boolean;
  /** Rows that passed the filter, before limit — so "showing 20 of 812" is honest. */
  matched: number;
  /** Rows the query started from. */
  scanned: number;
  truncated: boolean;
}

export type QueryOutcome = { ok: true; value: QueryResult } | { ok: false; error: string };

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const [sa, sb] = [String(a ?? ''), String(b ?? '')];
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function matches(row: Record<string, unknown>, clause: FilterClause): boolean {
  const cell = row[clause.column];
  const { op, value } = clause;
  switch (op) {
    case 'isEmpty':
      return isBlank(cell);
    case 'notEmpty':
      return !isBlank(cell);
    case 'eq':
      return cell === value || String(cell) === String(value);
    case 'ne':
      return !(cell === value || String(cell) === String(value));
    case 'gt':
      return compare(cell, value) > 0;
    case 'gte':
      return compare(cell, value) >= 0;
    case 'lt':
      return compare(cell, value) < 0;
    case 'lte':
      return compare(cell, value) <= 0;
    case 'contains':
      return String(cell ?? '').toLowerCase().includes(String(value ?? '').toLowerCase());
    case 'startsWith':
      return String(cell ?? '').toLowerCase().startsWith(String(value ?? '').toLowerCase());
    case 'in':
      return Array.isArray(value) && value.some((v) => v === cell || String(v) === String(cell));
    case 'between':
      return Array.isArray(value) && value.length === 2
        && compare(cell, value[0]) >= 0 && compare(cell, value[1]) <= 0;
    default:
      return true;
  }
}

/** Validates before running: a mistyped op or a missing operand should be an
 *  explanation, not a silently empty table. */
export function validateQuery(query: DataQuery): string | null {
  for (const clause of query.filter ?? []) {
    if (!clause?.column || typeof clause.column !== 'string') return 'Each filter needs a "column".';
    if (!(FILTER_OPS as readonly string[]).includes(clause.op)) {
      return `Filter op "${clause.op}" is not one of: ${FILTER_OPS.join(', ')}.`;
    }
    const needsValue = clause.op !== 'isEmpty' && clause.op !== 'notEmpty';
    if (needsValue && clause.value === undefined) return `Filter on "${clause.column}" with op "${clause.op}" needs a value.`;
    if (clause.op === 'between' && (!Array.isArray(clause.value) || clause.value.length !== 2)) {
      return `"between" takes a two-element array, e.g. { "column": "coupon", "op": "between", "value": [2, 5] }.`;
    }
    if (clause.op === 'in' && !Array.isArray(clause.value)) return `"in" takes an array of values.`;
  }
  for (const agg of query.aggregate ?? []) {
    if (!agg?.column) return 'Each aggregate needs a "column".';
    if (!(AGG_FNS as readonly string[]).includes(agg.fn)) {
      return `Aggregate fn "${agg.fn}" is not one of: ${AGG_FNS.join(', ')}.`;
    }
  }
  if (query.aggregate?.length && !query.groupBy?.length) {
    return 'aggregate needs groupBy — to total a column across every row without grouping, use summarize_grid_data.';
  }
  if (query.limit !== undefined && (typeof query.limit !== 'number' || query.limit <= 0)) {
    return 'limit must be a positive number.';
  }
  return null;
}

function applyAgg(rows: ReadonlyArray<Record<string, unknown>>, agg: Aggregation): number {
  const values = rows.map((r) => r[agg.column]);
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  switch (agg.fn) {
    case 'count':
      return rows.length;
    case 'countDistinct':
      return new Set(values.filter((v) => !isBlank(v)).map((v) => String(v))).size;
    case 'sum':
      return round(nums.reduce((a, n) => a + n, 0));
    case 'avg':
      return round(nums.length ? nums.reduce((a, n) => a + n, 0) / nums.length : 0);
    case 'min':
      return nums.length ? round(Math.min(...nums)) : 0;
    case 'max':
      return nums.length ? round(Math.max(...nums)) : 0;
    default:
      return 0;
  }
}

function round(n: number): number {
  return Number.isInteger(n) ? n : Math.round(n * 100) / 100;
}

function aggName(agg: Aggregation): string {
  return agg.as ?? `${agg.fn}_${agg.column}`;
}

function runGrouped(
  rows: ReadonlyArray<Record<string, unknown>>,
  query: DataQuery,
): { columns: string[]; rows: Array<Record<string, unknown>> } {
  const groupBy = query.groupBy ?? [];
  const aggregates = query.aggregate?.length ? query.aggregate : [{ column: groupBy[0], fn: 'count' as AggFn, as: 'count' }];
  const buckets = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const key = groupBy.map((c) => (isBlank(row[c]) ? '(blank)' : String(row[c]))).join(' › ');
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }
  const columns = [...groupBy, ...aggregates.map(aggName)];
  const out = [...buckets.entries()].map(([key, bucketRows]) => {
    const parts = key.split(' › ');
    const record: Record<string, unknown> = {};
    groupBy.forEach((col, i) => { record[col] = parts[i]; });
    for (const agg of aggregates) record[aggName(agg)] = applyAgg(bucketRows, agg);
    return record;
  });
  return { columns, rows: out };
}

export function runQuery(rows: ReadonlyArray<Record<string, unknown>>, query: DataQuery): QueryOutcome {
  const invalid = validateQuery(query);
  if (invalid) return { ok: false, error: invalid };

  const filtered = (query.filter ?? []).reduce<ReadonlyArray<Record<string, unknown>>>(
    (acc, clause) => acc.filter((row) => matches(row, clause)),
    rows,
  );

  const grouped = query.groupBy?.length ? runGrouped(filtered, query) : undefined;
  let columns = grouped?.columns ?? (query.columns?.length ? query.columns : inferProjection(filtered));

  // Sorting by something not projected is a common and confusing miss — surface
  // the column, and do it BEFORE projecting: project first and the sort reads a
  // field that has already been dropped, silently leaving the rows unsorted.
  if (query.sortBy?.column && !columns.includes(query.sortBy.column) && !grouped) {
    columns = [...columns, query.sortBy.column];
  }

  // Sort the full rows, which still carry every field, then project.
  let result: ReadonlyArray<Record<string, unknown>> = grouped?.rows ?? filtered;
  if (query.sortBy?.column) {
    const { column, direction } = query.sortBy;
    const dir = direction === 'asc' ? 1 : -1;
    result = [...result].sort((a, b) => compare(a[column], b[column]) * dir);
  }

  const matched = grouped ? grouped.rows.length : filtered.length;
  const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  return {
    ok: true,
    value: {
      columns,
      rows: result.slice(0, limit).map((row) => Object.fromEntries(columns.map((c) => [c, row[c]]))),
      grouped: Boolean(grouped),
      matched,
      scanned: rows.length,
      truncated: matched > limit,
    },
  };
}

/** Columns to show when the query names none: the ones most rows populate. */
function inferProjection(rows: ReadonlyArray<Record<string, unknown>>, max = 8): string[] {
  const counts = new Map<string, number>();
  for (const row of rows.slice(0, 200)) {
    for (const [key, value] of Object.entries(row)) {
      if (!isBlank(value)) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([k]) => k);
}
