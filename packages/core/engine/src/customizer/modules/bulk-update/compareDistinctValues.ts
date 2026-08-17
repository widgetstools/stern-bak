/**
 * Ordering for a distinct-value list.
 *
 * This is all that remains of `resolveColumnDistinctValues`, which walked
 * `getDisplayedRowCount()` calling `getDisplayedRowAtIndex` — a pairing that
 * is only coherent under the client-side row model. Under the server-side one
 * the count is the SERVER's total (100,000, say) while the indices outside the
 * loaded block window resolve to loading stubs, so the loop asked the grid for
 * ninety-eight thousand rows it did not have and built the dropdown from the
 * handful it did. `platform.data.distinct()` owns the walk now, and answers
 * from the worker's `getSetFilterValues` where the grid cannot.
 *
 * The ordering stayed behind on purpose: {@link GridDataPort.distinct}
 * documents that it returns values in SOURCE ORDER and takes no view on
 * sorting, because its two implementations order differently (AG-Grid yields
 * row order, the worker yields `localeCompare`d strings). Normalising inside
 * the port would mean a second copy of this comparator.
 */

/** Nulls last, numbers numerically, everything else by locale. */
export function compareDistinctValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}
