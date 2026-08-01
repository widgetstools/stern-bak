/**
 * Expression-syntax migration helpers.
 *
 * The canonical column-reference syntax is now `[columnId]`. The previous
 * syntax `{columnId}` remains parseable indefinitely for backward compat —
 * these helpers rewrite stored profiles on load so the editor surface shows
 * the new syntax consistently.
 *
 * Safe to apply to strings that are already in the new syntax (no-op when
 * no `{identifier}` tokens are present). Does NOT touch `{...}` occurrences
 * inside string literals — so `"prefix {name}"` in an expression stays
 * untouched. See `migrateExpressionSyntax` for the exact scanning rules.
 */

/**
 * Rewrite `{columnId}` → `[columnId]` in a single expression string.
 *
 * Respects string literals (`'…'` and `"…"`) — any `{…}` inside a string is
 * left alone. A column identifier must match `[A-Za-z_][A-Za-z0-9_]*`;
 * anything else inside `{…}` is left alone (degrades to parse error at the
 * normal grammar layer, as before).
 *
 * Returns the same string reference when nothing changes, so callers can
 * cheap-compare to detect whether a migration happened.
 */
export function migrateExpressionSyntax(source: string): string {
  if (typeof source !== 'string' || source.length === 0) return source;
  // Fast path: no `{` anywhere → definitely nothing to rewrite.
  if (source.indexOf('{') === -1) return source;

  let out = '';
  let i = 0;
  let changed = false;

  while (i < source.length) {
    const ch = source[i];

    // Skip over string literals verbatim so `'hello {name}'` is preserved.
    if (ch === '"' || ch === "'") {
      const quote = ch;
      out += ch;
      i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === '\\' && i + 1 < source.length) {
          out += source[i] + source[i + 1];
          i += 2;
          continue;
        }
        out += source[i];
        i++;
      }
      if (i < source.length) {
        out += source[i];
        i++;
      }
      continue;
    }

    if (ch === '{') {
      // Match `{identifier}` with no whitespace or extra chars.
      const start = i + 1;
      let end = start;
      while (end < source.length && /[A-Za-z0-9_]/.test(source[end])) end++;
      if (end > start && source[end] === '}' && /[A-Za-z_]/.test(source[start])) {
        out += '[' + source.slice(start, end) + ']';
        i = end + 1;
        changed = true;
        continue;
      }
    }

    out += ch;
    i++;
  }

  return changed ? out : source;
}

/**
 * Walk an arbitrary object tree and apply `migrateExpressionSyntax` to every
 * string value whose path ends in one of the given field names. Mutation-free:
 * returns a new object only where something changed, otherwise returns the
 * original reference (cheap structural sharing).
 *
 * Intended for module `deserialize` hooks — call with the fields that hold
 * expression strings, e.g. `migrateExpressionsInObject(state, ['expression', 'condition'])`.
 */
export function migrateExpressionsInObject<T>(value: T, fieldNames: ReadonlyArray<string>): T {
  if (!value || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    let anyChanged = false;
    const next = value.map((item) => {
      const migrated = migrateExpressionsInObject(item, fieldNames);
      if (migrated !== item) anyChanged = true;
      return migrated;
    });
    return (anyChanged ? next : value) as T;
  }

  const obj = value as Record<string, unknown>;
  let anyChanged = false;
  const next: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (typeof v === 'string' && fieldNames.includes(key)) {
      const migrated = migrateExpressionSyntax(v);
      next[key] = migrated;
      if (migrated !== v) anyChanged = true;
    } else if (v && typeof v === 'object') {
      const migrated = migrateExpressionsInObject(v, fieldNames);
      next[key] = migrated;
      if (migrated !== v) anyChanged = true;
    } else {
      next[key] = v;
    }
  }
  return (anyChanged ? (next as T) : value);
}
