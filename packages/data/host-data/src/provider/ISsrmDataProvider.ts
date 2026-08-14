import type { ColumnDefinition, ProviderConfig } from '@wellsfargo-starui/types';
import type { ProviderStatus } from '../runtime/protocol.js';
import type { Unsubscribe } from './IDataProvider.js';
import type {
  ExpressionRule,
  SsrmGetRowsRequest,
  SsrmGetRowsResult,
  SetFilterValuesRequest,
  TickEvent,
  StatusBarRequest,
  StatusBarSummary,
  ViewportInterestScope,
} from '../runtime/ssrm/index.js';

export interface SsrmTickPayload {
  event: TickEvent;
  interestedKeys: string[];
}

export interface ISsrmDataProvider {
  readonly id: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  refresh(): Promise<void>;
  restart(extra?: Record<string, unknown>): Promise<void>;
  getConfig(): ProviderConfig;
  /**
   * Null-safe config accessor — `null` until `start()` resolves the
   * config. Prefer this over wrapping `getConfig()` in try/catch.
   * Optional so bare test doubles stay valid; the client adapters
   * always implement it, and callers optional-chain (`?.() ?? null`).
   */
  getConfigOrNull?(): ProviderConfig | null;
  getColumnDefs(): readonly ColumnDefinition[];
  getRows(req: SsrmGetRowsRequest): Promise<SsrmGetRowsResult>;
  setViewport(keys: string[], scope?: ViewportInterestScope): Promise<void>;
  configureExpressions(rules: ExpressionRule[]): Promise<void>;
  getSetFilterValues(req: SetFilterValuesRequest): Promise<string[]>;
  getStatusBar(req?: StatusBarRequest): Promise<StatusBarSummary>;
  onSsrmTick(handler: (payload: SsrmTickPayload) => void): Unsubscribe;
  onRowsReceived(handler: (count: number) => void): Unsubscribe;
  onStatus(handler: (status: ProviderStatus, error?: string) => void): Unsubscribe;
  onError(handler: (error: Error) => void): Unsubscribe;
}
