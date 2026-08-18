import type { ColumnDefinition, TransportConfig } from '@wellsfargo-starui/types';
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
  /**
   * Alert rules this session's rules matched among the changed rows,
   * INCLUDING rows this grid has never loaded. Row key + rule id only.
   * Absent when the session has configured no alert rules.
   */
  alerts?: ReadonlyArray<{ key: string; ruleId: string }>;
}

export interface ISsrmDataProvider {
  readonly id: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  refresh(): Promise<void>;
  restart(extra?: Record<string, unknown>): Promise<void>;
  getConfig(): TransportConfig;
  /**
   * Null-safe config accessor — `null` until `start()` resolves the
   * config. Prefer this over wrapping `getConfig()` in try/catch.
   * Optional so bare test doubles stay valid; the client adapters
   * always implement it, and callers optional-chain (`?.() ?? null`).
   */
  getConfigOrNull?(): TransportConfig | null;
  getColumnDefs(): readonly ColumnDefinition[];
  getRows(req: SsrmGetRowsRequest): Promise<SsrmGetRowsResult>;
  setViewport(keys: string[], scope?: ViewportInterestScope): Promise<void>;
  configureExpressions(rules: ExpressionRule[]): Promise<void>;
  /**
   * Record this session's pending edits with the plane, so its own queries
   * answer with them and a block refetch stops discarding them. Per session:
   * the plane is shared, and an edit is the editing window's private view of a
   * row every other window also holds.
   */
  setSessionPatches(
    patches: ReadonlyArray<{ key: string; fields: Record<string, unknown> }>,
  ): Promise<void>;
  /**
   * Install this session's exclude-when-true expression (`null` clears it).
   * Applied before paging, so `rowCount` and the totals agree with the rows
   * the user sees.
   */
  setSessionExclude(expression: string | null): Promise<void>;
  getSetFilterValues(req: SetFilterValuesRequest): Promise<string[]>;
  getStatusBar(req?: StatusBarRequest): Promise<StatusBarSummary>;
  onSsrmTick(handler: (payload: SsrmTickPayload) => void): Unsubscribe;
  onRowsReceived(handler: (count: number) => void): Unsubscribe;
  onStatus(handler: (status: ProviderStatus, error?: string) => void): Unsubscribe;
  onError(handler: (error: Error) => void): Unsubscribe;
}
