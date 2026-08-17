/**
 * Ordering a materialised block — the leaf/tree comparator and the narrower
 * one group rows need.
 *
 * Split out of `QueryEngine` for the same reason as `queryAggregation.ts`:
 * neither function reads engine state. Both take the rows and the sort model
 * and nothing else.
 */
import { getPathAccessor } from "@wellsfargo-starui/types";
import { compareValues } from "@wellsfargo-starui/core";
import type { Row, SsrmGetRowsRequest } from "./types.js";

type SortModel = SsrmGetRowsRequest["sortModel"];

/**
 * AG Grid's auto group column. A sort on the group column arrives under this
 * id — never under the grouped field's own — so group rows would otherwise
 * see a sort naming a column they do not carry and fall back to insertion
 * order, ignoring the direction the user asked for.
 */
export const AUTO_GROUP_COLUMN_ID = "ag-Grid-AutoColumn";

/** A sort entry with its field accessor resolved once, not per comparison. */
interface SortEntry {
  read: (row: unknown) => unknown;
  sort: "asc" | "desc";
}

/**
 * Sort by the model's entries, falling back to (and tie-breaking on)
 * `fallbackField` so the order is total — two rows that tie on every sorted
 * column keep a stable position across blocks of the same query.
 */
export function sortRows(
  rows: Row[],
  sortModel: SortModel,
  fallbackField?: string,
): Row[] {
  const entries: SortEntry[] = (sortModel ?? []).map((s) => ({
    read: getPathAccessor(s.colId),
    sort: s.sort,
  }));
  const fallback = fallbackField ? getPathAccessor(fallbackField) : null;
  if (entries.length === 0) {
    if (!fallback) return rows;
    return [...rows].sort((a, b) => compareValues(fallback(a), fallback(b), "asc"));
  }
  return [...rows].sort((a, b) => {
    for (const entry of entries) {
      const c = compareValues(entry.read(a), entry.read(b), entry.sort);
      if (c !== 0) return c;
    }
    return fallback ? compareValues(fallback(a), fallback(b), "asc") : 0;
  });
}

/**
 * Order group rows.
 *
 * A group row carries the group field, its aggregated value columns and the
 * `__ssrm*` internals — nothing else. Sorting it by the LEAF sort model read
 * `undefined` on both sides for every other column, so the comparator returned
 * 0 and the block came back in `Map` first-seen order: the same query, ordered
 * by whichever rows happened to arrive first.
 *
 * So only the sort entries the group rows can actually answer are applied,
 * with the group key as the tie-break — and a sort on the auto group column is
 * redirected to the field it stands for, which is how AG Grid reports a click
 * on the group column header.
 */
export function sortGroupRows(
  rows: Row[],
  sortModel: SortModel,
  groupField: string,
): Row[] {
  const carried = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) carried.add(key);
  }
  const applicable = (sortModel ?? [])
    .map((s) => (s.colId === AUTO_GROUP_COLUMN_ID ? { ...s, colId: groupField } : s))
    .filter((s) => carried.has(s.colId));
  return sortRows(rows, applicable, groupField);
}
