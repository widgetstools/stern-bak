/**
 * Which columns does a query name?
 *
 * Split out of `QueryEngine` because it reads only the request — never the
 * rows, never engine state. It exists for one decision: whether the requesting
 * session's calculated columns have to be materialised before the filter runs,
 * or whether this query is the same question a clean session is asking and can
 * share its answer.
 */
import type { SsrmGetRowsRequest } from "./types.js";

/**
 * The parts of a request that can name a column, which is all
 * {@link requestReadsAnyField} needs to see.
 */
export interface QueryColumnRefs
  extends Pick<
    SsrmGetRowsRequest,
    "filterModel" | "sortModel" | "valueCols" | "pivotCols" | "quickFilterText" | "quickFilterColumns"
  > {
  /** Looser than the request's own, so `SetFilterValuesRequest`'s
   *  `{ field }`-only group columns are accepted here too. */
  rowGroupCols?: ReadonlyArray<{ id?: string; field?: string }>;
}

/**
 * A group level's field. AG Grid fills `ColumnVO.field` from `colDef.field`,
 * and a calculated column has none — it is defined by `colId` alone — so a
 * request grouping on one arrives carrying only the id.
 */
export function groupFieldOf(col: { id?: string; field?: string }): string {
  return col.field || col.id || "";
}

/**
 * Does this query read any of `fields`? Decides whether the session's
 * calculated columns have to be materialised before the filter runs, or
 * whether this query is the same question a clean session is asking.
 */
export function requestReadsAnyField(
  request: QueryColumnRefs,
  fields: readonly string[],
): boolean {
  const wanted = new Set(fields);
  for (const colId of Object.keys(request.filterModel ?? {})) {
    if (wanted.has(colId)) return true;
  }
  for (const entry of request.sortModel ?? []) {
    if (wanted.has(entry.colId)) return true;
  }
  for (const col of request.rowGroupCols ?? []) {
    if (wanted.has(groupFieldOf(col))) return true;
  }
  for (const col of request.valueCols ?? []) {
    if (col.field && wanted.has(col.field)) return true;
  }
  for (const col of request.pivotCols ?? []) {
    if (col.field && wanted.has(col.field)) return true;
  }
  if (request.quickFilterText) {
    // No scope means every field, which includes the calculated ones — the
    // client-side row model searches them too, through their valueGetter.
    const columns = request.quickFilterColumns;
    if (!columns) return true;
    for (const colId of columns) if (wanted.has(colId)) return true;
  }
  return false;
}
