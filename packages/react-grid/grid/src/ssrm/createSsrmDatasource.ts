import type {
  IServerSideDatasource,
  IServerSideGetRowsParams,
} from 'ag-grid-community';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import type { SsrmGetRowsRequest } from '@wellsfargo-starui/data/runtime';

export interface CreateSsrmDatasourceOptions {
  keyColumn?: string;
  /**
   * CSRM-parity quick filter. AG Grid does not send quickFilterText for SSRM;
   * return the current input value so the SharedWorker can apply it.
   */
  getQuickFilterText?: () => string;
  /**
   * Pivot result field separator — must match grid
   * `serverSidePivotResultFieldSeparator` (default `_`).
   */
  pivotResultFieldSeparator?: string;
}

/**
 * Identity of the query behind a block request. Everything that changes which
 * rows a block contains belongs here; `startRow`/`endRow` deliberately do not,
 * so paging through one query keeps a stable id.
 */
function queryIdOf(req: SsrmGetRowsRequest): string {
  return JSON.stringify([
    req.filterModel ?? null,
    req.sortModel ?? null,
    req.rowGroupCols ?? null,
    req.valueCols ?? null,
    req.pivotCols ?? null,
    req.pivotMode ?? false,
    req.quickFilterText ?? '',
  ]);
}

/** Identity of one block within a query — its group path plus its row range. */
function blockKeyOf(req: SsrmGetRowsRequest): string {
  return `${JSON.stringify(req.groupKeys ?? [])}:${req.startRow ?? 0}`;
}

/**
 * Whether any filter is narrowing this query. The worker uses it to decide
 * whether the session needs changed rows from outside its viewport — only a
 * filtered view can have rows *enter* it on a tick.
 */
function hasFilterOf(req: SsrmGetRowsRequest): boolean {
  const model = req.filterModel as Record<string, unknown> | null | undefined;
  const filterCount = model ? Object.keys(model).length : 0;
  return filterCount > 0 || Boolean(req.quickFilterText);
}

/**
 * AG Grid server-side datasource backed by {@link ISsrmDataProvider}.
 */
export function createSsrmDatasource(
  provider: ISsrmDataProvider,
  options: CreateSsrmDatasourceOptions = {},
): IServerSideDatasource {
  const keyColumn = options.keyColumn ?? 'positionId';
  const pivotSep = options.pivotResultFieldSeparator ?? '_';
  return {
    getRows(params: IServerSideGetRowsParams): void {
      const base = params.request as unknown as SsrmGetRowsRequest;
      const quickFilterText = options.getQuickFilterText?.() ?? '';
      const req: SsrmGetRowsRequest = {
        ...base,
        pivotResultFieldSeparator: pivotSep,
        ...(quickFilterText ? { quickFilterText } : {}),
      };
      void provider
        .getRows(req)
        .then((result) => {
          if (params.api.isDestroyed?.()) return;
          const keys = result.rowData
            .map((r) => r[keyColumn] ?? r.__ssrmGroupKey)
            .filter((k) => k != null)
            .map(String);
          // Scoped so the worker accumulates interest across the blocks AG
          // Grid keeps cached, and resets it when the query itself changes.
          void provider.setViewport(keys, {
            blockKey: blockKeyOf(req),
            queryId: queryIdOf(req),
            hasFilter: hasFilterOf(req),
          });

          params.success({
            rowData: result.rowData,
            rowCount: result.rowCount,
            pivotResultFields: result.pivotResultFields,
            ...(result.grandTotalData
              ? { groupData: result.grandTotalData }
              : {}),
          });
        })
        .catch((err) => {
          if (err instanceof Error && err.message === 'superseded') return;
          if (params.api.isDestroyed?.()) return;
          console.error('[ssrm] getRows failed', err);
          params.fail();
        });
    },
  };
}
