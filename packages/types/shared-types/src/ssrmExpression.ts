/**
 * The SSRM engine expression contract — wire form v1.
 *
 * The serialized-AST grammar the WASM engine will evaluate for computed view
 * columns (engine plan §12, phase T1 defines it; T3 implements it). Two
 * rules make it a contract rather than a wish:
 *
 * 1. **One grammar, one parser.** The client `ExpressionEngine`
 *    (`@wellsfargo-starui/core`) is the only parser of the DSL; the engine consumes
 *    THIS form, produced by `compileToEngineExpression`, and never re-parses
 *    source text. A second implementation of the language is how a filter
 *    comes to mean one thing in the grid and another in the engine.
 *
 * 2. **Client semantics, verbatim.** The evaluator COERCES rather than
 *    null-propagates — `toNum(null | NaN) → 0`, `toStr(null) → ''`, and
 *    conditions use `isTruthy` (null/undefined/false/0/'' are falsy). The
 *    engine must match, or the same expression computes different values in
 *    a calculated cell (client tier) and an engine sort (compiled tier).
 *    The normative statement of these semantics is the golden fixture file
 *    (`ssrmExpressionContract.fixtures.json` in the core expression module):
 *    every fixture's `expected` is the CLIENT evaluator's output, asserted
 *    in this repo's tests today and by the Rust conformance suite when T3
 *    lands.
 *
 * Deliberately OUTSIDE v1 (compile reports them untranslatable): variables
 * (`x`, `value`, `oldValue`…), diff refs, member access, `REGEX_MATCH`
 * (version-dependent), `NOW`/`TODAY`/`DATE_DIFF`/`DATE_ADD`
 * (non-deterministic or unit-laden). Aggregate forms `FN([col])` — the full
 * set including `MEDIAN`/`STDEV`/`VARIANCE`/`DISTINCT_COUNT` since T4 — are
 * in the grammar (`agg` node) and require the `aggregates` capability;
 * date-part functions require typed date columns (T6).
 */

export const SSRM_EXPR_CONTRACT_VERSION = 1 as const;

/** `+ - * / %` · comparisons · logical. String `+` concatenates, like the client. */
export type SsrmExprBinaryOp =
  | 'add' | 'sub' | 'mul' | 'div' | 'mod'
  | 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge'
  | 'and' | 'or';

export type SsrmExprUnaryOp = 'neg' | 'not';

/**
 * Scalar functions in grammar v1. Names are the DSL's own (upper-case);
 * argument counts and coercions are the client `functions.ts` definitions,
 * pinned by the fixtures.
 */
export type SsrmExprScalarFn =
  | 'ABS' | 'ROUND' | 'FLOOR' | 'CEIL' | 'SQRT' | 'POW' | 'MOD' | 'LOG' | 'EXP'
  | 'MIN' | 'MAX' // scalar form (2+ args); single-column-ref form is an `agg` node
  | 'CONCAT' | 'UPPER' | 'LOWER' | 'TRIM' | 'LEN' | 'SUBSTRING' | 'REPLACE'
  | 'CONTAINS' | 'STARTS_WITH' | 'ENDS_WITH'
  | 'IF' | 'IFS' | 'SWITCH' | 'CASE'
  | 'ISNULL' | 'ISNOTNULL' | 'ISEMPTY'
  | 'YEAR' | 'MONTH' | 'DAY' | 'IS_WEEKDAY';

/** Aggregate forms — view-level scalars the engine computes (T4: full set). */
export type SsrmExprAggFn =
  | 'sum' | 'avg' | 'count' | 'min' | 'max'
  | 'median' | 'stdev' | 'variance' | 'distinct_count';

export type SsrmExprNode =
  | { k: 'lit'; v: number | string | boolean | null }
  | { k: 'col'; name: string }
  | { k: 'bin'; op: SsrmExprBinaryOp; l: SsrmExprNode; r: SsrmExprNode }
  | { k: 'un'; op: SsrmExprUnaryOp; a: SsrmExprNode }
  | { k: 'fn'; name: SsrmExprScalarFn; args: SsrmExprNode[] }
  | { k: 'in'; a: SsrmExprNode; list: SsrmExprNode[] }
  | { k: 'between'; a: SsrmExprNode; lo: SsrmExprNode; hi: SsrmExprNode }
  /** Unified conditional: ternary / IF / IFS / SWITCH / CASE all lower to this. */
  | { k: 'cond'; branches: Array<{ when: SsrmExprNode; then: SsrmExprNode }>; else?: SsrmExprNode }
  /** `SUM([col])` and friends — a view-level scalar the whole column shares. */
  | { k: 'agg'; fn: SsrmExprAggFn; col: string };

/**
 * Engine capabilities a compiled expression needs beyond plain T3 computed
 * columns. `aggregates` = phase T4; `dateFns` = phase T6.
 */
export type SsrmExprRequirement = 'aggregates' | 'dateFns';

/** One computed column of a view spec, as the engine will receive it. */
export interface SsrmComputedColumnSpec {
  /** Result column name — addressable by the same view's sort/filter/group. */
  as: string;
  version: typeof SSRM_EXPR_CONTRACT_VERSION;
  expr: SsrmExprNode;
}
