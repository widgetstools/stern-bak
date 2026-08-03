/**
 * Lift dotted `columnDefinitions` / `keyColumn` paths onto literal top-level
 * scalar keys — the `rowShape: 'flat'` delivery shape.
 *
 * Unlike {@link createFieldProjector}, which prunes a row while PRESERVING its
 * nested subtrees, this writes `rating.moody` as a flat key so a consumer that
 * cannot hold nested values still sees every authored column. A Perspective
 * schema is a flat map of typed columns, so a nested value there is not
 * degraded — it is dropped, silently, with no error anywhere.
 *
 * Non-scalar values are skipped rather than stringified: a column def whose
 * `field` points at an object or array has no flat representation, and
 * inventing one would put `"[object Object]"` into a typed column.
 */

import type { ColumnDefinition } from '@wellsfargo-starui/types';
import { getValueByPath } from '@wellsfargo-starui/types';

export type FlatRowFlattener = (row: unknown) => Record<string, unknown>;

function isFlatScalar(value: unknown): boolean {
  if (value === null) return true;
  const t = typeof value;
  if (t === 'string' || t === 'number' || t === 'boolean') return true;
  return value instanceof Date;
}

/** Union of column field paths + keyColumn parts. */
export function collectFlatRowPaths(
  columnDefinitions: readonly ColumnDefinition[] | undefined,
  keyColumn: string | readonly string[] | undefined,
): string[] {
  const paths = new Set<string>();
  for (const col of columnDefinitions ?? []) {
    if (col.field) paths.add(col.field);
  }
  if (typeof keyColumn === 'string') paths.add(keyColumn);
  else if (Array.isArray(keyColumn)) {
    for (const k of keyColumn) if (typeof k === 'string') paths.add(k);
  }
  return [...paths];
}

/**
 * Compile a per-row flattener from the provider's column definitions.
 *
 * Returns `null` when there are no paths to lift — callers must then pass rows
 * through untouched, because a flattener with no paths emits empty objects.
 */
export function createFlatRowFlattener(
  columnDefinitions: readonly ColumnDefinition[] | undefined,
  keyColumn: string | readonly string[] | undefined,
): FlatRowFlattener | null {
  const paths = collectFlatRowPaths(columnDefinitions, keyColumn);
  if (paths.length === 0) return null;

  return (row: unknown): Record<string, unknown> => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return {};
    const out: Record<string, unknown> = {};
    for (const path of paths) {
      const value = getValueByPath(row, path);
      if (value === undefined) continue;
      if (!isFlatScalar(value)) continue;
      out[path] = value;
    }
    return out;
  };
}
