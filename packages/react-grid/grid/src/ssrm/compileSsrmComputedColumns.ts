/**
 * Compile calculated columns into engine computed columns (plan §12 T3).
 *
 * A `staruiVirtual` colDef carries its DSL source (`context.staruiExprSource`,
 * stamped by core's `buildVirtualColDef`). Every source that classifies
 * tier-`compiled` under the engine expression contract becomes one
 * `SsrmComputedColumnSpec` riding each getRows request — the WASM engine
 * evaluates it per row, so sort / filter / row-group / aggregation work
 * dataset-wide. Everything else keeps the brand-based lock
 * (`lockSsrmExpressionColumns`): computed in the grid per loaded row.
 */
import type { ColDef, ColGroupDef } from 'ag-grid-community';
import { classifySsrmExpression, ExpressionEngine, toComputedColumnSpec } from '@wellsfargo-starui/core';
import type { SsrmComputedColumnSpec } from '@wellsfargo-starui/data/runtime';

type AnyCol = ColDef | ColGroupDef;

// Parse-only engine, lazy singleton — the same shape the calculated-columns
// panel uses for its tier readout.
let _engine: ExpressionEngine | null = null;
function parseSource(source: string): unknown {
  return (_engine ??= new ExpressionEngine()).parse(source);
}

export interface SsrmComputedCompilation {
  /** Wire specs for every tier-`compiled` calculated column, in colDef order. */
  computed: readonly SsrmComputedColumnSpec[];
  /** ColIds the engine backs — `lockSsrmExpressionColumns` leaves these live. */
  engineBacked: ReadonlySet<string>;
}

const EMPTY: SsrmComputedCompilation = { computed: [], engineBacked: new Set() };

function isGroup(def: AnyCol): def is ColGroupDef {
  return Array.isArray((def as ColGroupDef).children);
}

function visit(
  defs: readonly AnyCol[],
  computed: SsrmComputedColumnSpec[],
  engineBacked: Set<string>,
): void {
  for (const def of defs) {
    if (isGroup(def)) {
      visit(def.children ?? [], computed, engineBacked);
      continue;
    }
    const leaf = def as ColDef;
    const ctx = leaf.context as Record<string, unknown> | undefined;
    if (ctx?.staruiVirtual !== true || typeof ctx.staruiExprSource !== 'string') continue;
    const colId = leaf.colId ?? leaf.field;
    if (!colId) continue;
    try {
      const ast = parseSource(ctx.staruiExprSource);
      if (classifySsrmExpression(ast).tier !== 'compiled') continue;
      const spec = toComputedColumnSpec(colId, ast);
      if (spec) {
        computed.push(spec);
        engineBacked.add(colId);
      }
    } catch {
      // A source that does not parse already renders null per row client-side;
      // it simply stays a locked grid column.
    }
  }
}

export function compileSsrmComputedColumns(
  columnDefs: readonly unknown[],
): SsrmComputedCompilation {
  const computed: SsrmComputedColumnSpec[] = [];
  const engineBacked = new Set<string>();
  visit(columnDefs as readonly AnyCol[], computed, engineBacked);
  return computed.length === 0 ? EMPTY : { computed, engineBacked };
}
