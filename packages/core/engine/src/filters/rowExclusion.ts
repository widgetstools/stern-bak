/**
 * Row exclusion: one meaning for the "Custom Settings" exclude-when-true
 * expression, shared by both row models.
 *
 * The expression is an EXCLUDE-when-true predicate — a row whose expression
 * evaluates truthy is not shown (e.g. `[ccy] == "INR"`). It **fails open**: an
 * empty expression, a parse failure or a per-row eval throw excludes nothing,
 * so a malformed rule can never make a grid silently empty.
 *
 * This lives in core, beside the filter predicate, for the same reason that
 * one does: the client-side grid applies it through AG Grid's external filter
 * and the server-side query plane applies it inside the worker, and the two
 * must not be able to disagree about what a rule means. The evaluator is the
 * shared part; where each row model installs it is not.
 *
 * The parse cache is keyed by expression string, so the per-row hot path on
 * either side is a pure AST walk.
 */
import type { ExpressionEngineLike } from '../platform/types';

type Compiled = { node: unknown } | { error: string };

const parseCache = new Map<string, Compiled>();

function compile(engine: ExpressionEngineLike, expression: string): Compiled {
  let entry = parseCache.get(expression);
  if (entry) return entry;
  try {
    entry = { node: engine.parse(expression) };
  } catch (err) {
    entry = { error: err instanceof Error ? err.message : String(err) };
    // One warning per unique bad expression — never per row.
    console.warn('[rowExclusion] invalid row-exclusion expression:', expression, err);
  }
  parseCache.set(expression, entry);
  return entry;
}

/**
 * Evaluate the row-exclusion predicate against one row's data. `true` means
 * the row should be EXCLUDED.
 */
export function evaluateRowExclusion(
  engine: ExpressionEngineLike,
  expression: string,
  data: Record<string, unknown>,
): boolean {
  const expr = expression.trim();
  if (!expr) return false;
  const compiled = compile(engine, expr);
  if (!('node' in compiled)) return false;
  try {
    return Boolean(
      engine.evaluate(compiled.node, { data, columns: data, value: null, x: null }),
    );
  } catch {
    return false;
  }
}

/**
 * The same rule as a reusable predicate, parsed once.
 *
 * `null` for an expression that excludes nothing — an empty string or one that
 * will not parse. Returning `null` rather than a closure that always answers
 * `false` is what lets the query plane drop the session's overlay entirely and
 * go back to sharing the plane's cache, instead of forking it for a rule that
 * cannot exclude anything.
 */
export function compileRowExclusion(
  engine: ExpressionEngineLike,
  expression: string | null | undefined,
): ((row: Record<string, unknown>) => boolean) | null {
  const expr = (expression ?? '').trim();
  if (!expr) return null;
  const compiled = compile(engine, expr);
  if (!('node' in compiled)) return null;
  return (row) => {
    try {
      return Boolean(
        engine.evaluate(compiled.node, { data: row, columns: row, value: null, x: null }),
      );
    } catch {
      return false;
    }
  };
}

/** Test-only: clear the expression parse cache between suites. */
export function __resetRowExclusionCache(): void {
  parseCache.clear();
}
