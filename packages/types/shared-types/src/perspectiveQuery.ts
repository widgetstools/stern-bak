/**
 * Wire shapes for the worker-side Perspective query/push engine.
 *
 * ONE subscription protocol serves every whole-book question a window can
 * ask — saved-filter count badges, header-paint "does any row match", set
 * filter values, alert rules — rather than four bespoke mechanisms. The
 * point is not tidiness: subscriptions with an identical query DEDUPE
 * across windows, so N blotters watching the same saved filter cost the
 * engine one View, not N. A per-window mechanism cannot do that no matter
 * how well it is written.
 *
 * These live in the foundation layer because both ends need them and
 * neither may import the other. That also forbids importing
 * `@wellsfargo-starui/core`, so two unions below (`PerspectiveQueryAggregate`,
 * and the fields of `PerspectiveAlertHit`) are RESTATED rather than
 * imported. The worker asserts at compile time that they still match their
 * originals — see the drift guard in `perspectiveQueryEngine.ts`.
 */

/**
 * Aggregate names, verified against @perspective-dev/client 4.5.2.
 * Structurally identical to `PerspectiveAggregate` in
 * `@wellsfargo-starui/core`; see the module header for why it is restated.
 */
export type PerspectiveQueryAggregate =
  | 'sum'
  | 'avg'
  | 'mean'
  | 'median'
  | 'count'
  | 'distinct count'
  | 'high'
  | 'low'
  | 'first'
  | 'last';

/**
 * An AG Grid filter model, opaque on the wire.
 *
 * Deliberately not narrowed to core's `AgFilterItem`: this crosses a
 * package boundary the foundation layer cannot import across, and the
 * worker validates it with `isFilterModelMappable` before trusting it
 * anyway — which is a stronger check than any structural type.
 */
export type PerspectiveQueryFilterModel = Record<string, unknown>;

/** Filter state shared by the queries that count or aggregate a book. */
export interface PerspectiveQueryFilterState {
  filterModel?: PerspectiveQueryFilterModel | null;
  /** Quick-search text. Whitespace splits it into tokens that all must match. */
  quickFilterText?: string;
  /** Columns the quick search spans. Required for `quickFilterText` to do anything. */
  quickFilterColumns?: readonly string[];
}

/** How many rows match a filter — the saved-filter badge and the status bar. */
export interface PerspectiveCountQuery extends PerspectiveQueryFilterState {
  kind: 'count';
}

/**
 * How many rows satisfy an expression — the header painter's "does any row
 * match this rule".
 *
 * `source` is an ALREADY-COMPILED Perspective expression, not this app's
 * expression language. The window compiles it with
 * `tryCompileToPerspectiveExpression`, which means a rule that cannot
 * compile is refused where its author can see the reason, and the worker
 * never has to carry the parser.
 */
export interface PerspectiveCountExpressionQuery {
  kind: 'countExpression';
  source: string;
}

/** One scalar over the whole (optionally filtered) book. */
export interface PerspectiveAggregateQuery extends PerspectiveQueryFilterState {
  kind: 'aggregate';
  colId: string;
  aggregate: PerspectiveQueryAggregate;
}

/** Distinct values of one column — the set filter's value list. */
export interface PerspectiveDistinctValuesQuery {
  kind: 'distinctValues';
  colId: string;
  /**
   * Caller's ceiling. The worker clamps this to its own and REFUSES past
   * it rather than truncating: a set filter silently missing half its
   * values reads as "these are all the values", which is wrong in a way
   * the user cannot see.
   */
  limit?: number;
}

/**
 * Which rows satisfy an expression, pushed as a DIFF — alert threshold and
 * expression rules.
 *
 * The worker keeps the matched key set per subscription and pushes only
 * what entered and left it, because the interesting event is the
 * transition, not the membership.
 */
export interface PerspectiveMatchSetQuery {
  kind: 'matchSet';
  /** Compiled Perspective expression — same contract as `countExpression`. */
  source: string;
  /** Columns to carry in each snapshot. Omitted means the key column only. */
  columns?: readonly string[];
}

export type PerspectiveRelativeChangeMode =
  | 'PERCENT_CHANGE'
  | 'ABSOLUTE_CHANGE'
  | 'ANY_CHANGE';

export type PerspectiveRelativeChangeDirection = 'up' | 'down' | 'both';

/**
 * Fire when a field's value CHANGES in a way a rule cares about.
 *
 * The one query that a View cannot answer: it needs the previous value,
 * which an upsert Table does not hold — writing a row replaces it. So this
 * is served by a shadow map in the table feed, scoped to exactly the fields
 * some active subscription watches, diffed before each write lands.
 */
export interface PerspectiveChangeRuleQuery {
  kind: 'changeRule';
  /** Identifies the rule in the pushed hits; the engine does not interpret it. */
  ruleId: string;
  /** The single column watched. This is what the feed's shadow map holds. */
  field: string;
  mode: 'dataChange' | 'relativeChange';
  /** `relativeChange` only. */
  changeMode?: PerspectiveRelativeChangeMode;
  /** `relativeChange` only — required for PERCENT/ABSOLUTE, ignored for ANY_CHANGE. */
  threshold?: number;
  /** `relativeChange` only. Default `'both'`. */
  direction?: PerspectiveRelativeChangeDirection;
  /** `dataChange` only — a boolean expression in this app's own language. */
  expression?: string;
}

export type PerspectiveQuerySpec =
  | PerspectiveCountQuery
  | PerspectiveCountExpressionQuery
  | PerspectiveAggregateQuery
  | PerspectiveDistinctValuesQuery
  | PerspectiveMatchSetQuery
  | PerspectiveChangeRuleQuery;

export type PerspectiveQueryKind = PerspectiveQuerySpec['kind'];

// ─── Results ────────────────────────────────────────────────────────

/** One row carried alongside a `matchSet` transition. */
export interface PerspectiveRowSnapshot {
  /** The row's index-column value, stringified. */
  id: string;
  /** The columns the query asked for. Empty when it asked for none. */
  data: Record<string, unknown>;
}

/**
 * Structurally identical to `AlertHit` in `@wellsfargo-starui/core`; see the
 * module header for why it is restated rather than imported. The worker
 * produces these by calling core's own evaluators, never a second copy of
 * their logic.
 */
export interface PerspectiveAlertHit {
  ruleId: string;
  rowId: string;
  column: string | null;
  value: unknown;
  prevValue: unknown;
}

/**
 * `null` is a real answer, and a different one from `refused`.
 *
 * A count that cannot be expressed EXACTLY answers `null` — never a
 * number. `toPerspectiveFilterClauses` drops what it cannot translate,
 * which is the right trade for a VIEW (an unfiltered book beats a subtly
 * wrong one) but not for a COUNT: a dropped clause makes the number
 * silently too large, and a badge reading "matches 20,000 rows" is a
 * confidently wrong answer. `refused` is the other thing entirely — the
 * engine declined to run the query at all, and said why.
 */
export type PerspectiveQueryResult =
  | { kind: 'count'; count: number | null }
  | { kind: 'countExpression'; count: number | null }
  | { kind: 'aggregate'; value: number | null }
  | { kind: 'distinctValues'; values: readonly unknown[] }
  | {
      kind: 'matchSet';
      newlyMatched: readonly PerspectiveRowSnapshot[];
      newlyUnmatched: readonly string[];
    }
  | { kind: 'changeRule'; hits: readonly PerspectiveAlertHit[] }
  | { kind: 'refused'; reason: string };

/** One field's before/after, as the table feed's shadow map observed it. */
export interface PerspectiveRowFieldChange {
  /** The row's index-column value, stringified. */
  key: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  /**
   * The incoming row this change came from. Carried because
   * `evaluateDataChangeRule` evaluates its expression against the whole
   * row context, which the field-scoped shadow map by design does not hold.
   */
  row: Record<string, unknown>;
}
