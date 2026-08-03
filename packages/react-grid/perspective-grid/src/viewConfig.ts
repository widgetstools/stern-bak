/**
 * The OUTPUT side of a Perspective View: turning what a View returns into what
 * AG Grid paints, plus the identity a live View is cached under.
 *
 * The input side — AG request state -> View config — lives in
 * `@wellsfargo-starui/core` (`perspective/filterTranslate.ts`) because the
 * worker-side query engine needs exactly the same translation and a second
 * copy would let a filter mean one thing in the grid and another in the badge
 * above it. Everything re-exported from here is that one implementation.
 *
 * What is left below genuinely needs a live View or its columnar output, so it
 * cannot move: `to_columns` returns `{ col: [...] }` with the group key hidden
 * in `__ROW_PATH__`, and the schema decides which of those columns AG expects
 * to be blank in a group row.
 *
 * Every shape below was verified against @perspective-dev/client 4.5.2; none of
 * it is inferred from docs.
 */
import type { PerspectiveAggregate, PerspectiveViewConfig } from '@wellsfargo-starui/core';

/** Perspective types that carry a meaningful default aggregate. */
const NUMERIC_SCHEMA_TYPES = new Set(['integer', 'float']);

/**
 * Blank the aggregate cell of every NON-NUMERIC column the user did not ask to
 * aggregate.
 *
 * AG Grid leaves a column empty in a group or total row unless it has an
 * `aggFunc`. Perspective does the opposite: a column with no entry in
 * `aggregates` still gets that type's DEFAULT aggregate, and for a string
 * column that is a distinct-count — so a text column renders a number under a
 * group header, and the grand total row reads like data. Restoring the AG
 * behaviour is what this does.
 *
 * NUMERIC columns are left alone deliberately. Perspective's default for them
 * is a sum, which is what a totals row is for and what a user expects to see
 * without configuring anything.
 *
 * Opting back in is just an `aggFunc` on the column — `first` and `last` map
 * straight through `toPerspectiveAggregate` and are the two that mean anything
 * for text, so a user who wants "the desk of the first row in this group" can
 * still have it.
 *
 * `keep` covers the columns that are structure rather than aggregate: the
 * group column (which holds the path key), `__ROW_PATH__`, and the tree
 * markers. Blanking those would erase the group label itself.
 */
export function blankUnaggregatedNonNumeric(
  columns: Record<string, unknown[]>,
  opts: {
    /** Column -> Perspective type, from `table.schema()`. */
    schema: Record<string, string> | null | undefined;
    /** Columns the view config aggregates explicitly. */
    aggregates?: Record<string, PerspectiveAggregate>;
    /** Structural columns that must survive untouched. */
    keep?: readonly (string | null)[];
  },
): Record<string, unknown[]> {
  const { schema, aggregates, keep } = opts;
  // No schema means no way to tell numeric from text. Leave everything alone
  // rather than blank a column that was carrying a real total.
  if (!schema) return columns;

  const protectedCols = new Set<string>(['__ROW_PATH__']);
  for (const k of keep ?? []) if (k) protectedCols.add(k);

  let changed = false;
  const out: Record<string, unknown[]> = { ...columns };
  for (const name of Object.keys(columns)) {
    if (protectedCols.has(name)) continue;
    if (aggregates && name in aggregates) continue;
    const type = schema[name];
    // Unknown to the schema means an expression column (quick filter, a
    // calculated column) — not something to guess about.
    if (type === undefined || NUMERIC_SCHEMA_TYPES.has(type)) continue;
    const col = columns[name];
    if (!Array.isArray(col)) continue;
    out[name] = col.map(() => null);
    changed = true;
  }
  return changed ? out : columns;
}

/**
 * Rewrite a grouped View window into the shape AG Grid builds group rows from.
 *
 * Perspective puts the group key in `__ROW_PATH__` — the full path, deepest
 * last. AG reads the group value from the group column's own field, so without
 * this remap every group row renders blank. Done columnar (rather than after
 * pivoting to rows) so the datasource's `columnsToRows` stays untouched.
 *
 * The grouped View also returns an aggregated column under the group column's
 * own name; overwriting it with the path key is exactly what is wanted.
 */
export function toGroupColumns(
  columns: Record<string, unknown[]>,
  groupColId: string,
): Record<string, unknown[]> {
  const paths = columns.__ROW_PATH__;
  if (!Array.isArray(paths)) return columns;

  const out = { ...columns };
  delete out.__ROW_PATH__;
  out[groupColId] = paths.map((path) =>
    Array.isArray(path) && path.length > 0 ? path[path.length - 1] : null,
  );
  return out;
}

/**
 * Fields a tree row carries so AG can recognise it as a parent and key it.
 *
 * AG Grid's server-side **tree** mode does not use `rowGroupCols` at all —
 * there are no group columns, and the hierarchy is read off the DATA through
 * `isServerSideGroup(data)` and `getServerSideGroupKey(data)`. Perspective has
 * nothing to say about either, so the row engine stamps them on.
 *
 * Namespaced with the same `__` convention as `__ROW_PATH__` and
 * `__grandTotal`, and stripped from nothing — a detail/tree consumer reads
 * them, and a column of that name in a real book would be pathological.
 */
export const TREE_KEY_FIELD = '__treeKey';
export const TREE_GROUP_FIELD = '__treeGroup';

/**
 * A grouped window rewritten as TREE rows.
 *
 * Same remap `toGroupColumns` does — `__ROW_PATH__` onto the level's own
 * column — plus the two markers AG reads the hierarchy from. Every row of a
 * grouped View is a parent by construction: the leaf level is served by an
 * UNgrouped View, which never reaches here, so `__treeGroup` is unconditionally
 * true rather than derived.
 */
export function toTreeColumns(
  columns: Record<string, unknown[]>,
  groupColId: string,
): Record<string, unknown[]> {
  const out = toGroupColumns(columns, groupColId);
  const keys = out[groupColId];
  if (!Array.isArray(keys)) return out;
  return {
    ...out,
    [TREE_KEY_FIELD]: keys.map((key) => (key === null || key === undefined ? '' : String(key))),
    [TREE_GROUP_FIELD]: keys.map(() => true),
  };
}

/**
 * Stable identity for a View config — moved to `@wellsfargo-starui/core`
 * because the worker's query engine keys its subscription registry on it,
 * and the data bucket cannot import from here. Re-exported so this module
 * stays the one place the row engine reads View identity from.
 */
export { viewConfigKey } from '@wellsfargo-starui/core';
