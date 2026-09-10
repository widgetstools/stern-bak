import type { ColDef, ColGroupDef } from 'ag-grid-community';

const EXPR_BRANDS = ['staruiVirtual', 'staruiExpression', 'staruiSsrmClientExpr'] as const;

const SSRM_EXPR_TOOLTIP =
  'Calculated in the grid — sort, filter, and group need a source column.';

type AnyCol = ColDef | ColGroupDef;

function isGroup(def: AnyCol): def is ColGroupDef {
  return Array.isArray((def as ColGroupDef).children);
}

function isClientExpression(def: ColDef): boolean {
  const ctx = def.context as Record<string, unknown> | undefined;
  if (!ctx) return false;
  return EXPR_BRANDS.some((key) => ctx[key] === true);
}

function lockOne(def: ColDef): ColDef {
  if (!isClientExpression(def)) return def;
  return {
    ...def,
    sortable: false,
    filter: false,
    floatingFilter: false,
    enableRowGroup: false,
    enableValue: false,
    enablePivot: false,
    headerTooltip: def.headerTooltip ?? SSRM_EXPR_TOOLTIP,
  };
}

/** WASM has no computed columns — sorting / filtering / grouping them is silent-wrong. */
export function lockSsrmExpressionColumns<T>(columnDefs: readonly T[]): T[] {
  return columnDefs.map((raw) => {
    const def = raw as AnyCol;
    if (isGroup(def)) {
      return {
        ...def,
        children: lockSsrmExpressionColumns(def.children ?? []),
      } as T;
    }
    return lockOne(def) as T;
  });
}
