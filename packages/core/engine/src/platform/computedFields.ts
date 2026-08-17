/**
 * The contract for "this row already carries a value the SOURCE computed".
 *
 * A calculated column is evaluated in two places today: the grid's own
 * `valueGetter`, from the rows this window happens to hold, and — under the
 * server-side row model — the worker, from the whole dataset. When the two
 * disagree the grid's answer wins, because AG-Grid asks the `valueGetter` and
 * never looks at the field. For a row-local expression they agree by luck; for
 * `SUM([price])` the grid is computing a total of a ~2,000-row block cache and
 * revising it as the user scrolls.
 *
 * This is the flag that ends the duplication. The source stamps the fields it
 * computed onto each row it hands over; the `valueGetter` returns those and
 * evaluates nothing. A source that computes nothing stamps nothing, so the
 * client-side row model keeps evaluating exactly as it always has.
 *
 * Declared HERE, in core, for the same reason {@link SsrmDataSource} is:
 * `@wellsfargo-starui/data` depends on `@wellsfargo-starui/core`, so the
 * worker imports this key rather than core importing the worker's row type.
 * One definition, both ends.
 *
 * Why a stamped LIST and not just "the field is present on the row":
 *  - an expression that legitimately evaluates to `undefined` is still an
 *    answer, and presence cannot tell that from "not computed";
 *  - a calculated column whose id happens to match a real field would be
 *    silently replaced by that field's raw value;
 *  - rules reach the worker on a debounce, so blocks fetched before they
 *    land carry no computed fields and must fall back — which is exactly
 *    what an explicit list expresses and presence cannot.
 */

/** Row property naming the fields the source computed. */
export const COMPUTED_FIELDS_KEY = '__ssrmCalculated';

/**
 * Row property naming the fields a CLIENT EDIT wrote after the source stamped
 * this row.
 *
 * The stamp is the source's claim about the row it handed over. A patch makes
 * that a different row: `assemblePatchRows` merges the new values onto a copy
 * of the existing one, so without this marker the stamp SURVIVES the edit and
 * a calculated column keeps rendering a value derived from a number that is no
 * longer there — silently, because the `valueGetter` returns the stamp instead
 * of evaluating.
 *
 * Deliberately NOT a blanket strip of the stamped fields. Which of them the
 * edit invalidated depends on the expression, and the two families answer
 * differently:
 *
 *  - **row-local** (`[price] * [qty]`) — only THIS row's value is stale, and
 *    the client can recompute it exactly. The marker makes it do so.
 *  - **column-wide** (`SUM([price])`) — the edit moved the answer for EVERY
 *    row by the same delta, so the rows stay consistent with each other and
 *    the next enrichment corrects them all at once. Dropping the stamp here
 *    would be strictly worse: under the server-side row model the client's
 *    cross-row snapshot is deliberately empty (walking it would page the whole
 *    dataset per data event), so the fallback would fold nothing and paint a
 *    single row's total as 0 beside neighbours showing the real one.
 *
 * The marker records what changed; {@link buildVirtualColDef} decides which
 * family it is looking at, because that is where the expression is.
 */
export const CLIENT_EDITED_FIELDS_KEY = '__ssrmClientEdited';

/** Returned when the source did not compute this field — distinct from a
 *  computed `undefined`, which is a real answer. */
export const NOT_COMPUTED = Symbol('not-computed');

/**
 * The value the source computed for `field` on this row, or
 * {@link NOT_COMPUTED}.
 *
 * Reads structurally so core stays free of any dependency on the worker's
 * `EnrichedRow` type.
 */
export function readComputedField(
  data: Record<string, unknown> | null | undefined,
  field: string,
): unknown {
  if (!data) return NOT_COMPUTED;
  const fields = data[COMPUTED_FIELDS_KEY];
  if (!Array.isArray(fields) || !fields.includes(field)) return NOT_COMPUTED;
  return data[field];
}

/**
 * Record on `row` that a client edit wrote `fields`.
 *
 * A no-op on a row carrying no source stamp — that is every row of every
 * client-side grid, whose row objects are the ones the data provider handed
 * over and stay free of `__ssrm*` bookkeeping. The condition reads the ROW,
 * never the row model, so both adapters run the same line.
 *
 * Nothing clears the marker: the source's next enrichment builds a fresh row
 * from its own store copy, which never saw the client's patch.
 */
export function markClientEdited(
  row: Record<string, unknown>,
  fields: readonly string[],
): void {
  if (!Array.isArray(row[COMPUTED_FIELDS_KEY]) || fields.length === 0) return;
  const previous = row[CLIENT_EDITED_FIELDS_KEY];
  const merged = new Set(Array.isArray(previous) ? (previous as string[]) : []);
  for (const field of fields) merged.add(field);
  row[CLIENT_EDITED_FIELDS_KEY] = [...merged];
}

/** Has a client edit written to this row since the source stamped it? */
export function hasClientEdits(data: Record<string, unknown> | null | undefined): boolean {
  if (!data) return false;
  const fields = data[CLIENT_EDITED_FIELDS_KEY];
  return Array.isArray(fields) && fields.length > 0;
}
