/**
 * Derive a Perspective table schema from observed provider rows.
 *
 * Perspective declares ONE type per column up front and then silently COERCES
 * anything that disagrees — a float arriving in an `integer` column is
 * truncated, not rejected, and `table.update()` reports nothing. This is the
 * only place in the pull-path migration where a mistake corrupts data instead
 * of throwing, so the rules below are deliberately conservative.
 *
 * **Numeric columns are `float`, always, unless the caller explicitly opts a
 * column into `integer`.** Two facts force this:
 *
 *   - Sampling cannot tell them apart. A column that is integral in every
 *     sampled row can still be fractional in a row the sampler never saw —
 *     type it `integer` on that basis and every fractional value is
 *     truncated, permanently, in every window, with no error anywhere.
 *   - Even a complete scan cannot prove it. A column integral across the whole
 *     snapshot can still be repriced with a fraction by the next live delta.
 *
 * And the asymmetry settles it: an IEEE double represents every integer up to
 * 2^53 exactly, so typing an integer column `float` loses nothing at realistic
 * magnitudes, while typing a float column `integer` loses the fraction of
 * every row. Float is lossless in both directions; integer is lossy in one.
 * `integral` is still reported so a caller who wants integer semantics for an
 * id or a count can ask for it deliberately.
 */

/** The Perspective column types this maps onto. */
export type PerspectiveColumnType =
  | 'string'
  | 'integer'
  | 'float'
  | 'boolean'
  | 'date'
  | 'datetime';

export type PerspectiveSchema = Record<string, PerspectiveColumnType>;

export interface ColumnObservation {
  /** Rows in which the column was present at all. */
  seen: number;
  nulls: number;
  integers: number;
  floats: number;
  booleans: number;
  /** Strings that are not ISO date-like. */
  strings: number;
  isoDates: number;
  isoDateTimes: number;
  /** Objects and arrays — Perspective is flat, so these cannot be columns. */
  nested: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

function blank(): ColumnObservation {
  return {
    seen: 0,
    nulls: 0,
    integers: 0,
    floats: 0,
    booleans: 0,
    strings: 0,
    isoDates: 0,
    isoDateTimes: 0,
    nested: 0,
  };
}

/**
 * Accumulate type evidence from a batch of rows.
 *
 * Call it repeatedly with the same map to fold in later batches — snapshot
 * chunks first, then live deltas, which is exactly how the provider emits
 * them. Sparse deltas carry only the columns that moved, so `seen` is per
 * column rather than per row.
 */
export function observeRows(
  rows: readonly unknown[],
  into: Map<string, ColumnObservation> = new Map(),
): Map<string, ColumnObservation> {
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue;
    for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
      let o = into.get(key);
      if (!o) {
        o = blank();
        into.set(key, o);
      }
      o.seen += 1;

      if (value === null || value === undefined) {
        o.nulls += 1;
      } else if (typeof value === 'boolean') {
        o.booleans += 1;
      } else if (typeof value === 'number') {
        if (Number.isInteger(value)) o.integers += 1;
        else o.floats += 1;
      } else if (typeof value === 'string') {
        if (ISO_DATETIME.test(value)) o.isoDateTimes += 1;
        else if (ISO_DATE.test(value)) o.isoDates += 1;
        else o.strings += 1;
      } else {
        o.nested += 1;
      }
    }
  }
  return into;
}

export interface SchemaOptions {
  /**
   * Columns to declare `integer` rather than the default `float`. Opt-in only
   * — see this module's header for why inference must not choose it.
   */
  integerColumns?: readonly string[];
  /** Map ISO date-like strings onto `date` / `datetime`. Default true. */
  inferDates?: boolean;
  /**
   * Treat a dotted declared path as a literal flat column name rather than as
   * a nested value to drop. Default false.
   *
   * Which one a dot means depends entirely on how the provider shapes its
   * rows, and the two shapes are indistinguishable from the declaration
   * alone. `projectFields` PRESERVES subtrees, so `rating.moody` is nested
   * there and cannot be a Perspective column. The `rowShape: 'flat'` flatten
   * LIFTS the same path onto the literal key `"rating.moody"`, so dropping it
   * would leave every nested-sourced column out of the schema — a Table with
   * a fraction of its columns, silently, because `update()` ignores columns
   * the schema does not declare.
   */
  flatDottedPaths?: boolean;
}

export interface DerivedSchema {
  schema: PerspectiveSchema;
  /** Dropped: Perspective is flat, so an object or array cannot be a column. */
  nested: string[];
  /** Typed `string` because the observed values disagreed about their kind. */
  mixed: { column: string; kinds: string[] }[];
  /** No non-null value ever observed; typed `string` as the only safe guess. */
  unknown: string[];
  /** Numeric columns integral in everything observed. Reported, NOT applied. */
  integral: string[];
}

export function toPerspectiveSchema(
  observations: Map<string, ColumnObservation>,
  options: SchemaOptions = {},
): DerivedSchema {
  const { integerColumns = [], inferDates = true } = options;
  const forceInteger = new Set(integerColumns);

  const schema: PerspectiveSchema = {};
  const nested: string[] = [];
  const mixed: { column: string; kinds: string[] }[] = [];
  const unknown: string[] = [];
  const integral: string[] = [];

  for (const [column, o] of observations) {
    const numeric = o.integers + o.floats;
    const dateish = o.isoDates + o.isoDateTimes;

    // Nested wins outright: a column that is EVER an object cannot be a flat
    // Perspective column, and including it would coerce every row to null.
    if (o.nested > 0) {
      nested.push(column);
      continue;
    }

    const kinds: string[] = [];
    if (numeric > 0) kinds.push('number');
    if (o.booleans > 0) kinds.push('boolean');
    if (o.strings > 0) kinds.push('string');
    if (dateish > 0) kinds.push('date');

    if (kinds.length === 0) {
      // Only ever null, or never present with a value.
      unknown.push(column);
      schema[column] = 'string';
      continue;
    }

    if (kinds.length > 1) {
      // Disagreeing kinds. `string` is the only type that keeps every value
      // readable — a string landing in a float column becomes null.
      mixed.push({ column, kinds });
      schema[column] = 'string';
      continue;
    }

    if (numeric > 0) {
      if (o.floats === 0) integral.push(column);
      schema[column] = forceInteger.has(column) ? 'integer' : 'float';
      continue;
    }
    if (o.booleans > 0) {
      schema[column] = 'boolean';
      continue;
    }
    if (dateish > 0 && inferDates) {
      // A datetime carries a date, so a column with both is `datetime`.
      schema[column] = o.isoDateTimes > 0 ? 'datetime' : 'date';
      continue;
    }
    schema[column] = 'string';
  }

  return { schema, nested, mixed, unknown, integral };
}

/** The shapes a provider config already describes its columns with. */
export interface DeclaredField {
  /** `FieldInfo.path` or `ColumnDefinition.field`. */
  path?: string;
  field?: string;
  /** `FieldInfo.type`. */
  type?: string;
  /** `ColumnDefinition.cellDataType`. */
  cellDataType?: string;
  children?: Record<string, unknown>;
}

/**
 * Build a schema from what the provider config ALREADY declares, without
 * waiting for a single row.
 *
 * This is what lets a blotter paint immediately. Deriving the schema from
 * observed rows means the Table cannot exist until the snapshot has arrived,
 * and until the Table exists there is nothing for a window to open, so the
 * grid sits blank behind a spinner. A provider row carries `inferredFields` /
 * `columnDefinitions` precisely so the columns are known up front; the Table
 * can be created empty and filled as rows arrive.
 *
 * Types follow the same rules as the observed path — every numeric column is
 * `float`, nested columns are dropped — for the same reasons. What the
 * declaration cannot tell us is whether a `date`-ish column is a date or a
 * datetime, so it maps to `datetime`, which holds both.
 */
export function toPerspectiveSchemaFromFields(
  fields: readonly DeclaredField[],
  options: SchemaOptions = {},
): DerivedSchema {
  const { integerColumns = [], inferDates = true, flatDottedPaths = false } = options;
  const forceInteger = new Set(integerColumns);

  const schema: PerspectiveSchema = {};
  const nested: string[] = [];
  const unknown: string[] = [];

  for (const field of fields) {
    const column = field.path ?? field.field;
    if (!column) continue;
    // A dotted path is a nested value that the provider left nested;
    // Perspective is flat, so only top-level columns become Table columns.
    // Unless the provider flattens onto literal dotted keys — see
    // `flatDottedPaths`.
    if (!flatDottedPaths && column.includes('.')) continue;

    const declared = (field.type ?? field.cellDataType ?? '').toLowerCase();

    if (declared === 'object' || declared === 'array' || field.children) {
      nested.push(column);
      continue;
    }
    if (declared === 'number') {
      schema[column] = forceInteger.has(column) ? 'integer' : 'float';
      continue;
    }
    if (declared === 'boolean') {
      schema[column] = 'boolean';
      continue;
    }
    if (declared === 'date' && inferDates) {
      // A declaration says "date-like" but not which; `datetime` holds both,
      // whereas `date` would truncate a timestamp.
      schema[column] = 'datetime';
      continue;
    }
    if (declared === 'datestring' || declared === 'text' || declared === 'string') {
      schema[column] = 'string';
      continue;
    }
    if (declared === '') {
      unknown.push(column);
      schema[column] = 'string';
      continue;
    }
    schema[column] = 'string';
  }

  return { schema, nested, mixed: [], unknown, integral: [] };
}

/**
 * Check a column is usable as the Table's `index`.
 *
 * The index is what makes `table.update()` an upsert, so a bad one is not a
 * cosmetic problem: a missing value silently drops the row's identity and a
 * duplicate makes two positions collapse into one.
 *
 * Returns null when usable, otherwise the reason.
 */
export function validateIndexColumn(
  schema: PerspectiveSchema,
  index: string,
  observations: Map<string, ColumnObservation>,
  rowsObserved?: number,
): string | null {
  const type = schema[index];
  if (!type) return `index column "${index}" is not in the schema`;
  if (type !== 'string' && type !== 'integer' && type !== 'float') {
    return `index column "${index}" is ${type}; Perspective indexes must be a scalar key`;
  }

  const o = observations.get(index);
  if (!o) return `index column "${index}" was never observed`;
  if (o.nulls > 0) return `index column "${index}" is null in ${o.nulls} observed row(s)`;
  if (rowsObserved !== undefined && o.seen < rowsObserved) {
    return `index column "${index}" is missing from ${rowsObserved - o.seen} observed row(s)`;
  }
  return null;
}
