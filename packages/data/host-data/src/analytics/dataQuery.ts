/**
 * A small, total query language over already-fetched rows — filter, group,
 * aggregate, sort, limit.
 *
 * This is the "cell" the AI Assistant runs. The model doesn't write code and
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
  /**
   * Column dimension — turns a grouped result into a pivot (cross-tab).
   * `groupBy` is the row dimension, `pivotBy` the column dimension,
   * `aggregate` the measures that fill the cells. Same three-role shape as
   * the live grid's own `set_row_grouping` tool, so it reads the same way
   * even though this is a different query engine entirely.
   */
  pivotBy?: string[];
  sortBy?: { column: string; direction?: 'asc' | 'desc' };
  limit?: number;
}

/** Which columns of a pivoted `QueryResult` are row labels vs. pivoted measures. */
export interface PivotMeta {
  rowDims: string[];
  colDims: string[];
  measures: string[];
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
  /** Set when `pivotBy` was used — tells the renderer which leading columns
   *  are row labels (freeze them) rather than pivoted data. */
  pivot?: PivotMeta;
  /** Plain-sentence observations about THIS result — the query-engine
   *  counterpart of `DataDigest.highlights` (`dataDigest.ts`). */
  highlights?: string[];
}

export type QueryOutcome = { ok: true; value: QueryResult } | { ok: false; error: string };

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
/** Flattened pivot columns (distinct pivotBy tuples × aggregates) allowed
 *  before the table stops being readable — over this, reject rather than
 *  silently build something nobody can use. */
const MAX_PIVOT_COLUMNS = 30;

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
  if (query.pivotBy?.length) {
    // Checked BEFORE the generic "aggregate needs groupBy" rule below, so a
    // pivotBy-without-groupBy call gets the more specific, actionable
    // message rather than the generic one (both would technically be true).
    // Mirrors the errors written for the live grid's own pivot mode
    // (set_row_grouping) — same shape of mistake, same voice.
    if (!query.groupBy?.length) {
      return 'pivotBy needs groupBy — it is the row dimension a pivot rolls up into (rows from groupBy, columns from pivotBy). Pass both, or drop pivotBy for a plain grouped table.';
    }
    if (!query.aggregate?.length) {
      return 'pivotBy needs aggregate — it is what fills the pivoted cells, e.g. [{ "column": "marketValue", "fn": "sum" }].';
    }
    const overlap = query.pivotBy.filter((c) => query.groupBy!.includes(c));
    if (overlap.length) {
      return `Column(s) in both groupBy and pivotBy: ${overlap.join(', ')}. A column can be the row dimension or the column dimension, not both.`;
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

/** Joins a row's values for the given columns into one bucket key — same
 *  scheme `runGrouped` uses for its row dimension, reused here for both the
 *  row AND column dimensions of a pivot. */
function tupleKey(row: Record<string, unknown>, cols: readonly string[]): string {
  return cols.map((c) => (isBlank(row[c]) ? '(blank)' : String(row[c]))).join(' › ');
}

type PivotOutcome =
  | { ok: true; value: { columns: string[]; rows: Array<Record<string, unknown>>; pivot: PivotMeta } }
  | { ok: false; error: string };

/**
 * Cross-tabs `rows` by `query.groupBy` (rows) × `query.pivotBy` (columns),
 * filling cells with `query.aggregate`. Guardrails (column count, name
 * collisions) run against the actual distinct values in the data, which
 * `validateQuery` can't see — that's why they live here rather than there.
 */
function runPivot(rows: ReadonlyArray<Record<string, unknown>>, query: DataQuery): PivotOutcome {
  const rowDims = query.groupBy!;
  const colDims = query.pivotBy!;
  const aggregates = query.aggregate!;
  const measures = aggregates.map(aggName);

  // Distinct pivotBy tuples actually present — the column dimension.
  const pivotKeys = [...new Set(rows.map((r) => tupleKey(r, colDims)))].sort();
  const flatColumnCount = pivotKeys.length * aggregates.length;
  if (flatColumnCount > MAX_PIVOT_COLUMNS) {
    return {
      ok: false,
      error:
        `${colDims.join(', ')} has ${pivotKeys.length} distinct value(s), which would build ${flatColumnCount} ` +
        `pivot column(s) — over the ${MAX_PIVOT_COLUMNS} limit. Narrow it with a filter first.`,
    };
  }

  // One flattened column name per (pivot value × aggregate). Multiple
  // aggregates need the measure in the label to stay distinct; a single
  // aggregate keeps just the pivot value, which is what a reader expects a
  // pivot's column header to be.
  const flatName = (pivotValue: string, agg: Aggregation) =>
    aggregates.length > 1 ? `${aggName(agg)} · ${pivotValue}` : pivotValue;
  const flatColumns = pivotKeys.flatMap((pv) => aggregates.map((agg) => flatName(pv, agg)));
  const dupes = [...new Set(flatColumns.filter((name, i) => flatColumns.indexOf(name) !== i))];
  if (dupes.length > 0) {
    return {
      ok: false,
      error:
        `Pivoting by ${colDims.join(', ')} produced duplicate column name(s) (${dupes.join(', ')}) — two distinct ` +
        'values format to the same label. Rename or drop one from pivotBy.',
    };
  }

  const rowBuckets = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const key = tupleKey(row, rowDims);
    const bucket = rowBuckets.get(key);
    if (bucket) bucket.push(row);
    else rowBuckets.set(key, [row]);
  }

  const out = [...rowBuckets.entries()].map(([key, bucketRows]) => {
    const parts = key.split(' › ');
    const record: Record<string, unknown> = {};
    rowDims.forEach((col, i) => { record[col] = parts[i]; });

    const cellBuckets = new Map<string, Record<string, unknown>[]>();
    for (const row of bucketRows) {
      const pk = tupleKey(row, colDims);
      const bucket = cellBuckets.get(pk);
      if (bucket) bucket.push(row);
      else cellBuckets.set(pk, [row]);
    }
    for (const pv of pivotKeys) {
      const cellRows = cellBuckets.get(pv);
      for (const agg of aggregates) {
        // No rows for this (row, column) combination — `null`, not a
        // computed 0. A pivot is dense by construction (every row×column
        // combo gets a cell), so most sparse fixed-income cross-tabs will
        // have real gaps, and displaying "0" in every one would read as a
        // measured zero rather than "no data here". The renderer already
        // shows a null cell as "—".
        record[flatName(pv, agg)] = cellRows ? applyAgg(cellRows, agg) : null;
      }
    }
    return record;
  });

  return { ok: true, value: { columns: [...rowDims, ...flatColumns], rows: out, pivot: { rowDims, colDims, measures } } };
}

/**
 * The query-engine counterpart of `dataDigest.ts`'s `buildHighlights` — a
 * plain sentence naming what dominates in a grouped or pivoted result, so a
 * chart/pivot/heatmap carries a synopsis without depending on the model to
 * write one every time. Gated on `!truncated`: a "% of total" claim would be
 * dishonest once some groups or cells are hidden past the row limit, so this
 * skips rather than mislead — same discipline as the provenance rule for a
 * generated sample never reading like the whole book.
 */
function buildQueryHighlights(query: DataQuery, result: Pick<QueryResult, 'columns' | 'rows' | 'pivot' | 'truncated'>): string[] {
  if (result.truncated || result.rows.length < 2) return [];

  if (result.pivot) {
    const { rowDims } = result.pivot;
    const cellCols = result.columns.filter((c) => !rowDims.includes(c));
    let best: { row: Record<string, unknown>; col: string; value: number } | undefined;
    let total = 0;
    for (const row of result.rows) {
      for (const col of cellCols) {
        const v = row[col];
        if (typeof v !== 'number') continue;
        total += Math.abs(v);
        if (!best || Math.abs(v) > Math.abs(best.value)) best = { row, col, value: v };
      }
    }
    if (!best || total === 0) return [];
    const rowLabel = rowDims.map((d) => String(best!.row[d])).join(' / ');
    const share = round((Math.abs(best.value) / total) * 100);
    return [`Largest cell: ${rowLabel} × ${best.col} at ${round(best.value)} (${share}% of the ${round(total)} total).`];
  }

  if (!query.groupBy?.length) return [];
  const agg = query.aggregate?.length ? query.aggregate[0] : { column: query.groupBy[0], fn: 'count' as const, as: 'count' };
  const measureCol = aggName(agg);
  const numericRows = result.rows.filter((r) => typeof r[measureCol] === 'number');
  if (numericRows.length < 2) return [];
  const total = numericRows.reduce((s, r) => s + Math.abs(r[measureCol] as number), 0);
  if (total === 0) return [];
  const leader = [...numericRows].sort((a, b) => Math.abs(b[measureCol] as number) - Math.abs(a[measureCol] as number))[0];
  const label = query.groupBy.map((g) => String(leader[g])).join(' / ');
  const share = round((Math.abs(leader[measureCol] as number) / total) * 100);
  return [
    `${label} leads on ${measureCol} at ${round(leader[measureCol] as number)} (${share}% of the ${round(total)} total across ${numericRows.length} ${query.groupBy.join('/')} group(s)).`,
  ];
}

export function runQuery(rows: ReadonlyArray<Record<string, unknown>>, query: DataQuery): QueryOutcome {
  const invalid = validateQuery(query);
  if (invalid) return { ok: false, error: invalid };

  const filtered = (query.filter ?? []).reduce<ReadonlyArray<Record<string, unknown>>>(
    (acc, clause) => acc.filter((row) => matches(row, clause)),
    rows,
  );

  if (query.pivotBy?.length) {
    const pivoted = runPivot(filtered, query);
    if (!pivoted.ok) return pivoted;
    const { columns, rows: pivotRows, pivot } = pivoted.value;

    let result = pivotRows;
    if (query.sortBy?.column && columns.includes(query.sortBy.column)) {
      const { column, direction } = query.sortBy;
      const dir = direction === 'asc' ? 1 : -1;
      result = [...result].sort((a, b) => compare(a[column], b[column]) * dir);
    }

    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
    const value: QueryResult = {
      columns,
      rows: result.slice(0, limit),
      grouped: true,
      matched: pivotRows.length,
      scanned: rows.length,
      truncated: pivotRows.length > limit,
      pivot,
    };
    return { ok: true, value: { ...value, highlights: buildQueryHighlights(query, value) } };
  }

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
  const value: QueryResult = {
    columns,
    rows: result.slice(0, limit).map((row) => Object.fromEntries(columns.map((c) => [c, row[c]]))),
    grouped: Boolean(grouped),
    matched,
    scanned: rows.length,
    truncated: matched > limit,
  };
  return { ok: true, value: { ...value, highlights: buildQueryHighlights(query, value) } };
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
