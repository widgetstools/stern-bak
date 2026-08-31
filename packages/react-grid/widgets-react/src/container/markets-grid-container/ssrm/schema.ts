import type { ColDef, ColGroupDef } from 'ag-grid-community';
import type { ColumnType } from '@perspective-dev/client';

/**
 * Perspective's `index` column: the primary key it uses for partial updates
 * and removes. Synthesised from the provider's `keyColumn` (single or
 * composite) with the SAME `composeRowId` the client-side row model's
 * `getRowId` uses, so a leaf row's SSRM identity is byte-for-byte the id the
 * rest of the platform knows it by.
 */
export const INDEX_COLUMN = '__pspIndex';

export type PerspectiveSchema = Record<string, ColumnType>;

function isGroup(def: ColDef | ColGroupDef): def is ColGroupDef {
  return 'children' in def;
}

/*
 * Perspective columns are typed and its schema is immutable once the table
 * exists, so the type has to be decided up front rather than inferred from the
 * first snapshot. Inference would also get two things wrong that matter here:
 *
 *   - whole numbers infer as `integer`, a signed 32 bit type that silently
 *     wraps on values like notional amounts, which reach the billions;
 *   - `integer` columns compare as `false` against every operand inside a
 *     Perspective *expression* (native filters are unaffected), which would
 *     quietly drop rows from any OR-combined numeric filter.
 *
 * Both disappear if every number is a `float`, which is also what AG Grid's
 * number filters assume. The column definitions already say enough to type the
 * rest: `buildColumnDefs` carries the provider's `cellDataType` through and
 * derives the filter from it (Multi Filter with the data-type filter in tab 1),
 * so both are consulted.
 */
export function typeForColDef(colDef: ColDef): ColumnType {
  const cellDataType = typeof colDef.cellDataType === 'string' ? colDef.cellDataType : undefined;
  if (cellDataType === 'number') return 'float';
  if (cellDataType === 'date' || cellDataType === 'dateString') return 'datetime';
  if (cellDataType === 'boolean') return 'boolean';
  if (cellDataType === 'text') return 'string';
  if (colDef.filter === 'agNumberColumnFilter') return 'float';
  if (colDef.filter === 'agDateColumnFilter') return 'datetime';
  // Our default filter is the Multi Filter with the data-type filter first.
  const params = colDef.filterParams as
    | { filters?: { filter?: string }[]; values?: unknown[] }
    | undefined;
  const multiFirst = params?.filters?.[0]?.filter;
  if (multiFirst === 'agNumberColumnFilter') return 'float';
  if (multiFirst === 'agDateColumnFilter') return 'datetime';
  // Set filters carry their value list, which tells us the underlying type.
  const values = params?.values;
  if (Array.isArray(values) && values.length > 0) {
    if (values.every((value) => typeof value === 'boolean')) return 'boolean';
    if (values.every((value) => typeof value === 'number')) return 'float';
  }
  return 'string';
}

/** Walks the column definition tree and derives the Perspective table schema from it. */
export function buildSchemaFromColDefs(colDefs: readonly (ColDef | ColGroupDef)[]): PerspectiveSchema {
  const schema: PerspectiveSchema = {};
  const visit = (defs: readonly (ColDef | ColGroupDef)[]) => {
    for (const def of defs) {
      if (isGroup(def)) {
        visit(def.children);
        continue;
      }
      const field = def.field ?? def.colId;
      if (field) schema[field] = typeForColDef(def);
    }
  };
  visit(colDefs);
  schema[INDEX_COLUMN] = 'string';
  return schema;
}

/*
 * The feed publishes nested objects (`rating.moody` arrives as
 * `{ rating: { moody } }`) but Perspective's schema is flat, so rows are
 * flattened onto the dotted paths AG Grid already uses as column ids. The
 * platform's column getters (`getPathAccessor` in `buildColumnDefs`) try the
 * flat key first, so the same string is the field, the Perspective column, and
 * the key in every row object — nothing has to be un-flattened on the way out.
 */
function flattenInto(
  source: Record<string, unknown>,
  prefix: string,
  columns: ReadonlySet<string>,
  out: Record<string, unknown>,
): void {
  for (const key in source) {
    const value = source[key];
    const path = prefix + key;
    if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
      if (Array.isArray(value)) {
        // Perspective has no list type; keep something renderable rather than throwing.
        if (columns.has(path)) out[path] = value.join(', ');
      } else {
        flattenInto(value as Record<string, unknown>, `${path}.`, columns, out);
      }
      continue;
    }
    // Columns the grid does not define are dropped: Perspective rejects an
    // update naming a column its schema does not have.
    if (columns.has(path)) out[path] = value;
  }
}

export function flattenRow(
  row: Record<string, unknown>,
  columns: ReadonlySet<string>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  flattenInto(row, '', columns, out);
  return out;
}

/**
 * The same flattening, but emitted one array per column.
 *
 * Perspective accepts either orientation, and the difference is not small: a
 * row-oriented update against an *indexed* table degrades badly as the row
 * count grows (the engine walks a row-oriented batch key by key per row and
 * re-resolves the index each time; given columns it fills each one in a single
 * pass — measured in the reference at 152s vs ~0.5s for a 20k-row snapshot).
 *
 * This is only safe for whole rows — a column array has to carry a value for
 * every row in the batch, so a partial row would write nulls over fields it
 * never mentioned. Snapshots are whole rows by definition; sparse deltas must
 * go through `flattenRow` row-oriented instead.
 */
export function flattenRowsColumnar(
  rows: readonly Record<string, unknown>[],
  columns: ReadonlySet<string>,
): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  const length = rows.length;
  // Values are written straight into the column arrays. Going via a flat row
  // object first would build one dictionary-mode object per row, which for a
  // whole snapshot costs more than the flattening itself.
  const columnFor = (path: string): unknown[] => {
    let column = out[path];
    if (column === undefined) {
      // Rows before this one had no value for the column, so it starts null.
      column = new Array<unknown>(length).fill(null);
      out[path] = column;
    }
    return column;
  };
  const write = (source: Record<string, unknown>, prefix: string, index: number): void => {
    for (const key in source) {
      const value = source[key];
      const path = prefix + key;
      if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
        if (Array.isArray(value)) {
          if (columns.has(path)) columnFor(path)[index] = value.join(', ');
        } else {
          write(value as Record<string, unknown>, `${path}.`, index);
        }
        continue;
      }
      if (columns.has(path)) columnFor(path)[index] = value;
    }
  };
  for (let i = 0; i < length; i++) write(rows[i], '', i);
  return out;
}
