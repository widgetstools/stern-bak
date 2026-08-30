/**
 * Field-path grammar — the ONE parser for every path a row field can be
 * addressed by: column `field`s, `keyColumn`s, inferred `FieldNode.path`s,
 * projection / flattening plans and the editor's Add-column validator.
 *
 * Syntax is JS property-path syntax:
 *
 *   a.b.c            dotted keys
 *   legs[0].rate     `[n]` array index (a NUMBER segment)
 *   ["a.b"].c        bracket-quoted key when a key contains `.`, `[`, `]`,
 *                    a quote or a backslash (single quotes also accepted)
 *   x,y.z[0].abc     a comma (or a space) is an ordinary key character
 *
 * A path string in canonical form (see {@link formatFieldPath}) IS the flat
 * column name a flattened row carries — consumers read it literally first
 * and only then walk the nested shape (`getValueByPath` in `rowPath.ts`).
 *
 * `a.0` addresses the object member "0"; `a[0]` addresses array element 0.
 * Reading through a JS object treats them alike (`obj[seg]`); the flattener
 * and setter are strict (a number segment expects an array).
 */

export type FieldPathSegment = string | number;

export class FieldPathError extends Error {
  readonly path: string;
  /** Offset in `path` where parsing failed. */
  readonly index: number;

  constructor(path: string, index: number, detail: string) {
    super(`Invalid field path "${path}" at ${index}: ${detail}`);
    this.name = 'FieldPathError';
    this.path = path;
    this.index = index;
  }
}

const CH_DOT = 46; // .
const CH_LBRACKET = 91; // [
const CH_RBRACKET = 93; // ]
const CH_DQUOTE = 34; // "
const CH_SQUOTE = 39; // '
const CH_BACKSLASH = 92;

/** Characters that end an unquoted key. */
function isKeyTerminator(c: number): boolean {
  return c === CH_DOT || c === CH_LBRACKET;
}

/** Characters that may only appear inside a bracket-quoted key. */
function isIllegalKeyChar(c: number): boolean {
  return c === CH_RBRACKET || c === CH_DQUOTE || c === CH_SQUOTE || c === CH_BACKSLASH;
}

/**
 * Parse `path` into segments. Throws {@link FieldPathError} on an empty
 * path, an empty key (`a..b`, `.a`, `a.`), an unterminated bracket or
 * quote, a non-numeric unquoted bracket (`a[x]`), or a quote / bracket /
 * backslash inside an unquoted key.
 */
export function parseFieldPath(path: string): FieldPathSegment[] {
  const n = path.length;
  if (n === 0) throw new FieldPathError(path, 0, 'empty path');
  const out: FieldPathSegment[] = [];
  let i = 0;
  // `expectKey` — we just consumed a `.` (or are at the start) and a bare
  // key must follow; a bracket may also open a path.
  let expectKey = true;
  while (i < n) {
    const c = path.charCodeAt(i);
    if (c === CH_LBRACKET) {
      if (expectKey && i !== 0) throw new FieldPathError(path, i, 'expected a key after "."');
      i = parseBracket(path, i + 1, out);
      expectKey = false;
      continue;
    }
    if (c === CH_DOT) {
      if (expectKey) throw new FieldPathError(path, i, 'empty key');
      i += 1;
      expectKey = true;
      continue;
    }
    if (!expectKey) throw new FieldPathError(path, i, 'expected "." or "["');
    const start = i;
    while (i < n) {
      const k = path.charCodeAt(i);
      if (isKeyTerminator(k)) break;
      if (isIllegalKeyChar(k)) {
        throw new FieldPathError(path, i, `"${path[i]}" must be inside a bracket-quoted key`);
      }
      i += 1;
    }
    if (i === start) throw new FieldPathError(path, i, 'empty key');
    out.push(path.slice(start, i));
    expectKey = false;
  }
  if (expectKey) throw new FieldPathError(path, n, 'empty key');
  return out;
}

/** Parse the inside of `[...]` starting at `i` (just after `[`); returns the index after `]`. */
function parseBracket(path: string, i: number, out: FieldPathSegment[]): number {
  const n = path.length;
  if (i >= n) throw new FieldPathError(path, i, 'unterminated "["');
  const c = path.charCodeAt(i);
  if (c === CH_DQUOTE || c === CH_SQUOTE) {
    let key = '';
    let j = i + 1;
    for (;;) {
      if (j >= n) throw new FieldPathError(path, j, 'unterminated quoted key');
      const k = path.charCodeAt(j);
      if (k === c) break;
      if (k === CH_BACKSLASH) {
        if (j + 1 >= n) throw new FieldPathError(path, j, 'dangling escape');
        key += path[j + 1];
        j += 2;
        continue;
      }
      key += path[j];
      j += 1;
    }
    if (j + 1 >= n || path.charCodeAt(j + 1) !== CH_RBRACKET) {
      throw new FieldPathError(path, j + 1, 'expected "]" after quoted key');
    }
    out.push(key);
    return j + 2;
  }
  let j = i;
  while (j < n && path.charCodeAt(j) >= 48 && path.charCodeAt(j) <= 57) j += 1;
  if (j === i) throw new FieldPathError(path, i, 'expected an index or a quoted key');
  if (j >= n || path.charCodeAt(j) !== CH_RBRACKET) throw new FieldPathError(path, j, 'expected "]"');
  out.push(Number(path.slice(i, j)));
  return j + 1;
}

/** {@link parseFieldPath} that returns `null` instead of throwing. */
export function tryParseFieldPath(path: string): FieldPathSegment[] | null {
  try {
    return parseFieldPath(path);
  } catch {
    return null;
  }
}

function keyNeedsQuoting(key: string): boolean {
  if (key.length === 0) return true;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    if (isKeyTerminator(c) || isIllegalKeyChar(c)) return true;
  }
  return false;
}

function quoteKey(key: string): string {
  return `["${key.replace(/[\\"]/g, (m) => `\\${m}`)}"]`;
}

/**
 * Render one segment as it appears when appended to a path: `.key`,
 * `["quoted.key"]` or `[3]`. `first` drops the leading `.` of a bare key.
 */
export function formatFieldPathSegment(segment: FieldPathSegment, first = false): string {
  if (typeof segment === 'number') return `[${segment}]`;
  if (keyNeedsQuoting(segment)) return quoteKey(segment);
  return first ? segment : `.${segment}`;
}

/** Canonical string for `segments` — `parseFieldPath(formatFieldPath(s))` round-trips to `s`. */
export function formatFieldPath(segments: readonly FieldPathSegment[]): string {
  let out = '';
  for (let i = 0; i < segments.length; i++) {
    out += formatFieldPathSegment(segments[i] as FieldPathSegment, i === 0);
  }
  return out;
}

/** Canonical child path: `appendFieldPath('legs', 0)` → `legs[0]`; `appendFieldPath('', 'a.b')` → `["a.b"]`. */
export function appendFieldPath(parent: string, segment: FieldPathSegment): string {
  return parent === '' ? formatFieldPathSegment(segment, true) : parent + formatFieldPathSegment(segment);
}

/**
 * The display name of a path's last segment — the raw key (`abc` for
 * `x,y.z[0].abc`, `a.b` for `["a.b"]`) or `[n]` for an index. An unparsable
 * path is its own name.
 */
export function fieldPathLeafName(path: string): string {
  const segs = tryParseFieldPath(path);
  if (!segs || segs.length === 0) return path;
  const last = segs[segs.length - 1] as FieldPathSegment;
  return typeof last === 'number' ? `[${last}]` : last;
}

/** True when `prefix` is a strict or equal prefix of `path`, segment by segment. */
export function isFieldPathPrefix(
  prefix: readonly FieldPathSegment[],
  path: readonly FieldPathSegment[],
): boolean {
  if (prefix.length > path.length) return false;
  for (let i = 0; i < prefix.length; i++) if (prefix[i] !== path[i]) return false;
  return true;
}

// ─── Memoised segments for hot paths ────────────────────────────────

const SEGMENTS_BY_PATH = new Map<string, readonly FieldPathSegment[]>();
const SEGMENTS_CACHE_MAX = 1000;

/**
 * Segments for `path`, memoised by string (paths are config-cardinality;
 * this runs per row on the row-id / accessor hot paths). A path that does
 * not parse is treated as ONE literal key — the tolerant reading every
 * accessor already had for odd upstream keys — so callers never throw
 * on a row read; validate with {@link parseFieldPath} at edit time instead.
 */
export function fieldPathSegments(path: string): readonly FieldPathSegment[] {
  let segs = SEGMENTS_BY_PATH.get(path);
  if (segs === undefined) {
    segs = tryParseFieldPath(path) ?? [path];
    if (SEGMENTS_BY_PATH.size >= SEGMENTS_CACHE_MAX) SEGMENTS_BY_PATH.clear();
    SEGMENTS_BY_PATH.set(path, segs);
  }
  return segs;
}

/** Test-only: reset the memoised segment cache. */
export function __resetFieldPathCache(): void {
  SEGMENTS_BY_PATH.clear();
}
