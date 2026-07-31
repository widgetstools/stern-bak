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
 * Nested paths (`a.b.c`) copy just the needed subtree. Values are
 * copied by reference (rows are never mutated downstream), and prefix
 * dedupe guarantees a projected row never aliases a subtree that a
 * longer path would then write into.
 */

import type { ColumnDefinition } from '@wellsfargo-starui/types';

export type FieldProjector = (row: unknown) => unknown;

/**
 * Union of column field paths and keyColumn component(s), with any
 * path covered by a shorter prefix path dropped (`a.b` copies the
 * whole subtree by reference, so also writing `a.b.c` afterwards would
 * mutate the shared SOURCE subtree).
 */
export function collectProjectionPaths(
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

  return [...raw].filter((p) => {
    const parts = p.split('.');
    for (let i = 1; i < parts.length; i++) {
      if (raw.has(parts.slice(0, i).join('.'))) return false;
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
  const nested: string[][] = [];
  for (const p of paths) {
    if (p.includes('.')) nested.push(p.split('.'));
    else top.push(p);
  }

  return (row: unknown): unknown => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const src = row as Record<string, unknown>;
    const out: Record<string, unknown> = {};

    for (const f of top) {
      const v = src[f];
      if (v !== undefined) out[f] = v;
    }

    for (const parts of nested) {
      let cur: unknown = src;
      for (const seg of parts) {
        if (!cur || typeof cur !== 'object' || Array.isArray(cur)) {
          cur = undefined;
          break;
        }
        cur = (cur as Record<string, unknown>)[seg];
        if (cur === undefined) break;
      }
      if (cur === undefined) continue;

      // Intermediate objects in `out` are always freshly created here
      // (prefix dedupe means no nested path shares a prefix with a
      // copied top-level field), so these writes can't reach `src`.
      let tgt = out;
      for (let i = 0; i < parts.length - 1; i++) {
        const seg = parts[i]!;
        const next = tgt[seg];
        if (next && typeof next === 'object' && !Array.isArray(next)) {
          tgt = next as Record<string, unknown>;
        } else {
          const child: Record<string, unknown> = {};
          tgt[seg] = child;
          tgt = child;
        }
      }
      tgt[parts[parts.length - 1]!] = cur;
    }

    return out;
  };
}
