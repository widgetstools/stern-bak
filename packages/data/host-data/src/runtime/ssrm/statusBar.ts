import { aggregateRows, normalizeAgg, type AggSpec } from "./aggregations.js";
import { rowPassesFilter } from "./filter.js";
import {
  parseQuickFilter,
  rowPassesQuickFilter,
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
  /** Columns to aggregate over the filtered (or selected) set. */
  valueCols?: StatusBarAggSpec[];
  /** When set, aggregate/count only these row keys (selection). */
  selectedKeys?: string[];
}

export interface StatusBarAggValue {
  field: string;
  headerName: string;
  aggFunc: AggFunc;
  value: number;
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
  const totalRows = store.size;
  let filteredRows = 0;
  const filtered: Row[] = [];
  const parts = parseQuickFilter(request.quickFilterText);

  for (const [key, row] of store.iterateEntries()) {
    if (
      parts.length &&
      !rowPassesQuickFilter(store.getQuickFilterText(key), parts)
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

  const specs: AggSpec[] = (request.valueCols ?? [])
    .filter((v) => v.field)
    .map((v) => ({
      field: v.field,
      aggFunc: normalizeAgg(v.aggFunc),
    }));

  const aggRow = specs.length ? aggregateRows(scope, specs) : {};
  const aggregations: StatusBarAggValue[] = (request.valueCols ?? [])
    .filter((v) => v.field)
    .map((v) => {
      const aggFunc = normalizeAgg(v.aggFunc);
      return {
        field: v.field,
        headerName: v.headerName ?? v.field,
        aggFunc,
        value: Number(aggRow[v.field] ?? 0),
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
