/**
 * Translate AG Grid request state into a Perspective View config.
 *
 * Sort, filter, aggregation and expression evaluation all live server-side
 * (worker-side) under the Perspective row engine: AG Grid states the intent,
 * Perspective computes it, and the grid only paints the window it gets back.
 * Changing any of these means building a NEW View — Perspective view configs
 * are immutable — which is why every swap must go through a refcounted safe
 * close on the window side.
 *
 * This module is PURE and dependency-free on purpose. Two callers share it:
 * the window-side view config builder (which owns the live View) and the
 * worker-side query engine (which answers whole-book count/aggregate/match
 * questions). One implementation, so a filter can never mean one thing in the
 * grid and another in the badge above it. That is also why the AG shapes below
 * are declared structurally rather than imported from `ag-grid-community` —
 * `@wellsfargo-starui/core` is a foundation layer and the worker never loads AG
 * Grid at all.
 *
 * Every shape below was verified against @perspective-dev/client 4.5.2; none of
 * it is inferred from docs.
 */

/** Verified aggregate names. NOTE: 3.8's `weighted mean` is NOT accepted by
 *  4.5.2 (the string does not appear anywhere in the package) — express it as
 *  `sum(w*x) / sum(w)` with expression columns instead. */
export type PerspectiveAggregate =
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

export interface PerspectiveViewConfig {
  /** `[[colId, 'asc' | 'desc'], ...]` */
  sort?: [string, 'asc' | 'desc'][];
  /** `[[colId, op, value], ...]` — clauses AND together. */
  filter?: unknown[][];
  group_by?: string[];
  aggregates?: Record<string, PerspectiveAggregate>;
  /** Object map: `{ alias: '"a" * "b"' }`. Aliases are usable in sort/filter/group_by. */
  expressions?: Record<string, string>;
  columns?: string[];
}

export interface AgSortItem {
  colId: string;
  sort: string;
}

/** The AG filter shapes we translate. */
export interface AgFilterItem {
  filterType?: string;
  type?: string;
  filter?: unknown;
  filterTo?: unknown;
  values?: unknown[];
  dateFrom?: string;
  dateTo?: string;
  operator?: string;
  conditions?: AgFilterItem[];
}

export interface AgRequestState {
  sortModel?: readonly AgSortItem[];
  filterModel?: Record<string, AgFilterItem> | null;
  rowGroupCols?: readonly { id: string }[];
  valueCols?: readonly { id: string; aggFunc?: string | null }[];
  /** Calc columns: alias -> Perspective expression source. */
  expressions?: Record<string, string>;
  /** Quick-search text. Whitespace splits it into tokens that all must match. */
  quickFilterText?: string;
  /** Columns the quick search spans — every Table column, normally. */
  quickFilterColumns?: readonly string[];
}

/** Alias of the boolean expression column the quick filter compiles into. */
export const QUICK_FILTER_COLUMN = '__quick__';

/**
 * Make a user's quick-search token safe to embed in a Perspective `match()`.
 *
 * MEASURED, and every part of this is a finding rather than a precaution:
 *
 * - `match()` takes a **regex**, so a bare `.` is already a wildcard and a
 *   lone `(` is a syntax error that aborts the whole View build. A user typing
 *   `(` into the search box would blank the grid.
 * - Backslash-escaping does NOT rescue it: `'\('` fails the same way as `'('`.
 *   So there is no escaping strategy available — the input has to be rewritten.
 * - The term also sits inside a single-quoted literal, and a quote cannot be
 *   escaped reliably either (`''` is a parse error).
 *
 * So every character with regex or quoting meaning becomes `.`, which matches
 * itself along with anything else. That over-matches slightly — searching
 * `3.5` also finds `3x5` — which is the right trade for a quick search: it can
 * never throw, never mis-parse, and never silently match nothing.
 */
export function sanitizeQuickFilterTerm(term: string): string {
  return term.toLowerCase().replace(/[^\p{L}\p{N} _-]/gu, '.');
}

/**
 * Compile quick-search text into one boolean expression column.
 *
 * AG's quick filter matches a row when EVERY whitespace-separated token is
 * found in SOME column. Perspective clause lists are conjunctive, so the
 * per-token OR cannot be expressed as filter clauses at all — it has to be an
 * expression. Hence `(a or b or c) and (a or b or c)`, one group per token.
 *
 * Two shapes here are measured, not chosen:
 * - `string("col")` wraps every column, so the same codegen works for text and
 *   numeric columns alike and a null never poisons the row.
 * - `or` / `and` are the operators. `|` parses but is NOT a logical or — it
 *   matched every row in the probe, which is exactly the kind of silently-wrong
 *   filter that is worse than no filter.
 *
 * Returns null when there is nothing to apply, so callers can omit the
 * expression entirely rather than build a View that differs by a no-op clause.
 */
export function toQuickFilterExpression(
  columns: readonly string[],
  text: string | undefined | null,
): string | null {
  const tokens = (text ?? '').trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || columns.length === 0) return null;

  return tokens
    .map((token) => {
      const term = sanitizeQuickFilterTerm(token);
      const anyColumn = columns
        .map((col) => `match(lower(string("${col}")), '${term}')`)
        .join(' or ');
      return `(${anyColumn})`;
    })
    .join(' and ');
}

/** AG sort -> Perspective sort. Unknown directions are dropped, not guessed. */
export function toPerspectiveSort(
  sortModel: readonly AgSortItem[] | undefined,
): [string, 'asc' | 'desc'][] | undefined {
  if (!sortModel?.length) return undefined;
  const out: [string, 'asc' | 'desc'][] = [];
  for (const s of sortModel) {
    if (s.sort === 'asc' || s.sort === 'desc') out.push([s.colId, s.sort]);
  }
  return out.length > 0 ? out : undefined;
}

/** AG aggFunc -> Perspective aggregate. Returns null when unmappable so the
 *  caller can leave the column alone rather than silently mis-aggregating. */
export function toPerspectiveAggregate(
  aggFunc: string | null | undefined,
): PerspectiveAggregate | null {
  switch (aggFunc) {
    case 'sum':
      return 'sum';
    case 'avg':
      return 'avg';
    case 'min':
      return 'low';
    case 'max':
      return 'high';
    case 'count':
      return 'count';
    case 'first':
      return 'first';
    case 'last':
      return 'last';
    default:
      return null;
  }
}

const NUMERIC_OPS: Record<string, string> = {
  equals: '==',
  notEqual: '!=',
  greaterThan: '>',
  greaterThanOrEqual: '>=',
  lessThan: '<',
  lessThanOrEqual: '<=',
};

const TEXT_OPS: Record<string, string> = {
  equals: '==',
  notEqual: '!=',
  contains: 'contains',
};

/**
 * Translate ONE AG filter entry into zero or more Perspective clauses.
 *
 * Returns `[]` for anything we cannot express exactly. That is deliberate:
 * a filter we half-understand would show the trader a subtly wrong book,
 * which is far worse than showing an unfiltered one.
 */
export function toPerspectiveFilterClauses(colId: string, item: AgFilterItem): unknown[][] {
  // Compound (AND only — Perspective clause lists are conjunctive).
  if (item.conditions?.length) {
    if ((item.operator ?? 'AND').toUpperCase() !== 'AND') return [];
    return item.conditions.flatMap((c) => toPerspectiveFilterClauses(colId, c));
  }

  if (item.filterType === 'set') {
    return Array.isArray(item.values) ? [[colId, 'in', item.values]] : [];
  }

  if (item.type === 'blank') return [[colId, 'is null']];
  if (item.type === 'notBlank') return [[colId, 'is not null']];

  if (item.type === 'inRange') {
    const from = item.filter ?? item.dateFrom;
    const to = item.filterTo ?? item.dateTo;
    if (from === undefined || to === undefined) return [];
    return [
      [colId, '>=', from],
      [colId, '<=', to],
    ];
  }

  const table = item.filterType === 'text' ? TEXT_OPS : NUMERIC_OPS;
  const op = item.type ? table[item.type] : undefined;
  if (!op || item.filter === undefined) return [];
  return [[colId, op, item.filter]];
}

/**
 * True when EVERY column entry in the model translates to at least one
 * Perspective clause.
 *
 * `toPerspectiveFilterClauses` drops what it cannot express exactly, and for a
 * VIEW that is the right trade — an unfiltered book beats a subtly wrong one,
 * and the grid's own filter chips still say what the user asked for. A COUNT
 * has no such consolation: a dropped clause makes the number silently too
 * large, and a badge reading "matches 20,000 rows" is a confidently wrong
 * answer of exactly the kind this path keeps producing. Callers that need
 * exactness ask this first and report nothing when it is false.
 */
export function isFilterModelMappable(
  filterModel: Record<string, AgFilterItem> | null | undefined,
): boolean {
  if (!filterModel) return true;
  for (const colId of Object.keys(filterModel)) {
    if (toPerspectiveFilterClauses(colId, filterModel[colId]).length === 0) return false;
  }
  return true;
}

export function toPerspectiveFilter(
  filterModel: Record<string, AgFilterItem> | null | undefined,
): unknown[][] | undefined {
  if (!filterModel) return undefined;
  const clauses: unknown[][] = [];
  for (const colId of Object.keys(filterModel)) {
    clauses.push(...toPerspectiveFilterClauses(colId, filterModel[colId]));
  }
  return clauses.length > 0 ? clauses : undefined;
}

/**
 * Build the full View config for a request.
 *
 * Only defined keys are emitted — passing `undefined`/empty collections would
 * still create a *different* config object and therefore force a needless View
 * rebuild on every block request.
 */
export function toPerspectiveViewConfig(state: AgRequestState): PerspectiveViewConfig {
  const config: PerspectiveViewConfig = {};

  const sort = toPerspectiveSort(state.sortModel);
  if (sort) config.sort = sort;

  const filter = toPerspectiveFilter(state.filterModel);
  if (filter) config.filter = filter;

  // The quick filter rides as a boolean expression column plus one clause,
  // because its per-token OR across columns cannot be a clause list. It ANDs
  // with the column filters, which is what AG does too.
  const quick = toQuickFilterExpression(
    state.quickFilterColumns ?? [],
    state.quickFilterText,
  );
  if (quick) {
    config.expressions = { ...config.expressions, [QUICK_FILTER_COLUMN]: quick };
    config.filter = [...(config.filter ?? []), [QUICK_FILTER_COLUMN, '==', true]];
  }

  const groupBy = state.rowGroupCols?.map((c) => c.id) ?? [];
  if (groupBy.length > 0) config.group_by = groupBy;

  const aggregates: Record<string, PerspectiveAggregate> = {};
  for (const col of state.valueCols ?? []) {
    const agg = toPerspectiveAggregate(col.aggFunc);
    if (agg) aggregates[col.id] = agg;
  }
  if (Object.keys(aggregates).length > 0) config.aggregates = aggregates;

  // MERGED, not assigned: the quick filter may already have put its own
  // expression column here, and overwriting it would drop the filter while
  // leaving the clause that references it — a View that cannot build.
  if (state.expressions && Object.keys(state.expressions).length > 0) {
    config.expressions = { ...config.expressions, ...state.expressions };
  }

  return config;
}

export interface AgGroupLevelState extends AgRequestState {
  /** Ancestor keys of the level being requested; its length is the depth. */
  groupKeys?: readonly unknown[];
}

export interface PerspectiveGroupLevel {
  config: PerspectiveViewConfig;
  /**
   * The column this level's rows are grouped by, or `null` at the leaf level
   * (every group column already consumed by `groupKeys`), where the View
   * returns real rows rather than group rows.
   */
  groupColId: string | null;
  /** Depth of the requested level — `groupKeys.length`. */
  depth: number;
}

/**
 * Translate ONE level of an AG Grid group request into a View config.
 *
 * AG Grid pulls a group tree one level at a time: it asks for the children of
 * a path, never for the whole tree. Perspective's `group_by` does the
 * opposite — `group_by: ['sector','book']` returns the fully expanded tree
 * with depth-1 and depth-2 rows interleaved, which is not what any single AG
 * request wants.
 *
 * The mapping that fits both (verified against 4.5.2): group by exactly the
 * ONE column at the requested depth, and push the ancestor keys down as
 * filter clauses. `groupKeys: ['Energy']` over `[sector, book]` becomes
 * `{ group_by: ['book'], filter: [['sector','==','Energy'], ...] }`, whose
 * rows are exactly the children AG asked for.
 *
 * Row 0 of the result is ALWAYS the grand total for that filter
 * (`__ROW_PATH__: []`), at every depth — so each level carries its own
 * subtotal, and the root level's row 0 is the grand total of the whole book.
 * Callers must skip it when serving AG a block of children.
 */
export function toPerspectiveGroupLevel(state: AgGroupLevelState): PerspectiveGroupLevel {
  const groupCols = state.rowGroupCols ?? [];
  const groupKeys = state.groupKeys ?? [];
  const depth = groupKeys.length;

  // Build the non-group parts first, then override `group_by`: this level
  // groups by one column, not by all of them.
  const config = toPerspectiveViewConfig({ ...state, rowGroupCols: undefined });

  const ancestorClauses: unknown[][] = [];
  for (let i = 0; i < depth && i < groupCols.length; i++) {
    const colId = groupCols[i].id;
    const key = groupKeys[i];
    // AG represents a blank group as null; `== null` is not a Perspective
    // comparison, so it has to become the null predicate instead.
    ancestorClauses.push(
      key === null || key === undefined ? [colId, 'is null'] : [colId, '==', key],
    );
  }
  if (ancestorClauses.length > 0) {
    config.filter = [...(config.filter ?? []), ...ancestorClauses];
  }

  const groupCol = depth < groupCols.length ? groupCols[depth] : undefined;
  if (groupCol) config.group_by = [groupCol.id];

  return { config, groupColId: groupCol?.id ?? null, depth };
}
