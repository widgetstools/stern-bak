/**
 * Schema inference — completeness-weighted sampling.
 *
 * Walks a sample of rows and infers a field tree. The "weight" here is
 * the count of non-null/non-empty top-level fields per row; rows with
 * the fullest coverage take priority so sparse rows don't dilute the
 * result.
 *
 * Paths follow the shared field-path grammar (`@wellsfargo-starui/types`
 * `fieldPath.ts`): object members are dotted (`risk.dv01`), keys that
 * contain `.`/`[`/`]`/quotes are bracket-quoted (`["a.b"]`), and arrays
 * are DESCENDED positionally — an array node (`legs`, type `array`) gets
 * one child per observed element index (`legs[0]`, `legs[1]`, …, capped
 * by `maxArrayElements`), each inferred like any other value, so a user
 * can pick `legs[0].rate` as a column. The array node itself stays
 * selectable as an opaque column.
 *
 * Pulled out as a standalone module so it's reusable from STOMP /
 * REST / future probe paths without dragging the whole provider.
 *
 * `FieldNode` matches the shape used by the editor's Fields tab.
 */

import { appendFieldPath, type FieldNode } from '@wellsfargo-starui/types';

export interface InferOptions {
  /** Cap the number of rows considered. Default 200. */
  targetSampleSize?: number;
  /** Cap the number of fields kept (deterministic insertion order). */
  maxFields?: number;
  /**
   * Array elements descended per array (positional child paths such as
   * `legs[0].rate`). Default 16; `0` keeps arrays opaque (no children).
   */
  maxArrayElements?: number;
}

const DEFAULT_MAX_ARRAY_ELEMENTS = 16;

interface FieldAccum {
  path: string;
  name: string;
  type: FieldNode['type'];
  /** Number of sample rows where the field had a non-null value. */
  presence: number;
  /** First non-null example value. */
  sample?: unknown;
  children?: Map<string | number, FieldAccum>;
}

/**
 * @param rows  raw row records (typically the snapshot of a probe call).
 * @param opts  inference budget.
 * @returns the inferred field tree with completeness percentages
 *          attached, plus the rows that survived sampling so the UI
 *          can show "n/N rows used".
 */
export function inferFields(
  rows: readonly unknown[],
  opts: InferOptions = {},
): { fields: FieldNode[]; rowsUsed: number; rowsFetched: number } {
  if (rows.length === 0) {
    return { fields: [], rowsUsed: 0, rowsFetched: 0 };
  }

  let working = rows;
  if (opts.targetSampleSize && rows.length > opts.targetSampleSize) {
    const target = opts.targetSampleSize;
    const scored = rows.map((row, idx) => ({ row, idx, score: completenessScore(row) }));
    scored.sort((a, b) => (b.score - a.score) || (a.idx - b.idx));
    working = scored.slice(0, target).map((s) => s.row);
  }

  const maxArrayElements = opts.maxArrayElements ?? DEFAULT_MAX_ARRAY_ELEMENTS;
  const root = new Map<string | number, FieldAccum>();
  for (const row of working) accumObject(root, '', row, maxArrayElements);

  const fields = collect(root, working.length);
  const trimmed = opts.maxFields && fields.length > opts.maxFields
    ? fields.slice(0, opts.maxFields)
    : fields;

  return { fields: trimmed, rowsUsed: working.length, rowsFetched: rows.length };
}

function completenessScore(row: unknown): number {
  if (!row || typeof row !== 'object') return 0;
  let n = 0;
  for (const v of Object.values(row)) {
    if (v === null || v === undefined) continue;
    if (typeof v === 'string' && v === '') continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'object' && v !== null && Object.keys(v as object).length === 0) continue;
    n += 1;
  }
  return n;
}

/** Fold one object's members into `into` (rows and nested objects; arrays go through `accumArray`). */
function accumObject(
  into: Map<string | number, FieldAccum>,
  prefix: string,
  value: unknown,
  maxArrayElements: number,
): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const [k, v] of Object.entries(value)) {
    let entry = into.get(k);
    if (!entry) {
      entry = { path: appendFieldPath(prefix, k), name: k, type: typeOf(v), presence: 0 };
      into.set(k, entry);
    }
    note(entry, v, maxArrayElements);
  }
}

/** Fold the first `maxArrayElements` elements of an array into positional children. */
function accumArray(
  into: Map<string | number, FieldAccum>,
  prefix: string,
  arr: readonly unknown[],
  maxArrayElements: number,
): void {
  const n = Math.min(arr.length, maxArrayElements);
  for (let i = 0; i < n; i++) {
    const v = arr[i];
    let entry = into.get(i);
    if (!entry) {
      entry = { path: appendFieldPath(prefix, i), name: `[${i}]`, type: typeOf(v), presence: 0 };
      into.set(i, entry);
    }
    note(entry, v, maxArrayElements);
  }
}

/** Record one observation of `v` against `entry`, descending containers. */
function note(entry: FieldAccum, v: unknown, maxArrayElements: number): void {
  if (v !== null && v !== undefined) {
    entry.presence += 1;
    if (entry.sample === undefined) {
      entry.sample = v;
      // The first observation may have been null (typed 'string' by
      // default); the first real value decides the type.
      entry.type = typeOf(v);
    }
  }
  if (!v || typeof v !== 'object') return;
  if (Array.isArray(v)) {
    entry.type = 'array';
    if (maxArrayElements > 0) {
      entry.children = entry.children ?? new Map();
      accumArray(entry.children, entry.path, v, maxArrayElements);
    }
    return;
  }
  entry.type = 'object';
  entry.children = entry.children ?? new Map();
  accumObject(entry.children, entry.path, v, maxArrayElements);
}

function typeOf(v: unknown): FieldNode['type'] {
  if (v === null || v === undefined) return 'string';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'string') {
    // Heuristic: ISO 8601 date-ish strings register as date.
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return 'date';
    return 'string';
  }
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'object') return 'object';
  return 'string';
}

function collect(map: Map<string | number, FieldAccum>, total: number): FieldNode[] {
  const out: FieldNode[] = [];
  for (const entry of map.values()) {
    const node: FieldNode = {
      path: entry.path,
      name: entry.name,
      type: entry.type,
      // Nullable iff at least one sampled row was missing this field.
      nullable: total > 0 && entry.presence < total,
      sample: entry.sample,
    };
    if (entry.children && entry.children.size > 0) node.children = collect(entry.children, total);
    out.push(node);
  }
  return out;
}
