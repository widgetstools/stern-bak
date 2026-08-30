/**
 * Row-path helpers — reading / writing a row through a field path, and
 * deriving row ids from `keyColumn`. This is the single implementation
 * behind `@wellsfargo-starui/types` (root) and `@wellsfargo-starui/types/shared`.
 *
 * Every path is read through the shared grammar in `fieldPath.ts`
 * (`a.b`, `legs[0].rate`, `["a.b"].c`), with one rule layered on top:
 * a row that carries the WHOLE path as a literal flat key wins
 * (`row['risk.dv01']`, the shape an upstream / ingest-time flattener
 * produces), and only then is the nested shape walked. A path that does
 * not parse is read as a single literal key, never thrown on.
 */

import { fieldPathSegments, type FieldPathSegment } from './fieldPath.js';

/** Separator used when composing row ids from multiple key columns. */
export const COMPOSITE_KEY_SEPARATOR = '-';

// Memoized: `composeRowId` runs per ROW on every hot path in the system
// (hub cache upsert, STOMP conflation key, AG Grid getRowId, provider
// row splitting) while `keyColumn` is config that never changes — the
// un-memoized version allocated ~4 throwaway arrays per row (~80k+/sec
// at 10k updates/sec). String inputs are config-cardinality (bounded
// cache, defensive cap); array inputs memoize by reference (WeakMap),
// so an unstable caller-built array degrades to the old behaviour
// rather than breaking.
const NORMALIZED_BY_STRING = new Map<string, readonly string[] | null>();
const NORMALIZED_BY_ARRAY = new WeakMap<readonly string[], readonly string[] | null>();
const NORMALIZED_STRING_CACHE_MAX = 1000;

function normalizeKeyColumnsUncached(arr: readonly unknown[]): readonly string[] | null {
  const cleaned = arr
    .filter((c): c is string => typeof c === 'string')
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  return cleaned.length > 0 ? cleaned : null;
}

export function normalizeKeyColumns(
  keyColumn: string | readonly string[] | null | undefined,
): readonly string[] | null {
  if (keyColumn == null) return null;
  if (typeof keyColumn === 'string') {
    let cached = NORMALIZED_BY_STRING.get(keyColumn);
    if (cached === undefined) {
      cached = normalizeKeyColumnsUncached([keyColumn]);
      if (NORMALIZED_BY_STRING.size >= NORMALIZED_STRING_CACHE_MAX) {
        NORMALIZED_BY_STRING.clear();
      }
      NORMALIZED_BY_STRING.set(keyColumn, cached);
    }
    return cached;
  }
  if (!Array.isArray(keyColumn)) return null;
  let cached = NORMALIZED_BY_ARRAY.get(keyColumn);
  if (cached === undefined) {
    cached = normalizeKeyColumnsUncached(keyColumn);
    NORMALIZED_BY_ARRAY.set(keyColumn, cached);
  }
  return cached;
}

/** A single-key path (`px`, but not `["a.b"]`) — nothing to walk once the flat lookup misses. */
function isPlainKey(path: string, segs: readonly FieldPathSegment[]): boolean {
  return segs.length === 1 && segs[0] === path;
}

function walk(root: Record<string, unknown>, segs: readonly FieldPathSegment[]): unknown {
  let cursor: unknown = root;
  for (let i = 0; i < segs.length; i++) {
    if (cursor == null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string | number, unknown>)[segs[i] as FieldPathSegment];
  }
  return cursor;
}

/**
 * Resolve a value at a field path on a row.
 *
 *   1. If the row carries a literal flat key matching the FULL path
 *      (`row['weird.key']`, `row['legs[0].rate']`), that wins — the shape
 *      flattened feeds and odd upstream keys produce.
 *   2. Otherwise walk the parsed segments: `getValueByPath({a:{b:{c:1}}}, 'a.b.c') === 1`,
 *      `getValueByPath({legs:[{rate:2}]}, 'legs[0].rate') === 2`.
 *   3. `undefined` for any missing segment along the way, or a non-object root.
 */
export function getValueByPath(row: unknown, path: string): unknown {
  if (row == null || typeof row !== 'object') return undefined;
  const obj = row as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(obj, path)) return obj[path];
  const segs = fieldPathSegments(path);
  if (isPlainKey(path, segs)) return undefined;
  return walk(obj, segs);
}

export function composeRowId(
  row: unknown,
  keyColumn: string | readonly string[] | null | undefined,
): string | null {
  const cols = normalizeKeyColumns(keyColumn);
  if (!cols || !row || typeof row !== 'object') return null;
  if (cols.length === 1) {
    const v = getValueByPath(row, cols[0] as string);
    if (v === null || v === undefined) return null;
    return String(v);
  }
  const parts: string[] = [];
  for (const col of cols) {
    const v = getValueByPath(row, col);
    if (v === null || v === undefined) return null;
    parts.push(String(v));
  }
  return parts.join(COMPOSITE_KEY_SEPARATOR);
}

// ─── Compiled path accessor cache ─────────────────────────────────────
// Closure-per-path cache shared between ColDef valueGetters (via
// `nestedField()` in @wellsfargo-starui/core) and the expression engine's
// `[…]` reference resolution.
//
// Identity guarantee: `getPathAccessor(p) === getPathAccessor(p)` for
// any path `p`. Callers may rely on stable closure identity for
// memoisation / cache keys.

const accessorCache = new Map<string, (row: unknown) => unknown>();
const setterCache = new Map<string, (row: unknown, value: unknown) => boolean>();

/**
 * Return a cached closure that reads `path` from a row. Semantics match
 * {@link getValueByPath}: literal-flat-key priority on the root, then a
 * null-safe walk of the parsed segments.
 */
export function getPathAccessor(path: string): (row: unknown) => unknown {
  const cached = accessorCache.get(path);
  if (cached) return cached;

  const segs = fieldPathSegments(path);
  let fn: (row: unknown) => unknown;
  if (isPlainKey(path, segs)) {
    // Fast path — single segment, no walking.
    fn = (row) => {
      if (row == null || typeof row !== 'object') return undefined;
      return (row as Record<string, unknown>)[path];
    };
  } else {
    fn = (row) => {
      if (row == null || typeof row !== 'object') return undefined;
      const obj = row as Record<string, unknown>;
      if (Object.prototype.hasOwnProperty.call(obj, path)) return obj[path];
      return walk(obj, segs);
    };
  }
  accessorCache.set(path, fn);
  return fn;
}

/**
 * Return a cached closure that writes `value` to `path` on a row,
 * creating intermediate containers as needed — a plain object before a
 * key segment, an array before an index segment (`legs[0].rate` on an
 * empty row yields `{ legs: [{ rate }] }`).
 *
 * Returns `true` if the write changed the value (`!Object.is(old, new)`),
 * `false` if it was a no-op or the root is not an object. Mutates the
 * row in place.
 *
 * Unlike the read path, the setter does NOT honour the literal-flat-key
 * priority — writing through `"x.y"` always creates `{ x: { y: value } }`.
 * The read priority is a defence against flattened / weird upstream
 * feeds; the write is an intentional structural commitment.
 */
export function getPathSetter(path: string): (row: unknown, value: unknown) => boolean {
  const cached = setterCache.get(path);
  if (cached) return cached;

  const segs = fieldPathSegments(path);
  let fn: (row: unknown, value: unknown) => boolean;
  if (isPlainKey(path, segs)) {
    fn = (row, value) => {
      if (row == null || typeof row !== 'object') return false;
      const obj = row as Record<string, unknown>;
      if (Object.is(obj[path], value)) return false;
      obj[path] = value;
      return true;
    };
  } else {
    const lastIdx = segs.length - 1;
    fn = (row, value) => {
      if (row == null || typeof row !== 'object') return false;
      let cursor = row as Record<string | number, unknown>;
      for (let i = 0; i < lastIdx; i++) {
        const seg = segs[i] as FieldPathSegment;
        const next = cursor[seg];
        if (next == null || typeof next !== 'object') {
          const made = (typeof segs[i + 1] === 'number' ? [] : {}) as Record<string | number, unknown>;
          cursor[seg] = made;
          cursor = made;
        } else {
          cursor = next as Record<string | number, unknown>;
        }
      }
      const finalSeg = segs[lastIdx] as FieldPathSegment;
      if (Object.is(cursor[finalSeg], value)) return false;
      cursor[finalSeg] = value;
      return true;
    };
  }
  setterCache.set(path, fn);
  return fn;
}

/** Test-only: reset path accessor caches between suites. */
export function __resetPathAccessorCaches(): void {
  accessorCache.clear();
  setterCache.clear();
}
