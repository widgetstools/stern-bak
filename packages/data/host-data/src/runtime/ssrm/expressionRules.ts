import {
  COMPUTED_FIELDS_KEY,
  ExpressionEngine,
  astUsesAggregateFunctions,
} from "@wellsfargo-starui/core";
import type { EnrichedRow, ExpressionRule, Row } from "./types.js";

type CompiledFn = (ctx: {
  data: Row;
  columns: Row;
  value: unknown;
  x: unknown;
  allRows?: ReadonlyArray<Row>;
  allRowsColumnCache?: Map<string, unknown[]>;
  allRowsAggregateCache?: Map<string, unknown>;
}) => unknown;

/**
 * The whole-dataset view a column-wide aggregate needs.
 *
 * `SUM([price])` is not a row-local expression — it folds one column over
 * every row, and the evaluator reads that column out of `allRows` (see
 * `evalOps.buildCallArgs`). Without this context the fold receives the ROW'S
 * OWN value and `SUM([price])` quietly returns that row's price: a per-row
 * answer to a per-dataset question, which is the same defect the client-side
 * `valueGetter` has when it folds a block cache.
 *
 * `allRowsColumnCache` is what keeps the fold to ONE pass per column per store
 * revision instead of one per enriched row. {@link QueryEngine} owns both,
 * builds them only for a session whose rules actually aggregate
 * ({@link ExpressionRuleStore.usesAggregates}), and rebuilds them when the
 * store's revision moves.
 */
export interface AggregateScope {
  readonly allRows: ReadonlyArray<Row>;
  readonly allRowsColumnCache: Map<string, unknown[]>;
  /** The FOLD's result, not just its input. A block enriches ~100 rows and
   *  every one of them would otherwise re-reduce a 100,000-element array. */
  readonly allRowsAggregateCache: Map<string, unknown>;
}

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
  /** Per session: the `calculated` fields it produces, as ONE frozen array
   *  shared by every row of every block — the stamp is a property write, not
   *  an allocation. Empty sets are stored as `null` so a rule set with no
   *  calculated column stamps nothing at all. */
  private computedFieldsBySession = new Map<string, readonly string[] | null>();
  /** Per session: does any `calculated` rule fold a column over the dataset?
   *  Decided once at configure time — the aggregate scope costs a pass over
   *  the store, and a grid whose columns are all row-local never pays it. */
  private usesAggregatesBySession = new Map<string, boolean>();

  constructor(expressionEngine?: ExpressionEngine) {
    this.expr = expressionEngine ?? new ExpressionEngine();
  }

  /**
   * The engine these rules compile through. Exposed so the row-exclusion rule
   * compiles on the SAME engine as the calculated columns rather than the
   * plane standing up a second one — one plane, one expression dialect.
   */
  get engine(): ExpressionEngine {
    return this.expr;
  }

  configure(rules: ExpressionRule[], sessionId?: string): void {
    const key = sessionId ?? GLOBAL_SESSION;
    this.rulesBySession.set(key, rules);
    const compiled = new Map<string, CompiledFn>();
    let usesAggregates = false;
    for (const rule of rules) {
      try {
        compiled.set(rule.id, this.expr.compile(rule.expression));
      } catch {
        // Invalid expressions are skipped at configure time.
        continue;
      }
      if (rule.kind === "calculated" && rule.field && !usesAggregates) {
        try {
          usesAggregates = astUsesAggregateFunctions(this.expr.parse(rule.expression));
        } catch {
          /* unparseable — already skipped above */
        }
      }
    }
    this.compiledBySession.set(key, compiled);
    this.usesAggregatesBySession.set(key, usesAggregates);
    const fields = rules
      .filter((r) => r.kind === "calculated" && r.field && compiled.has(r.id))
      .map((r) => r.field!);
    this.computedFieldsBySession.set(key, fields.length ? Object.freeze(fields) : null);
  }

  /** Drops one session's own rules (called on session detach). Global rules are untouched. */
  clearSession(sessionId: string): void {
    this.rulesBySession.delete(sessionId);
    this.compiledBySession.delete(sessionId);
    this.computedFieldsBySession.delete(sessionId);
    this.usesAggregatesBySession.delete(sessionId);
  }

  calculatedFields(sessionId?: string): string[] {
    return this.rulesFor(sessionId)
      .filter((r) => r.kind === "calculated" && r.field)
      .map((r) => r.field!);
  }

  /** Whether {@link enrich} needs an {@link AggregateScope} for this session. */
  usesAggregates(sessionId?: string): boolean {
    return this.resolveBySession(this.usesAggregatesBySession, sessionId) ?? false;
  }

  enrich(row: Row, sessionId?: string, aggregates?: AggregateScope): EnrichedRow {
    const rules = this.rulesFor(sessionId);
    if (rules.length === 0) return row;
    const compiled = this.compiledFor(sessionId);
    const out: EnrichedRow = { ...row };
    // Both are `undefined` unless this session's rules aggregate — the
    // evaluator's aggregate path is gated on `ctx.allRows` being present, so
    // a row-local rule set behaves exactly as it did before.
    const ctxBase = {
      data: out,
      columns: out,
      value: null as unknown,
      x: null as unknown,
      allRows: aggregates?.allRows,
      allRowsColumnCache: aggregates?.allRowsColumnCache,
      allRowsAggregateCache: aggregates?.allRowsAggregateCache,
    };
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
    // Tell the grid which fields this side answered. Without the stamp the
    // grid's own `valueGetter` recomputes them from the rows it happens to
    // hold, which for a column-wide aggregate is a total of the block cache.
    const computed = this.computedFieldsFor(sessionId);
    if (computed) out[COMPUTED_FIELDS_KEY] = computed;
    return out;
  }

  private rulesFor(sessionId?: string): ExpressionRule[] {
    return this.resolveBySession(this.rulesBySession, sessionId) ?? [];
  }

  private compiledFor(sessionId?: string): Map<string, CompiledFn> {
    return this.resolveBySession(this.compiledBySession, sessionId) ?? new Map();
  }

  private computedFieldsFor(sessionId?: string): readonly string[] | null {
    return this.resolveBySession(this.computedFieldsBySession, sessionId) ?? null;
  }

  /**
   * A session that configured its own rules gets exactly those; anything else
   * — including the sessionless caller — falls back to the global bucket.
   * One walk, so the rule list, its compiled fns, its computed-field stamp and
   * its aggregate verdict can never resolve to different sessions.
   */
  private resolveBySession<T>(
    bySession: Map<string, T>,
    sessionId: string | undefined,
  ): T | undefined {
    const key = sessionId ?? GLOBAL_SESSION;
    if (key !== GLOBAL_SESSION && bySession.has(key)) return bySession.get(key);
    return bySession.get(GLOBAL_SESSION);
  }
}
