/**
 * Expression-formatter security policy.
 *
 * Governs the `kind: 'expression'` branch of `ValueFormatterTemplate`,
 * which is compiled through `new Function(...)` by the value-formatter
 * adapter. That branch is deliberately unsafe-eval — a legacy escape
 * hatch for formatters that can't be expressed as presets / Excel
 * format strings / tick tokens.
 *
 * Deployments running under a `script-src` Content Security Policy
 * that forbids `unsafe-eval` must set the policy to `'strict'` at boot
 * so the adapter refuses to compile (and the profile importer refuses
 * to accept) expression-kind templates. The runtime falls back to an
 * identity formatter in that case — values still render, they just
 * aren't transformed.
 *
 * Policy is process-global. Set once at boot, before any grid mounts.
 * Changing mid-session does NOT invalidate already-compiled formatters;
 * call `clearValueFormatterCaches()` (re-exported from the adapters
 * barrel) if you need to flip modes after the fact.
 */

// ─── Types ────────────────────────────────────────────────────────────

export type ExpressionPolicyMode =
  /** Compile expression-kind formatters with `new Function`; no warnings.
   *  Default — preserves historical behaviour for dev-mode / trusted
   *  internal builds. */
  | 'allow'
  /** Compile and run, but emit a one-shot `console.warn` per unique
   *  expression string. Useful during migration: legacy profiles keep
   *  working while new code paths get visibility into which
   *  expressions still need porting. */
  | 'warn'
  /** Never compile expression-kind formatters; substitute an identity
   *  formatter at the adapter. Profile imports containing
   *  expression-kind templates are rejected outright unless the caller
   *  opts into `{ sanitize: true }`. Required for CSP-hardened
   *  deployments. */
  | 'strict';

export interface ExpressionPolicyViolation {
  /** Which surface triggered the violation. `valueFormatter` fires at
   *  runtime when the adapter is asked to compile; `profileImport` fires
   *  synchronously inside `ProfileManager.import` before any state is
   *  written to storage. */
  kind: 'valueFormatter' | 'profileImport';
  /** The violating expression string, when available. `profileImport`
   *  violations may omit this if the offending payload was malformed. */
  expression?: string;
  /** Short human-readable reason. Stable across versions — safe to key
   *  error messages / telemetry on the leading verb. */
  reason: string;
}

export interface ExpressionPolicy {
  mode: ExpressionPolicyMode;
  /** Invoked on every violation, regardless of mode. Return value is
   *  ignored — this is a pure observer hook for telemetry / logging.
   *  In `strict` mode the adapter will ALSO swap the formatter; this
   *  callback is purely informational. */
  onViolation?: (violation: ExpressionPolicyViolation) => void;
}

// ─── Singleton ────────────────────────────────────────────────────────

const DEFAULT_POLICY: ExpressionPolicy = { mode: 'allow' };
let current: ExpressionPolicy = { ...DEFAULT_POLICY };

// One-shot warning tracker — each unique expression string warns at
// most once per process lifetime under `'warn'` mode. Keyed by the raw
// expression so two identical strings from different call sites
// deduplicate correctly.
const warnedExpressions = new Set<string>();

/**
 * Install a security policy. Call at application boot, before any
 * `<MarketsGrid>` mounts or any profile import runs.
 *
 * Partial updates merge onto the existing policy — pass
 * `{ mode: 'strict' }` to flip the mode while keeping an existing
 * `onViolation` observer.
 */
export function configureExpressionPolicy(next: Partial<ExpressionPolicy>): void {
  current = { ...current, ...next };
}

/** Read the current policy. Returned object is a read-only reference;
 *  mutate via `configureExpressionPolicy` only. */
export function getExpressionPolicy(): Readonly<ExpressionPolicy> {
  return current;
}

/**
 * Test-only reset — restores the default `'allow'` policy and clears
 * the one-shot warning tracker so assertions about warning emission
 * are deterministic across test cases.
 * @internal
 */
export function __resetExpressionPolicyForTests(): void {
  current = { ...DEFAULT_POLICY };
  warnedExpressions.clear();
}

// ─── Internal helpers ─────────────────────────────────────────────────

/**
 * Emit a violation to the policy's observer + (in `'warn'` mode)
 * console. Called from the adapter and the profile importer.
 * @internal
 */
export function reportExpressionViolation(v: ExpressionPolicyViolation): void {
  try { current.onViolation?.(v); }
  catch { /* observer must not break the pipeline */ }

  if (current.mode === 'warn' && v.expression && !warnedExpressions.has(v.expression)) {
    warnedExpressions.add(v.expression);
    // eslint-disable-next-line no-console
    console.warn(
      `[gc-security] kind:'expression' valueFormatter uses \`new Function\` ` +
        `(CSP-unsafe). Migrate to kind:'excelFormat' / kind:'preset' / kind:'tick' ` +
        `where possible. Expression: ${v.expression}`,
    );
  }
}

// ─── Payload scanning ─────────────────────────────────────────────────

/**
 * Depth-first walk looking for `{ kind: 'expression', expression: string }`
 * shapes anywhere in `value`. Returns the first violating expression
 * string, or `null` if none found. Used by `ProfileManager.import` to
 * gate payloads in `'strict'` mode.
 *
 * Keyed on shape-match rather than path so the check works against any
 * module's serialized state (column-customization assignments,
 * conditional-styling rule valueFormatters, calculated-columns virtual
 * columns — all carry ValueFormatterTemplate).
 */
export function findExpressionFormatter(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): string | null {
  if (value == null || typeof value !== 'object') return null;
  if (seen.has(value as object)) return null;
  seen.add(value as object);

  const obj = value as Record<string, unknown>;
  if (obj.kind === 'expression' && typeof obj.expression === 'string') {
    return obj.expression;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findExpressionFormatter(item, seen);
      if (hit != null) return hit;
    }
    return null;
  }

  for (const key of Object.keys(obj)) {
    const hit = findExpressionFormatter(obj[key], seen);
    if (hit != null) return hit;
  }
  return null;
}

/**
 * Walk `value` and replace every `{ kind: 'expression', ... }` in-place
 * with a safe identity-formatter stand-in. Invoked by the profile
 * importer when `sanitize: true` is passed under `'strict'` mode.
 *
 * The replacement is `{ kind: 'preset', preset: 'number', options: { decimals: 0 } }`
 * — always renders the raw numeric value with no decimals. Call sites
 * receiving non-numeric data will still render (the preset returns ''
 * for non-finite values) just without the original transformation.
 *
 * Returns the number of replacements made, so callers can log /
 * surface the count.
 */
export function sanitizeExpressionFormatters(value: unknown): number {
  let count = 0;
  const seen = new WeakSet<object>();

  const visit = (v: unknown): void => {
    if (v == null || typeof v !== 'object') return;
    if (seen.has(v as object)) return;
    seen.add(v as object);

    if (Array.isArray(v)) {
      for (const item of v) visit(item);
      return;
    }

    const obj = v as Record<string, unknown>;
    if (obj.kind === 'expression' && typeof obj.expression === 'string') {
      obj.kind = 'preset';
      obj.preset = 'number';
      obj.options = { decimals: 0 };
      delete obj.expression;
      count++;
      return;
    }
    for (const key of Object.keys(obj)) visit(obj[key]);
  };

  visit(value);
  return count;
}
