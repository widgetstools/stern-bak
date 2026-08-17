/**
 * Turning a set of rows into one aggregated row — the value-column fold and
 * its pivoted form.
 *
 * Split out of `QueryEngine` because none of it touches engine state: every
 * function here reads only the rows it is handed and the request's column
 * declarations. That is also why the engine can call them from the group path,
 * the leaf path, the tree path and the grand-total path without four different
 * shapes.
 */
import { getPathAccessor } from "@wellsfargo-starui/types";
import { aggregateRows, resolveAggFunc, type AggSpec } from "./aggregations.js";
import type { Row, SsrmGetRowsRequest } from "./types.js";

type ValueCols = NonNullable<SsrmGetRowsRequest["valueCols"]>;
type PivotCols = NonNullable<SsrmGetRowsRequest["pivotCols"]>;

/**
 * Fold the request's value columns over `rows`. Returns `{}` when the request
 * declares none, which is what keeps a plain leaf block free of aggregation
 * cost entirely.
 */
export function aggregateValueCols(rows: Row[], valueCols: ValueCols | undefined): Row {
  const specs: AggSpec[] = (valueCols ?? [])
    .filter((v) => v.field)
    .map((v) => ({ field: v.field, aggFunc: resolveAggFunc(v.aggFunc) }));
  if (specs.length === 0) return {};
  return aggregateRows(rows, specs);
}

/** The composite key a row contributes to, e.g. `EMEA_2026` for two pivot cols. */
function pivotKey(
  row: Row,
  readers: Array<(row: unknown) => unknown>,
  sep: string,
): string {
  return readers.map((read) => String(read(row) ?? "")).join(sep);
}

/**
 * Every secondary field a pivoted query will produce, in the order AG Grid
 * should show them: pivot keys sorted, each crossed with the value columns.
 */
export function collectPivotResultFields(
  rows: Row[],
  pivotCols: PivotCols,
  valueCols: ValueCols | undefined,
  sep: string,
): string[] {
  if (!pivotCols.length || !(valueCols?.length ?? 0)) return [];
  const readers = pivotCols.map((c) => getPathAccessor(c.field));
  const keys = new Set<string>();
  for (const row of rows) keys.add(pivotKey(row, readers, sep));
  const fields: string[] = [];
  for (const pk of [...keys].sort((a, b) => a.localeCompare(b))) {
    for (const vc of valueCols ?? []) {
      if (!vc.field) continue;
      fields.push(`${pk}${sep}${vc.field}`);
    }
  }
  return fields;
}

/** Aggregate rows into pivoted secondary fields (`{pivotKey}_{field}`). */
export function pivotAggregate(
  rows: Row[],
  pivotCols: PivotCols,
  valueCols: ValueCols | undefined,
  sep: string,
): Row {
  if (!pivotCols.length) return aggregateValueCols(rows, valueCols);
  const readers = pivotCols.map((c) => getPathAccessor(c.field));
  const buckets = new Map<string, Row[]>();
  for (const row of rows) {
    const key = pivotKey(row, readers, sep);
    let list = buckets.get(key);
    if (!list) {
      list = [];
      buckets.set(key, list);
    }
    list.push(row);
  }
  const out: Row = {};
  for (const [pk, bucket] of buckets) {
    for (const [field, value] of Object.entries(aggregateValueCols(bucket, valueCols))) {
      out[`${pk}${sep}${field}`] = value;
    }
  }
  return out;
}
