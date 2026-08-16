import { aggregateRows, resolveAggFunc, type AggSpec } from "./aggregations.js";
import { assertFilterModelSupported, rowPassesFilter } from "./filter.js";
import {
  parseQuickFilter,
  rowPassesQuickFilterScoped,
} from "./quickFilter.js";
import type { RowStore } from "./RowStore.js";
import type { AggFunc, Row } from "./types.js";

export interface StatusBarAggSpec {
  field: string;
  aggFunc?: string | null;
  /** Display label; defaults to field. */
  headerName?: string;
}

export interface StatusBarRequest {
  filterModel?: Record<string, unknown> | null;
  /** Active quick-filter text (CSRM-parity). */
  quickFilterText?: string | null;
  /** Quick-filter column scope — see `SsrmGetRowsRequest.quickFilterColumns`. */
  quickFilterColumns?: string[] | null;
  /** Columns to aggregate over the filtered (or selected) set. */
  valueCols?: StatusBarAggSpec[];
  /** When set, aggregate/count only these row keys (selection). */
  selectedKeys?: string[];
}

export interface StatusBarAggValue {
  field: string;
  headerName: string;
  aggFunc: AggFunc;
  /**
   * `null` when no row contributed a value — a blank, not a zero. This used
   * to finish with `Number(value ?? 0)`, which undid the fold's own
   * deliberate `null` and reported an empty MIN as a 0 price.
   */
  value: number | null;
}

export interface StatusBarSummary {
  totalRows: number;
  filteredRows: number;
  selectedRows: number;
  aggregations: StatusBarAggValue[];
  revision: number;
}

/**
 * CSRM-parity status metrics computed from the full SharedWorker cache.
 */
export function computeStatusBar(
  store: RowStore,
  request: StatusBarRequest = {},
): StatusBarSummary {
  // Before the scan, so a filter this engine cannot evaluate is refused once
  // rather than answered with a count of whatever the fallthrough admitted.
  assertFilterModelSupported(request.filterModel);
  const totalRows = store.size;
  let filteredRows = 0;
  const filtered: Row[] = [];
  const parts = parseQuickFilter(request.quickFilterText);
  const quickFilterColumns = request.quickFilterColumns ?? null;

  for (const [key, row] of store.iterateEntries()) {
    if (
      parts.length &&
      !rowPassesQuickFilterScoped(
        store.getQuickFilterText(key),
        row,
        parts,
        quickFilterColumns,
      )
    ) {
      continue;
    }
    if (rowPassesFilter(row, request.filterModel)) {
      filteredRows++;
      filtered.push(row);
    }
  }

  let scope = filtered;
  let selectedRows = 0;
  if (request.selectedKeys && request.selectedKeys.length > 0) {
    const keySet = new Set(request.selectedKeys.map(String));
    const selected: Row[] = [];
    for (const row of filtered) {
      const key = row[store.keyColumn];
      if (key != null && keySet.has(String(key))) {
        selected.push(row);
      }
    }
    selectedRows = selected.length;
    scope = selected;
  }

  // Folded once per DISTINCT aggregation, not once for the whole list: the
  // fold's output row is keyed by field, so asking for MIN(px) and MAX(px) in
  // one pass left both reading whichever spec was written last. A status bar
  // panel is exactly where a caller names the same column twice.
  const specsByFunc = new Map<AggFunc, AggSpec[]>();
  const requested = (request.valueCols ?? []).filter((v) => v.field);
  for (const v of requested) {
    const aggFunc = resolveAggFunc(v.aggFunc);
    const specs = specsByFunc.get(aggFunc);
    if (specs) specs.push({ field: v.field, aggFunc });
    else specsByFunc.set(aggFunc, [{ field: v.field, aggFunc }]);
  }
  const foldedByFunc = new Map<AggFunc, Row>();
  for (const [aggFunc, specs] of specsByFunc) {
    foldedByFunc.set(aggFunc, aggregateRows(scope, specs));
  }

  const aggregations: StatusBarAggValue[] = requested.map((v) => {
    const aggFunc = resolveAggFunc(v.aggFunc);
    const value = foldedByFunc.get(aggFunc)?.[v.field];
    return {
      field: v.field,
      headerName: v.headerName ?? v.field,
      aggFunc,
      value: typeof value === "number" ? value : null,
    };
  });

  return {
    totalRows,
    filteredRows,
    selectedRows,
    aggregations,
    revision: store.getRevision(),
  };
}
