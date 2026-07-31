/**
 * `nestedField()` factory — the single sanctioned way to declare a
 * ColDef whose data path contains a dot.
 *
 * See:
 *   - docs/PUBLIC_API_SPEC.md §2.5 — the contract this factory honours
 *   - docs/PUBLIC_API_SPEC.md §15 #11 — non-negotiable that bare
 *     `field: "x.y.z"` literals are a contract violation
 *   - docs/plans/nested-fields-design.md — full design and rationale
 *
 * Why a factory and not bare `field`:
 *   - Routes every read (sort, filter, render, tooltip, export)
 *     through one compiled accessor (`getPathAccessor`).
 *   - Wires a matching setter that creates intermediate objects on
 *     write — AG-Grid's built-in dot-walk on writes does not.
 *   - Pins the colId so persisted column state (order, width, sort,
 *     filter) keys remain stable when valueGetter is later
 *     swapped or augmented.
 *   - Single place to add new wired hooks when AG-Grid grows them.
 */

import type { ColDef, ValueGetterParams, ValueSetterParams } from 'ag-grid-community';
import { getPathAccessor, getPathSetter } from '@wellsfargo-starui/types';

export interface NestedFieldOptions {
  /**
   * Dot-notation path into the row.
   *
   * Doubles as the default colId — and colId is the persistence
   * key — so be deliberate. Renames after launch require a
   * profile-state migration.
   */
  readonly path: string;

  /**
   * Override the column id. Use when v1 state used a different id
   * than the path would now generate, to avoid breaking persisted
   * column state.
   */
  readonly colId?: string;

  /**
   * Sort comparator. Default: a null-safe comparator that:
   *   - Numbers compare numerically.
   *   - Strings compare via `localeCompare` (case-insensitive).
   *   - `null`/`undefined` sort LAST in both directions.
   */
  readonly comparator?: ColDef['comparator'];

  /**
   * Change-detection equals. Default: `Object.is`.
   */
  readonly equals?: ColDef['equals'];

  /**
   * When `false`, the column registers no `valueSetter`, so AG-Grid
   * rejects in-place edits. Default: `true`.
   */
  readonly writable?: boolean;
}

/**
 * Default null-safe comparator. Exported so callers that need a
 * comparator with a thin wrapper can compose with it.
 */
export function defaultNullSafeComparator(
  a: unknown,
  b: unknown,
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;  // nulls sort last
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base' });
}

/**
 * Build the partial ColDef bundle for a nested-field column.
 *
 * Spread the result into your ColDef alongside your own header /
 * styling / filter choices:
 *
 * ```ts
 * {
 *   headerName: 'Last Price',
 *   ...nestedField({ path: 'trade.price.last' }),
 *   cellClass: 'numeric',
 * }
 * ```
 */
export function nestedField(opts: NestedFieldOptions): Partial<ColDef> {
  const { path, colId, comparator, equals, writable = true } = opts;
  const get = getPathAccessor(path);

  const base: Partial<ColDef> = {
    field: path,
    colId: colId ?? path,
    valueGetter: (p: ValueGetterParams) => get(p.data),
    comparator: comparator ?? defaultNullSafeComparator,
    equals: equals ?? Object.is,
    tooltipValueGetter: (p) => {
      const v = get(p.data);
      return v == null ? '' : String(v);
    },
    headerTooltip: path,
  };

  if (writable) {
    const set = getPathSetter(path);
    base.valueSetter = (p: ValueSetterParams) => set(p.data, p.newValue);
  }

  return base;
}
