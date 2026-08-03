/**
 * Turning an AG Grid cell edit into a value the Table will accept.
 *
 * Perspective columns are typed, and `table.update()` does not reject a value
 * of the wrong type — it COERCES it (the same property that makes sampling a
 * column's type unsafe). A cell editor with no `valueParser` hands back the
 * string the user typed, so writing it straight through would put `"1250"`
 * into a float column and hope. Worse, the book is shared: a bad write is
 * visible in every peer window, not just the one that made it.
 *
 * So an edit is coerced against the declared type first, and a value that
 * cannot be coerced is REFUSED rather than written. A refused edit reverts on
 * the next refresh, which is visible and recoverable; a silently mangled one
 * is neither.
 */

/** Perspective's declared column types, as `table.schema()` reports them. */
export type PerspectiveColumnType =
  | 'string'
  | 'integer'
  | 'float'
  | 'boolean'
  | 'date'
  | 'datetime';

export type CoercedValue =
  | { ok: true; value: unknown }
  | { ok: false; reason: string };

/**
 * Coerce one edited value to a column's declared type.
 *
 * An unknown type passes through untouched: guessing at a type this does not
 * model would be a worse answer than letting the engine apply its own rule.
 */
export function coerceEditedValue(
  type: string | undefined,
  value: unknown,
): CoercedValue {
  // Clearing a cell is a legal edit at every type.
  if (value === null || value === undefined || value === '') {
    return { ok: true, value: null };
  }

  switch (type) {
    case 'string':
      return { ok: true, value: typeof value === 'string' ? value : String(value) };

    case 'integer':
    case 'float': {
      const n = typeof value === 'number' ? value : Number(String(value).trim());
      if (!Number.isFinite(n)) {
        return { ok: false, reason: `"${String(value)}" is not a number` };
      }
      return { ok: true, value: type === 'integer' ? Math.trunc(n) : n };
    }

    case 'boolean': {
      if (typeof value === 'boolean') return { ok: true, value };
      const s = String(value).trim().toLowerCase();
      if (s === 'true') return { ok: true, value: true };
      if (s === 'false') return { ok: true, value: false };
      return { ok: false, reason: `"${String(value)}" is not a boolean` };
    }

    case 'date':
    case 'datetime': {
      if (value instanceof Date) {
        return Number.isNaN(value.getTime())
          ? { ok: false, reason: 'invalid Date' }
          : { ok: true, value };
      }
      // A number is already epoch milliseconds — the shape the engine stores.
      if (typeof value === 'number') {
        return Number.isFinite(value)
          ? { ok: true, value }
          : { ok: false, reason: 'invalid timestamp' };
      }
      const t = Date.parse(String(value));
      if (Number.isNaN(t)) {
        return { ok: false, reason: `"${String(value)}" is not a date` };
      }
      return { ok: true, value: new Date(t) };
    }

    default:
      return { ok: true, value };
  }
}
