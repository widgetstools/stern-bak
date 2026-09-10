import type {
  IServerSideDatasource,
  IServerSideGetRowsParams,
} from 'ag-grid-community';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import type { SsrmGetRowsRequest } from '@wellsfargo-starui/data/runtime';

export interface CreateSsrmDatasourceOptions {
  getQuickFilterText?: () => string;
}

/**
 * Set filters with no selected values mean "match nothing" in AG Grid.
 * Under SSRM the values callback often hasn't landed on the first request
 * (or is cached empty after a failed load-time lookup), so the request
 * arrives as `{ filterType: 'set', values: [] }`. Sending that to the
 * engine zeroes the grouped view — deactivate the pill and groups appear,
 * apply it again and they vanish. Drop those slots; a real selection has
 * a non-empty `values` array.
 */
function withoutEmptySetFilters(
  model: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!model) return model ?? null;
  const out: Record<string, unknown> = {};
  let kept = false;
  for (const [col, entry] of Object.entries(model)) {
    if (isEmptySetSlot(entry)) continue;
    out[col] = stripEmptySetSlots(entry);
    kept = true;
  }
  return kept ? out : null;
}

function isEmptySetSlot(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false;
  const e = entry as { filterType?: string; values?: unknown; filterModels?: unknown[] };
  if (e.filterType === 'multi' && Array.isArray(e.filterModels)) {
    return e.filterModels.every((slot) => slot == null || isEmptySetSlot(slot));
  }
  return (e.filterType === 'set' || e.values !== undefined) && Array.isArray(e.values) && e.values.length === 0;
}

function stripEmptySetSlots(entry: unknown): unknown {
  if (!entry || typeof entry !== 'object') return entry;
  const e = entry as { filterType?: string; filterModels?: unknown[] };
  if (e.filterType !== 'multi' || !Array.isArray(e.filterModels)) return entry;
  return { ...e, filterModels: e.filterModels.map((slot) => (isEmptySetSlot(slot) ? null : slot)) };
}

export function createSsrmDatasource(
  provider: ISsrmDataProvider,
  options: CreateSsrmDatasourceOptions = {},
): IServerSideDatasource {
  // The first block must land without the saved-filter pill. AG Grid (and
  // grid-state restore) can put a set-filter model on the request before any
  // row has painted; a grouped store then waits on values / receives `in: []`
  // and never shows a group. After that first success, later requests carry
  // the live filter — including the pill applied from firstDataRendered.
  let firstBlockDone = false;

  return {
    getRows(params: IServerSideGetRowsParams): void {
      const base = params.request as unknown as SsrmGetRowsRequest;
      const quickFilterText = options.getQuickFilterText?.() ?? '';
      const applyFilters = firstBlockDone;
      const filterModel = applyFilters ? withoutEmptySetFilters(base.filterModel) : null;
      const req: SsrmGetRowsRequest = {
        ...base,
        filterModel,
        ...(applyFilters && quickFilterText ? { quickFilterText } : {}),
      };
      if (!applyFilters) delete req.quickFilterText;
      void provider
        .getRows(req)
        .then((result) => {
          if (params.api.isDestroyed?.()) return;
          firstBlockDone = true;
          params.success({
            rowData: [...result.rowData],
            rowCount: result.rowCount,
            grandTotalData: result.grandTotalData,
            pivotResultFields: result.pivotResultFields,
            ...(result.groupData ? { groupLevelInfo: result.groupData } : {}),
          });
        })
        .catch((err: unknown) => {
          if (params.api.isDestroyed?.()) return;
          // eslint-disable-next-line no-console
          console.error('[ssrm] getRows failed', err);
          params.fail();
        });
    },
    destroy(): void {
      /* Session detach is owned by ISsrmDataProvider.stop() / the React hook. */
    },
  };
}
