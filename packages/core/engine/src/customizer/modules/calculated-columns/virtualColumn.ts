/**
 * Translate a `VirtualColumnDef` → AG-Grid `ColDef`.
 *
 * The expression is parsed ONCE and the resulting AST is closed over by
 * the returned `valueGetter` — per-cell work is a pure AST walk. Parse
 * errors silently produce a null AST (every row becomes null); runtime
 * errors per row are similarly swallowed, so one broken expression never
 * crashes the grid.
 *
 * Column-wide aggregates (`SUM([price])`, `AVG([yield])`) need the full
 * row snapshot. Each GridApi gets ONE cached snapshot via
 * `ResourceScope.cache`, FILLED BY THE MODULE'S `activate()` through
 * `platform.data.scan` — this file no longer walks the row model itself.
 * That matters because `forEachNode` answers for the client-side row model
 * and returns a ~2,000-row block cache under the server-side one, which is
 * how `SUM([price])` ends up revising itself as the user scrolls.
 *
 * The other half of that fix is `readComputedField`: a source that has
 * already evaluated the expression over the WHOLE dataset stamps the fields
 * it computed onto each row, and this `valueGetter` returns those verbatim
 * rather than evaluating a second time. Where nothing stamps — every
 * client-side grid — the expression is evaluated here exactly as before.
 */
import type {
  CellClassParams,
  ColDef,
  GridApi,
  ValueFormatterParams,
  ValueGetterParams,
} from 'ag-grid-community';
// Relative imports on purpose: importing the engine by its own package
// name creates a barrel self-cycle (and, from a tarball, resolves to a
// SECOND copy of the barrel via the package self-reference).
import type { ExpressionEngineLike } from '../../../platform/types';
import { NOT_COMPUTED, readComputedField } from '../../../platform/computedFields';
import {
  excelFormatColorResolver,
  valueFormatterFromTemplate,
} from '../../../colDef';
import type { VirtualColumnDef } from './state';

/** Shape stored in ResourceScope.cache<GridApi, AllRowsEntry>. */
export interface AllRowsEntry {
  rows: Record<string, unknown>[];
  /**
   * Memoized per-column value arrays for aggregate expansion
   * (`SUM([price])`). Lives and dies with `rows` — cleared on every
   * snapshot rebuild/invalidation so it can never serve stale values.
   * Without it, every rendered cell of an aggregate column re-mapped
   * the full row set per refresh.
   */
  columnArrays: Map<string, unknown[]>;
  /**
   * Memoized RESULTS of whole-column folds, where {@link columnArrays}
   * memoizes their input. Same lifecycle; see
   * `EvaluationContext.allRowsAggregateCache` for why both are needed.
   */
  aggregates: Map<string, unknown>;
}

/**
 * The rows a column-wide aggregate folds over. A pure READ — the walk that
 * fills it belongs to the module's `activate()`, which does it through
 * `platform.data.scan` so the port decides what "every row" means. Empty
 * until the first fill (and where the port declines to page an unloaded
 * dataset, which is the case a stamping source answers instead).
 */
export function getAllRowsSnapshot(
  api: GridApi | null | undefined,
  cache: WeakMap<GridApi, AllRowsEntry>,
): Record<string, unknown>[] {
  if (!api) return [];
  return cache.get(api)?.rows ?? [];
}

/**
 * Install a freshly-walked row set and drop the per-column memo built from
 * the previous one.
 *
 * The swap is atomic on purpose: the old snapshot stays readable right up to
 * the moment the new one is complete, so an aggregate never renders against a
 * half-filled set. (Clearing first and refilling would blink every aggregate
 * cell to 0 on every data event.)
 */
export function fillAllRowsSnapshot(
  api: GridApi | null | undefined,
  cache: WeakMap<GridApi, AllRowsEntry>,
  rows: Record<string, unknown>[],
): void {
  if (!api) return;
  const entry = cache.get(api);
  if (!entry) {
    cache.set(api, { rows, columnArrays: new Map(), aggregates: new Map() });
    return;
  }
  entry.rows = rows;
  entry.columnArrays.clear();
  entry.aggregates.clear();
}

/** Column-array memo tied to the CURRENT snapshot generation. */
export function getAllRowsColumnCache(
  api: GridApi | null | undefined,
  cache: WeakMap<GridApi, AllRowsEntry>,
): Map<string, unknown[]> | undefined {
  if (!api) return undefined;
  return cache.get(api)?.columnArrays;
}

/** Folded-aggregate memo tied to the CURRENT snapshot generation. */
export function getAllRowsAggregateCache(
  api: GridApi | null | undefined,
  cache: WeakMap<GridApi, AllRowsEntry>,
): Map<string, unknown> | undefined {
  if (!api) return undefined;
  return cache.get(api)?.aggregates;
}

export function invalidateAllRowsCache(
  api: GridApi | null | undefined,
  cache: WeakMap<GridApi, AllRowsEntry>,
): void {
  if (!api) return;
  const entry = cache.get(api);
  if (entry) {
    entry.rows = [];
    entry.columnArrays.clear();
    entry.aggregates.clear();
  }
}

export function buildVirtualColDef(
  v: VirtualColumnDef,
  engine: ExpressionEngineLike,
  cache: WeakMap<GridApi, AllRowsEntry>,
): ColDef {
  let ast: unknown;
  try { ast = engine.parse(v.expression); }
  catch { ast = null; }

  const formatFn = v.valueFormatterTemplate
    ? valueFormatterFromTemplate(v.valueFormatterTemplate)
    : null;

  // Excel color tags — `[Red]`, `[Green]` — parsed by SSF but only affect
  // the returned text's semantics. Mirror column-customization: emit a
  // `cellStyle` fn that paints the per-value color when the format
  // carries a color tag.
  const colorResolver = v.valueFormatterTemplate?.kind === 'excelFormat'
    ? excelFormatColorResolver(v.valueFormatterTemplate.format)
    : undefined;

  return {
    colId: v.colId,
    headerName: v.headerName,
    initialWidth: v.initialWidth,
    initialHide: v.initialHide,
    initialPinned: v.initialPinned,
    editable: false,
    sortable: true,
    filter: true,
    valueGetter: (params: ValueGetterParams) => {
      // Group rows store the agg result on `node.aggData[colId]`. Return
      // that here so the group row shows the aggregate instead of an
      // empty cell. Calculated columns only read `params.data`, which is
      // undefined on group nodes — without this branch every group row
      // would render blank for every virtual column.
      if (!params.data) {
        const group = params.node?.group === true;
        const colId = v.colId;
        const agg = (params.node as { aggData?: Record<string, unknown> } | null | undefined)
          ?.aggData?.[colId];
        if (group && agg !== undefined) return agg;
        return null;
      }
      // The source may already have evaluated this expression — over the
      // WHOLE dataset, not the rows this window holds. Where it has, that
      // answer is the authoritative one and re-deriving it here is exactly
      // the bug: a block-cache `SUM([price])` that changes as you scroll.
      const computed = readComputedField(params.data, v.colId);
      if (computed !== NOT_COMPUTED) return computed;
      if (!ast) return null;
      try {
        return engine.evaluate(ast, {
          x: null,
          value: null,
          data: params.data,
          columns: params.data,
          // Lazy column-wide snapshot — only the first aggregate expression
          // inside a row touches this. Expressions that don't use the
          // aggregateColumnRefs functions never pay the cache cost.
          get allRows() {
            return getAllRowsSnapshot(params.api as GridApi, cache);
          },
          // Same-generation column-array memo: the FIRST aggregate cell
          // maps the snapshot once; every other rendered cell of the
          // column reuses the array until the next invalidation.
          get allRowsColumnCache() {
            return getAllRowsColumnCache(params.api as GridApi, cache);
          },
          // …and the fold's RESULT, so the second cell of an aggregate
          // column does not re-reduce the array the first one just built.
          get allRowsAggregateCache() {
            return getAllRowsAggregateCache(params.api as GridApi, cache);
          },
        });
      } catch {
        return null;
      }
    },
    valueFormatter: formatFn
      ? (params: ValueFormatterParams) => formatFn({ value: params.value, data: params.data })
      : undefined,
    // See the twin comment in column-customization/transforms.ts: when
    // switching from a `[Red]`-colored format to a plain one, the
    // cellStyle fn must return `{ color: '' }` (NOT `null`) so AG-Grid
    // clears the inline `color` property a previous formatter painted.
    // For virtual columns we always emit a fn when there IS a formatter
    // — without one (`undefined`) AG-Grid could retain the prior
    // formatter's inline color on rendered cells.
    cellStyle: colorResolver
      ? (params: CellClassParams) => {
          const color = colorResolver(params.value);
          return color ? { color } : { color: '' };
        }
      : v.valueFormatterTemplate
        ? () => ({ color: '' })
        : undefined,
  };
}
