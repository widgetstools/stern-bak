/**
 * The filter walk: one pass over the store producing the rows a query matches.
 *
 * Split out of `QueryEngine` because it reads the store and the request and
 * nothing else about the engine — the memo that keeps a query from paying for
 * this per block stays with the engine, which is the part that knows about
 * revisions.
 */
import { doesRowMatchFilterModel } from "@wellsfargo-starui/core";
import {
  buildQuickFilterText,
  parseQuickFilter,
  rowPassesQuickFilter,
  rowPassesQuickFilterScoped,
} from "./quickFilter.js";
import type { RowStore } from "./RowStore.js";
import type { SessionQueryState } from "./SessionOverlay.js";
import type { Row, SsrmGetRowsRequest } from "./types.js";

export function collectFiltered(
store: RowStore,
  request: Pick<
    SsrmGetRowsRequest,
    "filterModel" | "quickFilterText" | "quickFilterColumns"
  >,
  session: SessionQueryState | null,
): Row[] {
  const filterModel = request.filterModel;
  const parts = parseQuickFilter(request.quickFilterText);
  const columns = request.quickFilterColumns ?? null;
  const out: Row[] = [];

  // The session's own view of the data — its pending edits merged in, its
  // excluded rows dropped — established BEFORE the filter model runs, so an
  // edited value filters and sorts on the value the user can see, and an
  // excluded row is absent from counts and paging alike rather than being
  // hidden after the fact.
  if (session) {
    for (const [key, row] of store.iterateEntries()) {
      const view = session.view(row);
      if (session.excluded(view)) continue;
      if (parts.length > 0) {
        // An unpatched row keeps the store's cached aggregate, which acts
        // as a prefilter. A PATCHED row's cache is stale and the cache is
        // only sound as a prefilter when it is a superset — an edit can add
        // a matching value the cached string never had — so the patched
        // row's text is rebuilt from the view instead.
        const passes =
          view === row
            ? rowPassesQuickFilterScoped(
                store.getQuickFilterText(key),
                row,
                parts,
                columns,
              )
            : rowPassesQuickFilter(
                buildQuickFilterText(view, columns ?? undefined),
                parts,
              );
        if (!passes) continue;
      }
      if (doesRowMatchFilterModel(view, filterModel)) out.push(view);
    }
    return out;
  }

  // Quick-filter first (cached substring checks), then column filter model —
  // same effective result as CSRM, optimized for the hot path.
  if (parts.length === 0) {
    for (const row of store.iterate()) {
      if (doesRowMatchFilterModel(row, filterModel)) out.push(row);
    }
    return out;
  }
  for (const [key, row] of store.iterateEntries()) {
    if (
      !rowPassesQuickFilterScoped(
        store.getQuickFilterText(key),
        row,
        parts,
        columns,
      )
    ) {
      continue;
    }
    if (doesRowMatchFilterModel(row, filterModel)) out.push(row);
  }
  return out;
}
