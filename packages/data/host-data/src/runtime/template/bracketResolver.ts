/**
 * Bracket-token resolver — `[identifier]` → session-unique short ID.
 *
 * Distinct from the `{{name.key}}` resolver: those pull deterministic
 * values from AppData. Bracket tokens MINT a fresh per-attach ID.
 * Two occurrences of the SAME token name within the same cache
 * resolve to the SAME value — so `[clientTag]` in `listenerTopic`
 * and `[clientTag]` in `requestBody` line up.
 *
 * Token grammar:
 *   `[name]` — identifier-like body. Must start with a letter or
 *              underscore; may contain letters, digits, underscores,
 *              hyphens. Tokens that don't match (e.g., `[]`, `[1abc]`,
 *              `[a b]`, JSON `[1,2,3]`) are left in place verbatim —
 *              same fail-safe behavior as the brace resolver.
 *
 * Cache lifetime is the caller's responsibility. The provider registry
 * mints a fresh `Map` per `startProvider` call, so values are stable
 * across reconnects within a single attach but reset on the next
 * attach.
 */

export type BracketCache = Map<string, string>;

const BRACKET_RE = /\[([A-Za-z_][A-Za-z0-9_-]*)\]/g;

const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const ID_LEN = 12;

function generateId(): string {
  // `crypto.getRandomValues` is available in browsers, Web/Shared
  // Workers, and Node 18+ (where `crypto` is globally exposed).
  const bytes = new Uint8Array(ID_LEN);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < ID_LEN; i++) {
    out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  }
  return out;
}

export function resolveBracketString(input: string, cache: BracketCache): string {
  return input.replace(BRACKET_RE, (_whole, name: string) => {
    let v = cache.get(name);
    if (v === undefined) {
      v = generateId();
      cache.set(name, v);
    }
    return v;
  });
}

/**
 * Deep-walk an object/array literal recursively, replacing every
 * string-typed leaf via resolveBracketString. Returns a fresh value
 * with the same shape — never mutates the input. Mirrors `resolveCfg`
 * in resolver.ts.
 */
export function resolveBracketCfg<T>(cfg: T, cache: BracketCache): T {
  return walkCfg(cfg, cache) as T;
}

function walkCfg(value: unknown, cache: BracketCache): unknown {
  if (typeof value === 'string') return resolveBracketString(value, cache);
  if (Array.isArray(value)) return value.map((v) => walkCfg(v, cache));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = walkCfg(v, cache);
    return out;
  }
  return value;
}
