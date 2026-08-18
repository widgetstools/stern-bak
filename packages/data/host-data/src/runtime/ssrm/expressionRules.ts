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
  /** Per session: bumped on every {@link configure}. The only moving part of
   *  a query's cache key once a calculated column is being filtered or sorted
   *  on — without it two sessions with DIFFERENT rules would share the order
   *  built for whichever asked first. */
  private revisionBySession = new Map<string, number>();
  /**
   * Per session: raw row → that row with this session's calculated fields
   * materialised. See {@link applyCalculated}.
   *
   * Weak, and keyed on the row REFERENCE, which is sound because `RowStore`
   * never mutates a stored row in place — an `upsert` builds `{ ...prev }` and
   * replaces the entry, so a ticked row is a new object and simply misses.
   * Dropped wholesale when the rules change.
   */
  private computedRowsBySession = new Map<string, WeakMap<Row, Row>>();

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
    this.revisionBySession.set(key, (this.revisionBySession.get(key) ?? 0) + 1);
    // The memo is built from the rules that just changed; keeping it would
    // serve the previous expression's answers.
    this.computedRowsBySession.delete(key);
  }

  /** Drops one session's own rules (called on session detach). Global rules are untouched. */
  clearSession(sessionId: string): void {
    this.rulesBySession.delete(sessionId);
    this.compiledBySession.delete(sessionId);
    this.computedFieldsBySession.delete(sessionId);
    this.usesAggregatesBySession.delete(sessionId);
    this.revisionBySession.delete(sessionId);
    this.computedRowsBySession.delete(sessionId);
  }

  /**
   * Which rule set this session is on, as a number that changes whenever the
   * rules do. Part of a query's cache key while a calculated column is being
   * filtered or sorted on — see {@link QueryEngine.setSessionExclude}'s
   * neighbour, `sessionStateFor`.
   */
  rulesRevision(sessionId?: string): number {
    return this.resolveBySession(this.revisionBySession, sessionId) ?? 0;
  }

  /**
   * The `calculated` fields this session produces — the SAME frozen array
   * `enrich` stamps, so a caller can compare by reference.
   */
  computedFields(sessionId?: string): readonly string[] | null {
    return this.computedFieldsFor(sessionId);
  }

  /**
   * This session's view of a row with its calculated fields materialised —
   * and NOTHING else. `enrich` also evaluates style, alert and editability and
   * allocates for all of them; a filter or a sort needs none of that, and
   * paying for it once per row of the whole store per distinct query is the
   * cost that kept this feature out of the plane.
   *
   * Returns the SAME REFERENCE when the session has no calculated rules, so a
   * query that does not touch one copies nothing.
   *
   * Memoised per row (see {@link computedRowsBySession}), which is what makes
   * this incremental rather than a fresh O(rows x rules) pass per query: the
   * second query shape over the same store revision re-uses the first one's
   * rows. Rows carry the frozen field stamp, so {@link enrich} on the sliced
   * page recognises its own work and does not evaluate them a second time.
   */
  applyCalculated(row: Row, sessionId?: string, aggregates?: AggregateScope): Row {
    const fields = this.computedFieldsFor(sessionId);
    if (!fields) return row;

    const key = sessionId ?? GLOBAL_SESSION;
    let memo = this.computedRowsBySession.get(key);
    if (!memo) {
      memo = new WeakMap<Row, Row>();
      this.computedRowsBySession.set(key, memo);
    }
    const hit = memo.get(row);
    if (hit) return hit;

    const out: Row = { ...row };
    this.evaluateCalculated(out, sessionId, aggregates);
    out[COMPUTED_FIELDS_KEY] = fields;
    memo.set(row, out);
    return out;
  }

  /** The `calculated` half of {@link enrich}, in place. */
  private evaluateCalculated(
    out: Row,
    sessionId: string | undefined,
    aggregates: AggregateScope | undefined,
  ): void {
    const compiled = this.compiledFor(sessionId);
    for (const rule of this.rulesFor(sessionId)) {
      if (rule.kind !== "calculated" || !rule.field) continue;
      const fn = compiled.get(rule.id);
      if (!fn) continue;
      try {
        out[rule.field] = fn({
          data: out,
          columns: out,
          value: out[rule.field],
          x: out[rule.field],
          allRows: aggregates?.allRows,
          allRowsColumnCache: aggregates?.allRowsColumnCache,
          allRowsAggregateCache: aggregates?.allRowsAggregateCache,
        });
      } catch {
        // swallow per-row expression errors
      }
    }
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
    const computedFields = this.computedFieldsFor(sessionId);
    // Already carries THIS session's calculated fields, at THIS rule set —
    // reference equality against the frozen stamp, which `configure` replaces
    // wholesale, so a stale set can never match. That happens when the row
    // came through `applyCalculated` because the query filtered, sorted or
    // grouped on a calculated column. Re-evaluating would not merely waste the
    // pass: the rules would see their own previous output as `x`/`value`
    // rather than the row's original, so a self-referencing expression would
    // answer differently depending on whether the query happened to touch the
    // column.
    const alreadyCalculated =
      computedFields !== null && row[COMPUTED_FIELDS_KEY] === computedFields;
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
          if (alreadyCalculated) continue;
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
    if (computedFields) out[COMPUTED_FIELDS_KEY] = computedFields;
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
