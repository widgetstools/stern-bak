import type { ColumnDefinition, ProviderConfig } from '@wellsfargo-starui/types';
import type { ProviderStatus } from '../runtime/protocol.js';
import type { Unsubscribe } from './IDataProvider.js';
import type { ProviderCapabilities } from './ProviderCapabilities.js';
import type {
  SsrmAggregatesRequest,
  SsrmAggregatesResult,
  SsrmColumnValuesRequest,
  SsrmColumnValuesResult,
  SsrmGetRowsRequest,
  SsrmGetRowsResult,
  SsrmRowCountRequest,
  SsrmRowCountResult,
  SsrmTickPayload,
  SsrmWatchGroupsRequest,
} from '../runtime/ssrm/ssrmTypes.js';

export type {
  SsrmAggregatesRequest,
  SsrmAggregatesResult,
  SsrmColumnValuesRequest,
  SsrmColumnValuesResult,
  SsrmGetRowsRequest,
  SsrmGetRowsResult,
  SsrmRowCountRequest,
  SsrmRowCountResult,
  SsrmTickPayload,
  SsrmWatchGroupsRequest,
};

/**
 * Client contract for AG Grid SSRM blotters.
 *
 * Lifecycle mirrors {@link IDataProvider} — `start` / `stop` / `refresh` /
 * `restart` mean the same things to the hub — so container chrome (Refresh
 * view, Reload from source, toolbar date reload) drives either row model
 * through the same calls. The row-shaped members are the difference: rows
 * stay in the SharedWorker WASM cache, so there is no `getData()` /
 * `onSnapshotData()` / `onTick()`. `refresh()` therefore cannot replay rows
 * to this client; it asks bound grids to re-read their blocks via
 * {@link ISsrmDataProvider.onRefresh}.
 */
export interface ISsrmDataProvider {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Re-read blocks from the worker cache — no upstream reconnect. */
  refresh(): Promise<void>;
  restart(extra?: Record<string, unknown>): Promise<void>;
  getConfig(): ProviderConfig;
  getColumnDefs(): readonly ColumnDefinition[];
  getRows(req: SsrmGetRowsRequest): Promise<SsrmGetRowsResult>;
  /**
   * Distinct values for one column. AG Grid set filters cannot derive their
   * list under SSRM — no rows reach the main thread — so the grid asks here.
   */
  getColumnValues(req: SsrmColumnValuesRequest): Promise<SsrmColumnValuesResult>;
  /**
   * Rows matching a filter the grid has NOT applied — the saved-filter pill
   * badges. A client-side scan can only see loaded blocks, so it would report
   * block statistics rather than a total.
   */
  getRowCount(req: SsrmRowCountRequest): Promise<SsrmRowCountResult>;
  /**
   * Dataset-level aggregations for the status bar and for expression
   * `SUM` / `AVG` / `MIN` / `MAX` / `COUNT`. A client-side reduce can
   * only see loaded blocks, so it would report a block statistic.
   */
  getAggregates(req: SsrmAggregatesRequest): Promise<SsrmAggregatesResult>;
  watchGroups(req: SsrmWatchGroupsRequest): Promise<void>;
  onSsrmTick(handler: (payload: SsrmTickPayload) => void): Unsubscribe;
  /** Fires when bound grids must purge and re-read (refresh / restart). */
  onRefresh(handler: () => void): Unsubscribe;
  onRowsReceived(handler: (count: number) => void): Unsubscribe;
  onStatus(handler: (status: ProviderStatus, error?: string) => void): Unsubscribe;
  onError(handler: (error: Error) => void): Unsubscribe;
}
