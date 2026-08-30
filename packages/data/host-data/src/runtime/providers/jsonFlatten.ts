/**
 * jsonFlatten — column-definition-driven flattening of nested rows.
 *
 * A flatten plan is a segment trie compiled from every requested path
 * (`collectFieldPaths(columnDefinitions, keyColumn)`); each requested
 * path becomes one flat column whose name is the path string itself
 * (`x,y.z[0].abc` stays `x,y.z[0].abc` — consumers read it literally,
 * see `getValueByPath`). Two implementations share the plan:
 *
 *   - {@link flattenRow}      — object level. The reference semantics,
 *                               and what a JS-object data plane uses.
 *   - {@link flattenJsonText} — TEXT level. Tokenises the JSON text of a
 *                               row array once, tracks the path as a
 *                               stack of trie nodes, copies each matched
 *                               scalar's raw text into the flat output
 *                               and skips every unrequested subtree —
 *                               no row objects are ever built. This is
 *                               the ingest pre-pass for an engine that
 *                               takes flat JSON (Perspective).
 *
 * Semantics (both paths):
 *   - scalar at a requested path → emitted as-is
 *   - object / array at a requested path (an "opaque" column, e.g. `risk`
 *     or `legs`) → emitted as a JSON string of the subtree
 *   - a path may be both a column and a prefix of other columns (`risk`
 *     AND `risk.dv01`) — both are emitted
 *   - missing path / index past the end / non-container on the way →
 *     the column is omitted (engine reads it as null)
 *   - `[n]` expects an array and `key` expects an object; anything else
 *     on the way is a miss (arrays are never guessed — see the plan)
 *   - column order: plan order for `flattenRow`, document order for
 *     `flattenJsonText` (irrelevant to any JSON consumer)
 *
 * Text-path key matching never decodes or allocates for a member key:
 * candidates are bucketed by raw key length and compared with the native
 * `startsWith`; only a key that carries a backslash (rare) is decoded.
 */

import { fieldPathSegments, type FieldPathSegment } from '@wellsfargo-starui/types';

interface KeyCandidate {
  key: string;
  node: FlattenNode;
}

export interface FlattenNode {
  /** Flat column name when this node is itself a requested path. */
  leaf: string | null;
  /** `,"<leaf>":` — precomputed member prefix for the text path. */
  leafKey: string;
  /** Object-member children. */
  keys: Map<string, FlattenNode> | null;
  /** Array-element children by index. */
  items: Map<number, FlattenNode> | null;
  /** `keys` bucketed by key length for the text path's in-place matcher. */
  keysByLen: Map<number, KeyCandidate[]> | null;
}

export interface FlattenPlan {
  root: FlattenNode;
  /** Flat column names, first-seen order. */
  columns: string[];
}

function makeNode(): FlattenNode {
  return { leaf: null, leafKey: '', keys: null, items: null, keysByLen: null };
}

/** Compile requested paths into a flatten plan. Blank paths are ignored; a repeated path is one column. */
export function compileFlattenPlan(paths: readonly string[]): FlattenPlan {
  const root = makeNode();
  const columns: string[] = [];
  for (const path of paths) {
    if (!path) continue;
    let node = root;
    for (const seg of fieldPathSegments(path)) {
      if (typeof seg === 'number') {
        node.items = node.items ?? new Map();
        let child = node.items.get(seg);
        if (!child) {
          child = makeNode();
          node.items.set(seg, child);
        }
        node = child;
      } else {
        node.keys = node.keys ?? new Map();
        let child = node.keys.get(seg);
        if (!child) {
          child = makeNode();
          node.keys.set(seg, child);
        }
        node = child;
      }
    }
    if (node.leaf === null) {
      node.leaf = path;
      node.leafKey = `,${JSON.stringify(path)}:`;
      columns.push(path);
    }
  }
  indexKeys(root);
  return { root, columns };
}

function indexKeys(node: FlattenNode): void {
  if (node.keys) {
    const byLen = new Map<number, KeyCandidate[]>();
    for (const [key, child] of node.keys) {
      let bucket = byLen.get(key.length);
      if (!bucket) {
        bucket = [];
        byLen.set(key.length, bucket);
      }
      bucket.push({ key, node: child });
      indexKeys(child);
    }
    node.keysByLen = byLen;
  }
  if (node.items) for (const child of node.items.values()) indexKeys(child);
}

// ─── Object level ───────────────────────────────────────────────────

/** Flatten one row object per `plan` (reference semantics). */
export function flattenRow(row: unknown, plan: FlattenPlan): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  visit(row, plan.root, out);
  return out;
}

function visit(value: unknown, node: FlattenNode, out: Record<string, unknown>): void {
  if (value === undefined) return;
  if (node.leaf !== null) {
    out[node.leaf] = value !== null && typeof value === 'object' ? JSON.stringify(value) : value;
  }
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    if (!node.items) return;
    for (const [i, child] of node.items) {
      if (i < value.length) visit(value[i], child, out);
    }
    return;
  }
  if (!node.keys) return;
  const obj = value as Record<string, unknown>;
  for (const [k, child] of node.keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) visit(obj[k], child, out);
  }
}

// ─── Text level ─────────────────────────────────────────────────────

const CH_TAB = 9;
const CH_LF = 10;
const CH_CR = 13;
const CH_SPACE = 32;
const CH_QUOTE = 34;
const CH_COMMA = 44;
const CH_COLON = 58;
const CH_LBRACKET = 91;
const CH_BACKSLASH = 92;
const CH_RBRACKET = 93;
const CH_LBRACE = 123;
const CH_RBRACE = 125;

function isWs(c: number): boolean {
  return c === CH_SPACE || c === CH_LF || c === CH_CR || c === CH_TAB;
}

function fail(i: number, what: string): never {
  throw new SyntaxError(`flattenJsonText: ${what} at offset ${i}`);
}

/**
 * Flatten the JSON text of a row array (or a single row object) into the
 * JSON text of flat rows. Output is compact JSON; each row carries only
 * the plan's columns that the row had. Throws `SyntaxError` on malformed
 * input.
 */
export function flattenJsonText(text: string, plan: FlattenPlan): string {
  const n = text.length;
  // Lazily-tracked position of the next backslash at or after the scan
  // position. Backslashes are rare in feed text, so this costs about one
  // native `indexOf` per backslash and lets both the string skipper and
  // the key matcher take their no-escape fast paths without scanning.
  let scanFrom = 0;
  let nextBackslash = -1;
  const backslashIn = (from: number, to: number): boolean => {
    // The cache answers "first backslash at or after `scanFrom`"; it is
    // valid for any `from` in [scanFrom, nextBackslash]. A query from an
    // earlier point (the key matcher re-asking about a key the string
    // skipper already stepped past) must rescan.
    if (from < scanFrom || nextBackslash < from) {
      scanFrom = from;
      nextBackslash = text.indexOf('\\', from);
      if (nextBackslash < 0) nextBackslash = n;
    }
    return nextBackslash < to;
  };

  const skipWs = (i: number): number => {
    while (i < n && isWs(text.charCodeAt(i))) i += 1;
    return i;
  };

  /** `i` at the opening quote; returns the index after the closing quote. */
  const skipString = (i: number): number => {
    let j = i + 1;
    for (;;) {
      const q = text.indexOf('"', j);
      if (q < 0) fail(i, 'unterminated string');
      if (!backslashIn(j, q)) return q + 1;
      let backslashes = 0;
      let k = q - 1;
      while (k >= j && text.charCodeAt(k) === CH_BACKSLASH) {
        backslashes += 1;
        k -= 1;
      }
      if ((backslashes & 1) === 0) return q + 1;
      j = q + 1;
    }
  };

  /** Number / true / false / null — runs to the next delimiter. */
  const skipScalar = (i: number): number => {
    const start = i;
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === CH_COMMA || c === CH_RBRACE || c === CH_RBRACKET || isWs(c)) break;
      i += 1;
    }
    if (i === start) fail(i, 'expected a value');
    return i;
  };

  /** `i` at `{` or `[`; returns the index after the matching close, honouring strings. */
  const skipContainer = (i: number): number => {
    let depth = 0;
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === CH_QUOTE) {
        i = skipString(i);
        continue;
      }
      if (c === CH_LBRACE || c === CH_LBRACKET) depth += 1;
      else if (c === CH_RBRACE || c === CH_RBRACKET) {
        depth -= 1;
        if (depth === 0) return i + 1;
      }
      i += 1;
    }
    return fail(i, 'unterminated container');
  };

  const skipValue = (i: number): number => {
    const c = text.charCodeAt(i);
    if (c === CH_QUOTE) return skipString(i);
    if (c === CH_LBRACE || c === CH_LBRACKET) return skipContainer(i);
    return skipScalar(i);
  };

  /** Match the member key spanning `[keyStart, keyEnd)` (quotes excluded) against `node.keys`, in place. */
  const matchKey = (node: FlattenNode, keyStart: number, keyEnd: number): FlattenNode | undefined => {
    const bucket = node.keysByLen!.get(keyEnd - keyStart);
    if (bucket !== undefined) {
      for (let c = 0; c < bucket.length; c++) {
        const cand = bucket[c] as KeyCandidate;
        if (text.startsWith(cand.key, keyStart)) return cand.node;
      }
    }
    // An escaped key has a different raw length / spelling — decode it.
    if (backslashIn(keyStart, keyEnd)) {
      return node.keys!.get(JSON.parse(text.slice(keyStart - 1, keyEnd + 1)) as string);
    }
    return undefined;
  };

  /** Consume the value at `i` under `node`, emitting matched leaves into `parts`; returns the index after it. */
  const walkValue = (i: number, node: FlattenNode, parts: string[]): number => {
    const c = text.charCodeAt(i);
    const start = i;
    if (c === CH_LBRACE) {
      i = node.keys ? walkObject(i, node, parts) : skipContainer(i);
      if (node.leaf !== null) parts.push(node.leafKey, JSON.stringify(text.slice(start, i)));
      return i;
    }
    if (c === CH_LBRACKET) {
      i = node.items ? walkArray(i, node.items, parts) : skipContainer(i);
      if (node.leaf !== null) parts.push(node.leafKey, JSON.stringify(text.slice(start, i)));
      return i;
    }
    i = c === CH_QUOTE ? skipString(i) : skipScalar(i);
    if (node.leaf !== null) parts.push(node.leafKey, text.slice(start, i));
    return i;
  };

  const walkObject = (i: number, node: FlattenNode, parts: string[]): number => {
    i = skipWs(i + 1);
    if (text.charCodeAt(i) === CH_RBRACE) return i + 1;
    for (;;) {
      if (text.charCodeAt(i) !== CH_QUOTE) fail(i, 'expected a member key');
      const keyEnd = skipString(i);
      const child = matchKey(node, i + 1, keyEnd - 1);
      i = skipWs(keyEnd);
      if (text.charCodeAt(i) !== CH_COLON) fail(i, 'expected ":"');
      i = skipWs(i + 1);
      i = child ? walkValue(i, child, parts) : skipValue(i);
      i = skipWs(i);
      const d = text.charCodeAt(i);
      if (d === CH_COMMA) {
        i = skipWs(i + 1);
        continue;
      }
      if (d === CH_RBRACE) return i + 1;
      fail(i, 'expected "," or "}"');
    }
  };

  const walkArray = (i: number, items: Map<number, FlattenNode>, parts: string[]): number => {
    i = skipWs(i + 1);
    if (text.charCodeAt(i) === CH_RBRACKET) return i + 1;
    let idx = 0;
    for (;;) {
      const child = items.get(idx);
      i = child ? walkValue(i, child, parts) : skipValue(i);
      i = skipWs(i);
      const d = text.charCodeAt(i);
      if (d === CH_COMMA) {
        i = skipWs(i + 1);
        idx += 1;
        continue;
      }
      if (d === CH_RBRACKET) return i + 1;
      fail(i, 'expected "," or "]"');
    }
  };

  // `parts` alternates `,"name":` / value; joining with '' and dropping
  // the leading comma yields the row body with one copy.
  const rowText = (parts: string[]): string => (parts.length === 0 ? '{}' : `{${parts.join('').slice(1)}}`);

  let i = skipWs(0);
  const c = text.charCodeAt(i);
  if (c === CH_LBRACKET) {
    const rows: string[] = [];
    i = skipWs(i + 1);
    if (text.charCodeAt(i) === CH_RBRACKET) return '[]';
    for (;;) {
      const parts: string[] = [];
      i = walkValue(skipWs(i), plan.root, parts);
      rows.push(rowText(parts));
      i = skipWs(i);
      const d = text.charCodeAt(i);
      if (d === CH_COMMA) {
        i += 1;
        continue;
      }
      if (d === CH_RBRACKET) break;
      fail(i, 'expected "," or "]"');
    }
    return `[${rows.join(',')}]`;
  }
  if (c === CH_LBRACE) {
    const parts: string[] = [];
    walkValue(i, plan.root, parts);
    return rowText(parts);
  }
  return fail(i, 'expected an object or an array of objects');
}
