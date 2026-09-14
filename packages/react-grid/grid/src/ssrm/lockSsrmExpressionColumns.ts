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

function lockOne(def: ColDef, engineBacked?: ReadonlySet<string>): ColDef {
  if (!isClientExpression(def)) return def;
  // Compiled under the engine expression contract: the engine computes this
  // column per row (plan §12 T3), so sort / filter / group / aggregate work
  // dataset-wide — nothing to lock.
  const colId = def.colId ?? def.field;
  if (colId && engineBacked?.has(colId)) return def;
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

/**
 * Lock expression columns the engine cannot compute — sorting / filtering /
 * grouping them engine-side would be silent-wrong. Columns in `engineBacked`
 * (tier-`compiled`, riding the request as computed columns) stay fully live.
 */
export function lockSsrmExpressionColumns<T>(
  columnDefs: readonly T[],
  engineBacked?: ReadonlySet<string>,
): T[] {
  return columnDefs.map((raw) => {
    const def = raw as AnyCol;
    if (isGroup(def)) {
      return {
        ...def,
        children: lockSsrmExpressionColumns(def.children ?? [], engineBacked),
      } as T;
    }
    return lockOne(def, engineBacked) as T;
  });
}
