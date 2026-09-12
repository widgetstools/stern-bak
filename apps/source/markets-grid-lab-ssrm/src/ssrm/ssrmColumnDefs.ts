/**
 * Make the lab's ColDefs honest under SSRM.
 *
 * Columns computed by a client `valueGetter` with no backing field (the KRD
 * sparkline, bid/ask width) have no engine column: sorting or filtering them
 * would silently order/filter by nothing. Branding them with
 * `staruiSsrmClientExpr` hands them to the grid's existing
 * `lockSsrmExpressionColumns` honesty lock — sort/filter/group off plus the
 * explanatory tooltip — instead of duplicating those flags here.
 *
 * Everything else passes through untouched, so what renders is exactly what
 * the CSRM lab renders.
 */
import type { ColDef } from 'ag-grid-community';

type AnyCol = ColDef & { children?: AnyCol[] };

function brandSyntheticColumn(def: AnyCol): AnyCol {
  if (def.children?.length) {
    return { ...def, children: def.children.map(brandSyntheticColumn) };
  }
  if (!def.valueGetter || def.field) return def;
  return {
    ...def,
    context: { ...(def.context as Record<string, unknown> | undefined), staruiSsrmClientExpr: true },
  };
}

export function withSsrmSafeColumns<T extends ColDef>(columnDefs: T[]): T[] {
  return columnDefs.map((def) => brandSyntheticColumn(def as AnyCol)) as T[];
}
