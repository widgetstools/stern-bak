/**
 * Worker-backed pill counts for the filters toolbar under SSRM.
 *
 * The CSRM count path iterates `api.forEachNode`, which under the
 * server-side row model sees only loaded blocks — a pill badge would count
 * a 100-row window of the cache. Each pill instead asks the worker for a
 * zero-row block (`startRow: 0, endRow: 0`): the query plane filters the
 * whole `RowStore` and returns `rowCount` without materialising any rows.
 *
 * The applied pill filter itself already evaluates worker-side — it goes
 * through `setFilterModel`, which re-queries the datasource. Only the
 * counting needed this path.
 */

export interface SsrmCountableFilter {
  id: string;
  filterModel: Record<string, unknown>;
}

export interface SsrmFilterCountsDeps {
  getRows: (req: {
    startRow: number;
    endRow: number;
    filterModel: Record<string, unknown>;
    quickFilterText?: string;
  }) => Promise<{ rowCount: number }>;
  getQuickFilterText?: () => string;
}

export async function computeSsrmFilterCounts(
  filters: readonly SsrmCountableFilter[],
  deps: SsrmFilterCountsDeps,
): Promise<Record<string, number>> {
  if (filters.length === 0) return {};
  const quickFilterText = deps.getQuickFilterText?.() ?? '';
  const entries = await Promise.all(
    filters.map(async (f) => {
      try {
        const { rowCount } = await deps.getRows({
          startRow: 0,
          endRow: 0,
          filterModel: f.filterModel,
          ...(quickFilterText ? { quickFilterText } : {}),
        });
        return [f.id, rowCount] as const;
      } catch {
        return [f.id, 0] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}
