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
