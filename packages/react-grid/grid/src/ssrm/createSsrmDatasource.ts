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
          void provider.setViewport(keys);

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
