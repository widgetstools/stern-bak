/**
 * buildColumnDefs — turn persisted `ColumnDefinition[]` (from a data
 * provider config) into AG-Grid `ColDef[]` for MarketsGrid.
 *
 * Three behaviours, in precedence order, per column:
 *
 *   1. `valueGetter` expression present → compile it once with the
 *      CSP-safe `@wellsfargo-starui/core` ExpressionEngine and install a
 *      `valueGetter` that calls the compiled closure per row. Column
 *      refs use bracket syntax with optional-chaining nested paths:
 *      `[cusip]`, `[pnl.wrapper.rdiInventoryName]` (a missing segment
 *      yields null, never throws). The getter NEVER throws — a parse
 *      failure falls back to the plain field binding, and a runtime
 *      failure falls back to the field's own value.
 *
 *   2. No expression but a dotted `field` → cached nested-path accessor
 *      (`getPathAccessor`). AG-Grid's native dot-walk can't tell a
 *      nested object (`row.a.b`) from a literal-dot key (`row['a.b']`);
 *      our helper tries the flat key first, then walks.
 *
 *   3. Flat field, no expression → native fast path (no valueGetter).
 *
 * Additionally, every column that doesn't declare its own `filter` defaults
 * to AG-Grid's Multi Filter — tab 1 is the filter for the column's
 * `cellDataType` (number / date / text), tab 2 is always the Set Filter.
 *
 * Compile + parse are memoised by expression string (bounded FIFO cache).
 * Per-row evaluation reuses one mutable `EvaluationContext` per getter
 * (safe — AG-Grid calls valueGetters synchronously on the main thread).
 */

import type { ColDef, ValueGetterParams } from 'ag-grid-community';
import { ExpressionEngine, type ExpressionNode } from '@wellsfargo-starui/core';

type CompiledFn = ReturnType<ExpressionEngine['compile']>;
import { getPathAccessor, getValueByPath } from '@wellsfargo-starui/types/shared';

/** Match ExpressionEngine parse-cache policy — grids have few distinct expressions. */
const COMPILE_CACHE_MAX = 1000;

const EMPTY_ROW: Record<string, unknown> = Object.freeze({});

const engine = new ExpressionEngine();

type CompiledEntry =
  | { fn: CompiledFn; usesCellValue: boolean; runtimeWarned?: boolean }
  | { error: string };

const compileCache = new Map<string, CompiledEntry>();

function evictOldest<V>(map: Map<string, V>): void {
  if (map.size >= COMPILE_CACHE_MAX) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
}

function logRuntimeFailureOnce(expression: string, err: unknown): void {
  const entry = compileCache.get(expression);
  if (!entry || !('fn' in entry) || entry.runtimeWarned) return;
  entry.runtimeWarned = true;
  console.warn(
    '[markets-grid] column valueGetter expression failed at runtime — falling back to field value:',
    expression,
    err,
  );
}

function expressionUsesCellValue(node: ExpressionNode): boolean {
  switch (node.type) {
    case 'variable':
      return node.name === 'value' || node.name === 'x';
    case 'literal':
    case 'columnRef':
      return false;
    case 'member':
      return expressionUsesCellValue(node.object);
    case 'unary':
      return expressionUsesCellValue(node.operand);
    case 'binary':
      return expressionUsesCellValue(node.left) || expressionUsesCellValue(node.right);
    case 'ternary':
      return (
        expressionUsesCellValue(node.condition) ||
        expressionUsesCellValue(node.consequent) ||
        expressionUsesCellValue(node.alternate)
      );
    case 'call':
      return node.args.some(expressionUsesCellValue);
    case 'array':
      return node.elements.some(expressionUsesCellValue);
    default:
      return false;
  }
}

function compileExpression(expression: string): CompiledEntry {
  const cached = compileCache.get(expression);
  if (cached) return cached;

  let entry: CompiledEntry;
  try {
    const node = engine.parse(expression);
    entry = {
      fn: engine.compile(expression),
      usesCellValue: expressionUsesCellValue(node),
    };
  } catch (err) {
    entry = { error: err instanceof Error ? err.message : String(err) };
    console.warn('[markets-grid] invalid column valueGetter expression:', expression, err);
  }

  evictOldest(compileCache);
  compileCache.set(expression, entry);
  return entry;
}

/** Field value used as the runtime fallback + the `value`/`x` context. */
function fieldValue(data: Record<string, unknown>, field: string | undefined): unknown {
  return field ? getValueByPath(data, field) ?? null : null;
}

function makeExpressionGetter(
  expression: string,
  compiledFn: CompiledFn,
  usesCellValue: boolean,
  field: string | undefined,
) {
  const ctx = {
    x: null as unknown,
    value: null as unknown,
    data: EMPTY_ROW,
    columns: EMPTY_ROW,
  };

  return (params: ValueGetterParams): unknown => {
    const raw = params.data;
    const data =
      raw != null && typeof raw === 'object' ? (raw as Record<string, unknown>) : EMPTY_ROW;

    ctx.data = data;
    ctx.columns = data;

    if (usesCellValue) {
      const cell = fieldValue(data, field);
      ctx.value = cell;
      ctx.x = cell;
    }

    try {
      return compiledFn(ctx);
    } catch (err) {
      logRuntimeFailureOnce(expression, err);
      return fieldValue(data, field);
    }
  };
}

/**
 * AG-Grid filter component appropriate for a column's `cellDataType` — used
 * as the FIRST tab of the Multi Filter (the Set Filter is always the second
 * tab; see {@link withMultiColumnFilter}). Number → Number Filter, date /
 * dateString → Date Filter; everything else (text, object, boolean, or an
 * un-set / inferred type) falls back to the Text Filter.
 */
function dataTypeFilter(cellDataType: string | undefined): string {
  switch (cellDataType) {
    case 'number':
      return 'agNumberColumnFilter';
    case 'date':
    case 'dateString':
      return 'agDateColumnFilter';
    default:
      return 'agTextColumnFilter';
  }
}

/**
 * Default a column to AG-Grid's Multi Filter (`agMultiColumnFilter`):
 *   • tab 1 — the filter appropriate for the column's `cellDataType`
 *             (number / date / text)
 *   • tab 2 — always the Set Filter (`agSetColumnFilter`)
 *
 * A column that already declares its own `filter` is left untouched, so a
 * per-column choice (the FilterEditor customizer, or a host-authored colDef)
 * wins. The Multi Filter's floating filter (`agMultiColumnFloatingFilter`) is
 * picked by AG-Grid automatically, so the `floatingFilter: true` default on
 * the grid's defaultColDef keeps rendering the floating row.
 */
function withMultiColumnFilter<TData>(def: ColDef<TData>): ColDef<TData> {
  if (def.filter !== undefined) return def;
  const cellDataType = typeof def.cellDataType === 'string' ? def.cellDataType : undefined;
  return {
    ...def,
    filter: 'agMultiColumnFilter',
    filterParams: {
      filters: [
        { filter: dataTypeFilter(cellDataType) },
        { filter: 'agSetColumnFilter' },
      ],
    },
  };
}

/**
 * Resolve the `valueGetter` for one persisted column definition.
 * `def` is the loosely-typed config object (a `ColumnDefinition` widened
 * to `ColDef` by the caller); it may carry a string `valueGetter` which
 * we always replace with a function or strip.
 */
function resolveColDef<TData>(def: ColDef<TData>): ColDef<TData> {
  const field = typeof def.field === 'string' ? def.field : undefined;
  const expr = typeof def.valueGetter === 'string' ? def.valueGetter.trim() : '';

  if (expr) {
    const compiled = compileExpression(expr);
    if ('fn' in compiled) {
      return {
        ...def,
        colId: def.colId ?? field,
        valueGetter: makeExpressionGetter(
          expr,
          compiled.fn,
          compiled.usesCellValue,
          field,
        ),
      };
    }
  }

  // Any path with grammar (`a.b`, `legs[0].rate`, `["a.b"]`) goes through
  // the shared accessor: literal flat key first, then the parsed walk.
  if (field && (field.includes('.') || field.includes('['))) {
    const accessor = getPathAccessor(field);
    return {
      ...def,
      colId: def.colId ?? field,
      valueGetter: (params) => accessor(params.data),
    };
  }

  return expr ? { ...def, valueGetter: undefined } : def;
}

/**
 * Convert one persisted column definition into an AG-Grid ColDef: resolve its
 * `valueGetter`, then apply the default Multi Filter ({@link withMultiColumnFilter}).
 */
function toColDef<TData>(def: ColDef<TData>): ColDef<TData> {
  return withMultiColumnFilter(resolveColDef(def));
}

/**
 * Build the AG-Grid column defs for a provider's `columnDefinitions`.
 * Returns `null` when there are none (MarketsGrid treats null as
 * "no provider columns yet").
 */
export function buildColumnDefs<TData>(
  columnDefinitions: ColDef<TData>[] | null | undefined,
): ColDef<TData>[] | null {
  if (!columnDefinitions || columnDefinitions.length === 0) return null;
  return columnDefinitions.map((def) => toColDef<TData>(def));
}

/** Test-only: clear expression compile + runtime-warning state between suites. */
export function __resetColumnDefExpressionCache(): void {
  compileCache.clear();
}

/** Test-only: read compile-cache size for bounded-growth regression guards. */
export function __getCompileCacheSizeForTests(): number {
  return compileCache.size;
}
