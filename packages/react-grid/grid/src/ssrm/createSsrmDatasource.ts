import type {
  IServerSideDatasource,
  IServerSideGetRowsParams,
} from 'ag-grid-community';
import { quickFilterColumnsOf } from '@wellsfargo-starui/core';
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
 * Value columns whose `aggFunc` is a compiled closure, dropped.
 *
 * AG Grid builds the request with `aggFunc: col.aggFunc` — the column's live
 * value, which for a custom aggregation is a FUNCTION. A function cannot be
 * structured-cloned, so posting the request to the SharedWorker threw
 * `DataCloneError` and every block of the grid failed to load, not just the
 * aggregated column.
 *
 * The column is dropped rather than sent as a name the worker would reject,
 * because dropping it costs one column's aggregate and rejecting it costs the
 * whole grid. The reason the user sees belongs to the control that offered the
 * custom aggregation — `DataCapabilities.supportsCustomComparator` carries the
 * copy ("Sorting and aggregation run on the server for this grid…"), which
 * Phase 6 renders beside it.
 */
function withSerialisableAggFuncs(
  valueCols: SsrmGetRowsRequest['valueCols'],
  onDropped: (field: string) => void,
): SsrmGetRowsRequest['valueCols'] {
  if (!valueCols?.length) return valueCols;
  const kept = valueCols.filter((col) => {
    if (typeof col.aggFunc !== 'function') return true;
    onDropped(col.field ?? col.id ?? '(unnamed column)');
    return false;
  });
  return kept.length === valueCols.length ? valueCols : kept;
}

/**
 * AG Grid server-side datasource backed by {@link ISsrmDataProvider}.
 */
export function createSsrmDatasource(
  provider: ISsrmDataProvider,
  options: CreateSsrmDatasourceOptions = {},
): IServerSideDatasource {
  const keyColumn = options.keyColumn ?? 'id'; // aligned with every other keyColumn default (was 'positionId' — a latent split-default trap; the wired surface always passes an explicit value)
  const pivotSep = options.pivotResultFieldSeparator ?? '_';
  const warnedCustomAgg = new Set<string>();
  return {
    getRows(params: IServerSideGetRowsParams): void {
      const base = params.request as unknown as SsrmGetRowsRequest;
      const quickFilterText = options.getQuickFilterText?.() ?? '';
      // Only with an active quick filter: without one the scope changes
      // nothing, and it would churn the worker's per-query memo key on every
      // column show/hide.
      const quickFilterColumns = quickFilterText
        ? quickFilterColumnsOf(params.api)
        : undefined;
      const req: SsrmGetRowsRequest = {
        ...base,
        valueCols: withSerialisableAggFuncs(base.valueCols, (field) => {
          if (warnedCustomAgg.has(field)) return;
          warnedCustomAgg.add(field);
          console.warn(
            `[ssrm] custom aggregation on “${field}” cannot run on the server — ` +
              'the expression is compiled in this window and does not cross the ' +
              'worker boundary. The column is served without an aggregate.',
          );
        }),
        pivotResultFieldSeparator: pivotSep,
        ...(quickFilterText ? { quickFilterText } : {}),
        ...(quickFilterColumns ? { quickFilterColumns } : {}),
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
          // Includes the query plane's explicit refusals (`UnsupportedQueryError`
          // — an operator or aggregation it cannot evaluate). Its message is
          // user-facing copy naming the limit and the alternative; it arrives
          // here as the RPC's error string rather than as a block of rows
          // filtered by something else.
          console.error('[ssrm] getRows failed', err);
          params.fail();
        });
    },
  };
}
