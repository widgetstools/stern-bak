/**
 * Schema inference — completeness-weighted sampling.
 *
 * Walks a sample of rows and infers a flat field tree. The "weight"
 * here is the count of non-null/non-empty top-level fields per row;
 * rows with the fullest coverage take priority so sparse rows don't
 * dilute the result.
 *
 * Pulled out as a standalone module so it's reusable from STOMP /
 * REST / future probe paths without dragging the whole provider.
 *
 * `FieldNode` matches the shape used by the editor's Fields tab —
 * we keep the same wire format as v1 so the UI doesn't have to
 * relearn anything when v2 ships.
 */

import type { FieldNode } from '@wellsfargo-starui/types';

export interface InferOptions {
  /** Cap the number of rows considered. Default 200. */
  targetSampleSize?: number;
  /** Cap the number of fields kept (deterministic insertion order). */
  maxFields?: number;
}

interface FieldAccum {
  path: string;
  type: FieldNode['type'];
  /** Number of sample rows where the field had a non-null value. */
  presence: number;
  /** First non-null example value. */
  sample?: unknown;
  children?: Map<string, FieldAccum>;
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

  const root = new Map<string, FieldAccum>();
  for (const row of working) accum(root, '', row);

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

function accum(into: Map<string, FieldAccum>, prefix: string, value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const [k, v] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${k}` : k;
    let entry = into.get(k);
    if (!entry) {
      entry = { path, type: typeOf(v), presence: 0 };
      into.set(k, entry);
    }
    if (v !== null && v !== undefined) {
      entry.presence += 1;
      if (entry.sample === undefined) entry.sample = v;
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      entry.type = 'object';
      entry.children = entry.children ?? new Map();
      accum(entry.children, path, v);
    }
  }
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

function collect(map: Map<string, FieldAccum>, total: number): FieldNode[] {
  const out: FieldNode[] = [];
  for (const entry of map.values()) {
    const node: FieldNode = {
      path: entry.path,
      name: entry.path.split('.').pop() ?? entry.path,
      type: entry.type,
      // Nullable iff at least one sampled row was missing this field.
      nullable: total > 0 && entry.presence < total,
      sample: entry.sample,
    };
    if (entry.children) node.children = collect(entry.children, total);
    out.push(node);
  }
  return out;
}
