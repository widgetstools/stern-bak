import { ExpressionEngine } from "@wellsfargo-starui/core";
import type { EnrichedRow, ExpressionRule, Row } from "./types.js";

type CompiledFn = (ctx: {
  data: Row;
  columns: Row;
  value: unknown;
  x: unknown;
}) => unknown;

/** Bucket key for a sessionless (global) `configureExpressions` call. */
const GLOBAL_SESSION = "";

/**
 * Per-session expression rule sets + compiled fns.
 *
 * One {@link QueryEngine} serves every grid attached to its provider. Without
 * session-keying, `configureExpressions` from blotter B silently overwrote
 * blotter A's calculated columns (and vice versa) — both wrote into the same
 * single `rules` array. Resolution: a session that has its own configured
 * rules (even an empty set) gets exactly those; any other session — or the
 * sessionless caller, which is today's pre-session-hardening behaviour —
 * gets whatever was configured under the empty-string "global" bucket.
 */
export class ExpressionRuleStore {
  private readonly expr: ExpressionEngine;
  private rulesBySession = new Map<string, ExpressionRule[]>();
  private compiledBySession = new Map<string, Map<string, CompiledFn>>();

  constructor(expressionEngine?: ExpressionEngine) {
    this.expr = expressionEngine ?? new ExpressionEngine();
  }

  configure(rules: ExpressionRule[], sessionId?: string): void {
    const key = sessionId ?? GLOBAL_SESSION;
    this.rulesBySession.set(key, rules);
    const compiled = new Map<string, CompiledFn>();
    for (const rule of rules) {
      try {
        compiled.set(rule.id, this.expr.compile(rule.expression));
      } catch {
        // Invalid expressions are skipped at configure time.
      }
    }
    this.compiledBySession.set(key, compiled);
  }

  /** Drops one session's own rules (called on session detach). Global rules are untouched. */
  clearSession(sessionId: string): void {
    this.rulesBySession.delete(sessionId);
    this.compiledBySession.delete(sessionId);
  }

  calculatedFields(sessionId?: string): string[] {
    return this.rulesFor(sessionId)
      .filter((r) => r.kind === "calculated" && r.field)
      .map((r) => r.field!);
  }

  enrich(row: Row, sessionId?: string): EnrichedRow {
    const rules = this.rulesFor(sessionId);
    if (rules.length === 0) return row;
    const compiled = this.compiledFor(sessionId);
    const out: EnrichedRow = { ...row };
    const ctxBase = { data: out, columns: out, value: null as unknown, x: null as unknown };
    const editable: Record<string, boolean> = {};
    let style: Record<string, string | number | undefined> | undefined;
    let alert: boolean | string | undefined;

    for (const rule of rules) {
      const fn = compiled.get(rule.id);
      if (!fn) continue;
      try {
        if (rule.kind === "calculated" && rule.field) {
          const value = fn({ ...ctxBase, value: out[rule.field], x: out[rule.field] });
          out[rule.field] = value;
        } else if (rule.kind === "style") {
          const value = fn(ctxBase);
          if (value && typeof value === "object") {
            style = { ...(style ?? {}), ...(value as Record<string, string | number | undefined>) };
          } else if (typeof value === "string" && value) {
            style = { ...(style ?? {}), backgroundColor: value };
          }
        } else if (rule.kind === "alert") {
          const value = fn(ctxBase);
          if (value) alert = typeof value === "string" ? value : true;
        } else if (rule.kind === "editable") {
          const value = !!fn(ctxBase);
          if (rule.field) editable[rule.field] = value;
          else out.__ssrmEditable = value;
        }
      } catch {
        // swallow per-row expression errors
      }
    }
    if (style) out.__ssrmStyle = style;
    if (alert !== undefined) out.__ssrmAlert = alert;
    if (Object.keys(editable).length) {
      out.__ssrmEditable =
        typeof out.__ssrmEditable === "boolean"
          ? out.__ssrmEditable
          : { ...(typeof out.__ssrmEditable === "object" ? out.__ssrmEditable : {}), ...editable };
    }
    return out;
  }

  private rulesFor(sessionId?: string): ExpressionRule[] {
    const key = sessionId ?? GLOBAL_SESSION;
    if (key !== GLOBAL_SESSION && this.rulesBySession.has(key)) {
      return this.rulesBySession.get(key)!;
    }
    return this.rulesBySession.get(GLOBAL_SESSION) ?? [];
  }

  private compiledFor(sessionId?: string): Map<string, CompiledFn> {
    const key = sessionId ?? GLOBAL_SESSION;
    if (key !== GLOBAL_SESSION && this.compiledBySession.has(key)) {
      return this.compiledBySession.get(key)!;
    }
    return this.compiledBySession.get(GLOBAL_SESSION) ?? new Map();
  }
}
