/**
 * Turns a set of rows into a compact statistical digest.
 *
 * WHY AGGREGATE HERE RATHER THAN SEND THE ROWS: a blotter holds thousands of
 * rows of 250-field objects. They would not fit in the model's context, and
 * even where they fit, a language model asked to total a column gets it wrong
 * often enough that a confidently-stated wrong number is the likely outcome.
 * So the arithmetic is done here — exactly, deterministically, and cheaply —
 * and the model's job is to narrate the result.
 *
 * Everything in this module is pure. No config, no I/O, no provider.
 */

export type ColumnKind = 'number' | 'date' | 'boolean' | 'text';

export interface NumericStats {
  kind: 'number';
  colId: string;
  count: number;
  nulls: number;
  sum: number;
  mean: number;
  min: number;
  max: number;
  median: number;
}

export interface CategoryStats {
  kind: 'text' | 'boolean';
  colId: string;
  count: number;
  nulls: number;
  distinct: number;
  top: Array<{ value: string; count: number; share: number }>;
}

export interface DateStats {
  kind: 'date';
  colId: string;
  count: number;
  nulls: number;
  earliest: string;
  latest: string;
}

export type ColumnDigest = NumericStats | CategoryStats | DateStats;

export interface GroupDigest {
  value: string;
  rowCount: number;
  share: number;
  totals: Record<string, number>;
}

export interface DataDigest {
  rowCount: number;
  columns: ColumnDigest[];
  groups?: { by: string; buckets: GroupDigest[] };
  highlights: string[];
  sample: Array<Record<string, unknown>>;
}

export interface DigestOptions {
  /** Columns to describe. Defaults to whatever the rows carry, capped. */
  columns?: string[];
  groupBy?: string;
  /** How many categories / groups to name. */
  topN?: number;
  /** Cap on columns when none are named — a positions row has 250+ fields. */
  maxColumns?: number;
}

const DEFAULT_TOP_N = 5;
const DEFAULT_MAX_COLUMNS = 15;

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === '';
}

/** Dates arrive as ISO strings far more often than as Date objects. */
function asDate(value: unknown): number | undefined {
  if (value instanceof Date) return value.getTime();
  if (typeof value !== 'string' || value.length < 8) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) return undefined;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? undefined : ms;
}

function classify(values: readonly unknown[]): ColumnKind {
  const present = values.filter((v) => !isBlank(v));
  if (present.length === 0) return 'text';
  if (present.every((v) => typeof v === 'boolean')) return 'boolean';
  if (present.every((v) => typeof v === 'number' && Number.isFinite(v))) return 'number';
  if (present.every((v) => asDate(v) !== undefined)) return 'date';
  return 'text';
}

function round(n: number): number {
  // Two decimals is plenty for a narrated summary, and keeps the JSON small.
  return Number.isInteger(n) ? n : Math.round(n * 100) / 100;
}

function numericStats(colId: string, values: readonly unknown[]): NumericStats {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const sorted = [...nums].sort((a, b) => a - b);
  const sum = nums.reduce((acc, n) => acc + n, 0);
  const mid = Math.floor(sorted.length / 2);
  return {
    kind: 'number',
    colId,
    count: nums.length,
    nulls: values.length - nums.length,
    sum: round(sum),
    mean: round(nums.length ? sum / nums.length : 0),
    min: round(sorted[0] ?? 0),
    max: round(sorted[sorted.length - 1] ?? 0),
    median: round(
      sorted.length === 0 ? 0 : sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
    ),
  };
}

function categoryStats(colId: string, values: readonly unknown[], kind: 'text' | 'boolean', topN: number): CategoryStats {
  const counts = new Map<string, number>();
  let present = 0;
  for (const value of values) {
    if (isBlank(value)) continue;
    present += 1;
    const key = String(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([value, count]) => ({ value, count, share: round((count / (present || 1)) * 100) }));
  return { kind, colId, count: present, nulls: values.length - present, distinct: counts.size, top };
}

function dateStats(colId: string, values: readonly unknown[]): DateStats {
  const times = values.map(asDate).filter((t): t is number => t !== undefined);
  const sorted = [...times].sort((a, b) => a - b);
  const iso = (t: number | undefined) => (t === undefined ? '' : new Date(t).toISOString().slice(0, 10));
  return {
    kind: 'date',
    colId,
    count: times.length,
    nulls: values.length - times.length,
    earliest: iso(sorted[0]),
    latest: iso(sorted[sorted.length - 1]),
  };
}

function digestColumn(colId: string, values: readonly unknown[], topN: number): ColumnDigest {
  const kind = classify(values);
  if (kind === 'number') return numericStats(colId, values);
  if (kind === 'date') return dateStats(colId, values);
  return categoryStats(colId, values, kind, topN);
}

/** Columns to describe when the caller names none: the ones most rows carry. */
function inferColumns(rows: ReadonlyArray<Record<string, unknown>>, max: number): string[] {
  const seen = new Map<string, number>();
  for (const row of rows) {
    for (const [key, value] of Object.entries(row)) {
      if (isBlank(value)) continue;
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  return [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([key]) => key);
}

function groupRows(
  rows: ReadonlyArray<Record<string, unknown>>,
  by: string,
  numericCols: string[],
  topN: number,
): GroupDigest[] {
  const buckets = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const key = isBlank(row[by]) ? '(blank)' : String(row[by]);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }
  return [...buckets.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, topN)
    .map(([value, bucketRows]) => ({
      value,
      rowCount: bucketRows.length,
      share: round((bucketRows.length / rows.length) * 100),
      totals: Object.fromEntries(
        numericCols.map((colId) => [
          colId,
          round(bucketRows.reduce((acc, r) => acc + (typeof r[colId] === 'number' ? (r[colId] as number) : 0), 0)),
        ]),
      ),
    }));
}

/**
 * The "highlights" a person would actually point at: what dominates, what's
 * lopsided, what's extreme, what's missing. Each is a plain sentence the model
 * can quote or rephrase — the numbers in them are already correct.
 */
function buildHighlights(
  rows: ReadonlyArray<Record<string, unknown>>,
  columns: ColumnDigest[],
  labelCol: string | undefined,
): string[] {
  const out: string[] = [];
  const numerics = columns.filter((c): c is NumericStats => c.kind === 'number' && c.count > 0);

  // Concentration on the largest-magnitude numeric column — the classic
  // "five names are half the book" observation.
  const headline = [...numerics].sort((a, b) => Math.abs(b.sum) - Math.abs(a.sum))[0];
  if (headline && rows.length >= 5 && headline.sum !== 0) {
    const top5 = [...rows]
      .filter((r) => typeof r[headline.colId] === 'number')
      .sort((a, b) => Math.abs(b[headline.colId] as number) - Math.abs(a[headline.colId] as number))
      .slice(0, 5);
    const top5Sum = top5.reduce((acc, r) => acc + (r[headline.colId] as number), 0);
    const share = round((Math.abs(top5Sum) / Math.abs(headline.sum)) * 100);
    const names = labelCol ? top5.map((r) => String(r[labelCol])).join(', ') : `${top5.length} rows`;
    out.push(`Top 5 by ${headline.colId} account for ${share}% of the total (${names}).`);
  }

  for (const stat of numerics.slice(0, 3)) {
    if (stat.max === stat.min) continue;
    const extreme = rows.find((r) => r[stat.colId] === stat.max);
    const label = labelCol && extreme ? ` (${String(extreme[labelCol])})` : '';
    out.push(
      `${stat.colId}: total ${stat.sum}, average ${stat.mean}, ranging ${stat.min} to ${stat.max}${label}.`,
    );
  }

  // A category holding most of the book is worth saying out loud.
  for (const stat of columns) {
    if (stat.kind !== 'text' && stat.kind !== 'boolean') continue;
    const leader = stat.top[0];
    if (!leader || stat.distinct < 2) continue;
    if (leader.share >= 40) {
      out.push(`${stat.colId} is concentrated: ${leader.share}% is "${leader.value}" (${stat.distinct} distinct values).`);
    }
  }

  const gappy = columns.filter((c) => c.nulls > 0 && c.nulls / (c.nulls + c.count) >= 0.2);
  if (gappy.length) {
    out.push(`Sparse column(s): ${gappy.map((c) => `${c.colId} (${round((c.nulls / (c.nulls + c.count)) * 100)}% empty)`).join(', ')}.`);
  }

  return out;
}

/** The column most useful for naming a row in a highlight. */
function pickLabelColumn(columns: ColumnDigest[]): string | undefined {
  const preferred = ['ticker', 'symbol', 'cusip', 'isin', 'issuerName', 'name', 'id'];
  for (const want of preferred) {
    const hit = columns.find((c) => c.colId.toLowerCase() === want.toLowerCase());
    if (hit) return hit.colId;
  }
  return columns.find((c) => c.kind === 'text' && c.distinct === c.count)?.colId;
}

export function summariseRows(
  rows: ReadonlyArray<Record<string, unknown>>,
  options: DigestOptions = {},
): DataDigest {
  const topN = options.topN ?? DEFAULT_TOP_N;
  if (rows.length === 0) {
    return { rowCount: 0, columns: [], highlights: ['The feed returned no rows.'], sample: [] };
  }

  const colIds = options.columns?.length
    ? options.columns
    : inferColumns(rows, options.maxColumns ?? DEFAULT_MAX_COLUMNS);
  const columns = colIds.map((colId) => digestColumn(colId, rows.map((r) => r[colId]), topN));
  const labelCol = pickLabelColumn(columns);

  const digest: DataDigest = {
    rowCount: rows.length,
    columns,
    highlights: buildHighlights(rows, columns, labelCol),
    // Three rows is enough for the model to describe shape without the result
    // becoming the rows themselves.
    sample: rows.slice(0, 3).map((row) => Object.fromEntries(colIds.map((c) => [c, row[c]]))),
  };

  if (options.groupBy) {
    const numericCols = columns.filter((c) => c.kind === 'number').map((c) => c.colId).slice(0, 3);
    digest.groups = { by: options.groupBy, buckets: groupRows(rows, options.groupBy, numericCols, topN) };
  }
  return digest;
}
