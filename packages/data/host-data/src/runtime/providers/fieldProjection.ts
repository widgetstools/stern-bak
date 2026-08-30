/**
 * fieldProjection — prune wide upstream rows down to the fields the UI
 * can actually see (`columnDefinitions[].field` paths + `keyColumn`)
 * at frame-parse time in the worker, BEFORE rows enter the snapshot
 * buffer / hub cache.
 *
 * Feeds that ship 2000-field objects when the blotter renders 200 pay
 * ~10x on worker cache memory, snapshot encode, postMessage payloads
 * and client parse in every window. Projection cuts all of it at the
 * earliest possible point.
 *
 * Paths follow the shared field-path grammar (`a.b.c`, `legs[0].rate`,
 * `["a.b"]`) and copy just the needed subtree — an index segment keeps
 * only that element (other slots stay empty). Values are copied by
 * reference (rows are never mutated downstream), and prefix dedupe
 * guarantees a projected row never aliases a subtree that a longer path
 * would then write into.
 */

import {
  fieldPathSegments,
  isFieldPathPrefix,
  type ColumnDefinition,
  type FieldPathSegment,
} from '@wellsfargo-starui/types';

export type FieldProjector = (row: unknown) => unknown;

/**
 * Every requested path — column fields plus keyColumn component(s) —
 * deduped by exact string, in first-seen order. This is the input for
 * the flatten plan (`jsonFlatten.ts`), which wants ALL paths (a user may
 * legitimately show both `risk` opaque and `risk.dv01`).
 */
export function collectFieldPaths(
  columnDefinitions: readonly ColumnDefinition[] | undefined,
  keyColumn: string | readonly string[] | undefined,
): string[] {
  const raw = new Set<string>();
  for (const col of columnDefinitions ?? []) {
    if (col.field) raw.add(col.field);
  }
  if (typeof keyColumn === 'string') raw.add(keyColumn);
  else if (Array.isArray(keyColumn)) {
    for (const k of keyColumn) if (typeof k === 'string') raw.add(k);
  }
  return [...raw];
}

/**
 * {@link collectFieldPaths} with any path covered by a shorter prefix
 * path dropped (`a.b` copies the whole subtree by reference, so also
 * writing `a.b.c` afterwards would mutate the shared SOURCE subtree).
 * Prefixes compare segment-wise, so `ab` never covers `abc`.
 */
export function collectProjectionPaths(
  columnDefinitions: readonly ColumnDefinition[] | undefined,
  keyColumn: string | readonly string[] | undefined,
): string[] {
  const paths = collectFieldPaths(columnDefinitions, keyColumn);
  const parsed = paths.map((p) => fieldPathSegments(p));
  return paths.filter((_, i) => {
    const segs = parsed[i] as readonly FieldPathSegment[];
    for (let j = 0; j < parsed.length; j++) {
      if (j === i) continue;
      const other = parsed[j] as readonly FieldPathSegment[];
      if (other.length < segs.length && isFieldPathPrefix(other, segs)) return false;
    }
    return true;
  });
}

/**
 * Compile a per-row projector from the provider's column definitions.
 * Returns `null` when there is nothing to project by (no columns, no
 * keyColumn) — callers should then pass rows through untouched rather
 * than projecting everything away.
 */
export function createFieldProjector(
  columnDefinitions: readonly ColumnDefinition[] | undefined,
  keyColumn: string | readonly string[] | undefined,
): FieldProjector | null {
  const paths = collectProjectionPaths(columnDefinitions, keyColumn);
  if (paths.length === 0) return null;

  const top: string[] = [];
  const nested: (readonly FieldPathSegment[])[] = [];
  for (const p of paths) {
    const segs = fieldPathSegments(p);
    if (segs.length === 1 && typeof segs[0] === 'string') top.push(segs[0]);
    else nested.push(segs);
  }

  return (row: unknown): unknown => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const src = row as Record<string, unknown>;
    const out: Record<string, unknown> = {};

    for (const f of top) {
      const v = src[f];
      if (v !== undefined) out[f] = v;
    }

    for (const segs of nested) {
      let cur: unknown = src;
      for (let i = 0; i < segs.length; i++) {
        const seg = segs[i] as FieldPathSegment;
        // Strict like the flattener: `[n]` reads arrays only, a key reads
        // objects only — the projected row must keep the source's shape.
        if (!cur || typeof cur !== 'object' || Array.isArray(cur) !== (typeof seg === 'number')) {
          cur = undefined;
          break;
        }
        cur = (cur as Record<string | number, unknown>)[seg];
        if (cur === undefined) break;
      }
      if (cur === undefined) continue;

      // Intermediate containers in `out` are always freshly created here
      // (prefix dedupe means no nested path shares a prefix with a
      // copied top-level field), so these writes can't reach `src`.
      let tgt: Record<string | number, unknown> = out;
      for (let i = 0; i < segs.length - 1; i++) {
        const seg = segs[i] as FieldPathSegment;
        const next = tgt[seg];
        if (next && typeof next === 'object') {
          tgt = next as Record<string | number, unknown>;
        } else {
          const child = (typeof segs[i + 1] === 'number' ? [] : {}) as Record<string | number, unknown>;
          tgt[seg] = child;
          tgt = child;
        }
      }
      tgt[segs[segs.length - 1] as FieldPathSegment] = cur;
    }

    return out;
  };
}
