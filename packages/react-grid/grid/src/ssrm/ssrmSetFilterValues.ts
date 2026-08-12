/**
 * Worker-backed set-filter values for SSRM columns.
 *
 * AG Grid's set filter, left to its own devices under the server-side row
 * model, lists only the values present in loaded blocks — a 100-row window
 * of a 100k-row cache. These params route the panel to the SharedWorker
 * plane instead, which scans the full `RowStore`, so the panel lists every
 * distinct value for the column. Deliberately unscoped (column only): the
 * panel shows the column's whole domain, exactly like the CSRM set filter.
 *
 * `refreshValuesOnOpen` keeps the list current against live ticks without a
 * per-tick refresh storm — values re-fetch each time the panel opens.
 */
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';

export interface SsrmSetFilterValuesDeps {
  provider: Pick<ISsrmDataProvider, 'getSetFilterValues'>;
}

interface ColDefLike {
  field?: string;
  filter?: unknown;
  filterParams?: Record<string, unknown>;
  children?: ColDefLike[];
  [key: string]: unknown;
}

interface SetFilterValuesParams {
  success: (values: string[]) => void;
}

export function withSsrmSetFilterValues<T extends ColDefLike>(
  defs: readonly T[],
  deps: SsrmSetFilterValuesDeps,
): T[] {
  const { provider } = deps;

  const decorate = (def: ColDefLike): ColDefLike => {
    if (Array.isArray(def.children)) {
      return { ...def, children: def.children.map(decorate) };
    }
    const field = def.field;
    if (!field || def.filter === false) return def;
    return {
      ...def,
      filterParams: {
        ...(def.filterParams ?? {}),
        refreshValuesOnOpen: true,
        values: (params: SetFilterValuesParams) => {
          provider
            .getSetFilterValues({ column: field })
            .then((values) => params.success(values))
            .catch(() => params.success([]));
        },
      },
    };
  };

  return defs.map((d) => decorate(d) as T);
}
