/**
 * Point every set filter's value list at the worker.
 *
 * AG's set filter builds its checkbox list from the rows the CLIENT holds.
 * Under Perspective that is the loaded blocks — a few hundred rows of a
 * 50,000-row book — so without this every set-filter menu shows whichever
 * handful of values happened to be on screen and presents them as the column's
 * values. Supplying `filterParams.values` as a callback replaces that walk
 * with an answer computed over the whole book in the worker.
 *
 * Columns that already declare their own `values` are left alone: a host that
 * hard-coded a domain list meant it.
 *
 * `null` from the supplier means the worker refused — past its distinct-value
 * ceiling, most likely — and is passed on as an EMPTY list with the filter
 * left to render its own empty state. A truncated list presented as complete
 * is the failure this avoids.
 */

/** The AG shape this rewrites. Structural — nothing here needs AG's types. */
interface SetFilterColDefLike {
  colId?: string;
  field?: string;
  filter?: unknown;
  filterParams?: Record<string, unknown>;
  children?: unknown[];
  [key: string]: unknown;
}

/** AG calls this with a `success` callback, not a promise. */
interface SetFilterValuesParams {
  success(values: unknown[]): void;
}

function isSetFilter(colDef: SetFilterColDefLike): boolean {
  return colDef.filter === 'agSetColumnFilter' || colDef.filter === 'agSetFilter';
}

function rewriteOne(
  colDef: SetFilterColDefLike,
  distinctValues: (colId: string) => Promise<unknown[] | null>,
): SetFilterColDefLike {
  // A column group carries children rather than a filter of its own.
  if (Array.isArray(colDef.children)) {
    return {
      ...colDef,
      children: colDef.children.map((child) =>
        rewriteOne(child as SetFilterColDefLike, distinctValues),
      ),
    };
  }

  if (!isSetFilter(colDef)) return colDef;
  if (colDef.filterParams && 'values' in colDef.filterParams) return colDef;

  const colId = colDef.colId ?? colDef.field;
  if (!colId) return colDef;

  return {
    ...colDef,
    filterParams: {
      ...(colDef.filterParams ?? {}),
      values: (params: SetFilterValuesParams) => {
        void distinctValues(colId)
          .then((values) => params.success(values ?? []))
          // AG wants `success` called exactly once; a rejection that never
          // calls it leaves the filter menu spinning forever.
          .catch(() => params.success([]));
      },
    },
  };
}

export function withPerspectiveSetFilterValues(
  columnDefs: unknown[],
  distinctValues: (colId: string) => Promise<unknown[] | null>,
): unknown[] {
  return columnDefs.map((colDef) =>
    rewriteOne(colDef as SetFilterColDefLike, distinctValues),
  );
}
