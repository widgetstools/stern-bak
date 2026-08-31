import type { ColumnType } from '@perspective-dev/client';
import type { Aggregate } from '../types.js';

/**
 * AG Grid's built-in aggregation functions, and the Perspective aggregate that
 * computes the same thing. Perspective's names happen to line up for all of
 * them, but going through a table keeps a custom `aggFunc` from being passed to
 * the engine as-is.
 */
const AGG_BY_NAME: Record<string, Aggregate> = {
  sum: 'sum',
  min: 'min',
  max: 'max',
  avg: 'avg',
  count: 'count',
  first: 'first',
  last: 'last',
};

/**
 * Which aggregates the engine will actually accept for a column type.
 *
 * This is not a nicety. `sum` or `avg` against a `string` or `datetime` column
 * does not return a wrong answer — it *aborts the view read* (`Unexpected
 * coltype` / `Unexpected dtype`). The read throws, the block fails, and because
 * a failed view is dropped from the cache it fails again on every retry, so the
 * level never recovers. AG Grid's default aggregation is `sum`, and every
 * column can be dragged into Values, so this is one drag away.
 */
const LEGAL_BY_TYPE: Record<ColumnType, ReadonlySet<string>> = {
  float: new Set(['sum', 'min', 'max', 'avg', 'count', 'first', 'last']),
  integer: new Set(['sum', 'min', 'max', 'avg', 'count', 'first', 'last']),
  boolean: new Set(['count', 'first', 'last']),
  string: new Set(['count', 'first', 'last']),
  date: new Set(['min', 'max', 'count', 'first', 'last']),
  datetime: new Set(['min', 'max', 'count', 'first', 'last']),
};

export type AggregateChoice =
  | { kind: 'aggregate'; aggregate: Aggregate }
  /**
   * The engine cannot compute this. The caller drops the column from the query
   * and reports it, rather than letting the read abort the whole level.
   */
  | { kind: 'unsupported'; reason: string }
  /**
   * `max`, which needs a rewrite — see `MAX_SENTINEL`.
   */
  | { kind: 'max' };

const warned = new Set<string>();

export function chooseAggregate(
  aggFunc: string | null | undefined,
  type: ColumnType,
  colId: string,
): AggregateChoice {
  const name = typeof aggFunc === 'string' ? aggFunc : '';
  const mapped = AGG_BY_NAME[name];
  if (!mapped) {
    // A custom aggFunc, or a function rather than a name. Substituting `sum`
    // here would show a number under someone else's label.
    if (!warned.has(name)) {
      warned.add(name);
      console.warn(
        `Perspective has no equivalent for the "${name || 'unnamed'}" aggregation on ` +
          `"${colId}". The column is left out of the group rows rather than aggregated ` +
          'some other way. Add it to AGG_BY_NAME to support it.',
      );
    }
    return { kind: 'unsupported', reason: `${colId} (no equivalent for "${name}")` };
  }
  if (!LEGAL_BY_TYPE[type].has(name)) {
    return { kind: 'unsupported', reason: `${colId} (${name} is not defined for a ${type})` };
  }
  return name === 'max' ? { kind: 'max' } : { kind: 'aggregate', aggregate: mapped };
}

/**
 * Stands in for a null while computing a maximum.
 *
 * Perspective's `max` returns null if the group holds *any* null, wherever it
 * falls — so a `max` aggregation silently shows nothing. `min` is unaffected,
 * and neither `high` (which reads null as 0, so it returns 0 for an
 * all-negative column) nor the identity `-min(-x)` (expression columns
 * propagate nulls differently) is a correct substitute.
 *
 * Replacing null with a value below anything representable, then reading that
 * value back as null, is. Verified for positive, negative, mixed-sign and
 * all-null groups.
 */
export const MAX_SENTINEL = -1e308;

/** Name of the derived column that computes a null-free maximum for `colId`. */
export function maxAliasFor(colId: string): string {
  return `__psp_max_${colId}`;
}

export function maxExpressionFor(colId: string): string {
  return `if (is_null("${colId}")) { ${MAX_SENTINEL} } else { "${colId}" }`;
}

/** Renames one alias back to the column it stands for, pivot prefix and all. */
function decodeName(name: string, aliases: Record<string, string>): string | undefined {
  const direct = aliases[name];
  if (direct !== undefined) return direct;
  // Under a `split_by` the engine prefixes the column with the pivot keys.
  const cut = name.lastIndexOf('|');
  if (cut === -1) return undefined;
  const target = aliases[name.slice(cut + 1)];
  return target === undefined ? undefined : `${name.slice(0, cut + 1)}${target}`;
}

/**
 * Puts a null-free maximum back under its own column name, and turns the
 * sentinel back into the null it stands for.
 *
 * This runs at the columnar boundary rather than in the row mappers on purpose:
 * the aliases reach three separate read paths — block loads, the grand total and
 * the live aggregate patch — and a mapper that forgets the substitution does not
 * fail, it silently shows the wrong column name and a very large negative
 * number. One place is one place to get right.
 */
export function decodeMaxAliases<T extends Record<string, unknown[]>>(
  columns: T,
  aliases: Record<string, string> | undefined,
): T {
  if (!aliases || Object.keys(aliases).length === 0) return columns;
  const out: Record<string, unknown[]> = {};
  for (const [name, values] of Object.entries(columns)) {
    const target = decodeName(name, aliases);
    if (target === undefined) {
      out[name] = values;
      continue;
    }
    out[target] = values.map((value) =>
      typeof value === 'number' && value <= MAX_SENTINEL ? null : value,
    );
  }
  return out as T;
}

/** The same rename applied to the pivot result field names. */
export function decodeMaxFields(
  fields: string[] | undefined,
  aliases: Record<string, string> | undefined,
): string[] | undefined {
  if (!fields || !aliases || Object.keys(aliases).length === 0) return fields;
  return fields.map((field) => decodeName(field, aliases) ?? field);
}
