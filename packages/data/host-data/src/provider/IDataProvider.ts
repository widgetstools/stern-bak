import type { ColumnDefinition, ProviderConfig } from '@wellsfargo-starui/types';
import type { ProviderStatus } from '../runtime/protocol.js';
import type { ProviderCapabilities } from './ProviderCapabilities.js';

/** Unsubscribe handle returned by event registrars. */
export type Unsubscribe = () => void;

/**
 * Uniform client contract for a hub-backed data provider.
 *
 * Lifecycle maps to SharedWorker attach/detach; the hub stops upstream
 * when the last subscriber leaves (detach, port close, or missed pings).
 *
 * @typeParam T Row shape (defaults to opaque records).
 */
export interface IDataProvider<T = Record<string, unknown>> {
  readonly id: string;
  readonly capabilities: ProviderCapabilities;

  /** Attach subscriber; start transport when not already running. */
  start(): Promise<void>;
  /** Detach this client; hub provider stays up for other subscribers. */
  stop(): Promise<void>;
  /** Replay hub row cache to this subscriber without upstream I/O. */
  refresh(): Promise<void>;
  /** Full re-acquire (STOMP reconnect, REST refetch, historical asOfDate, …). */
  restart(extra?: Record<string, unknown>): Promise<void>;

  /** Last snapshot commit by reference (not updated on live ticks). */
  getData(): readonly T[];
  /** Resolved provider configuration from hub catalog or attach cfg. */
  getConfig(): ProviderConfig;
  /**
   * Null-safe config accessor — `null` until `start()` resolves the
   * config. Prefer this over wrapping `getConfig()` in try/catch.
   * Optional so bare test doubles stay valid; the client adapters
   * always implement it, and callers optional-chain (`?.() ?? null`).
   */
  getConfigOrNull?(): ProviderConfig | null;
  /** Column defs from config or inferred schema. */
  getColumnDefs(): readonly ColumnDefinition[];

  /** Progressive snapshot row count (optional aggregate during load). */
  onRowsReceived(handler: (count: number) => void): Unsubscribe;
  /** Full snapshot replace (`replace: true` delta). */
  onSnapshotData(handler: (rows: readonly T[]) => void): Unsubscribe;
  /** Incremental keyed updates after snapshot (streaming providers). */
  onTick(handler: (rows: readonly T[]) => void): Unsubscribe;
  onError(handler: (error: Error) => void): Unsubscribe;
  onStatus(handler: (status: ProviderStatus, error?: string) => void): Unsubscribe;
}

/** Resolves {@link IDataProvider} instances by persisted provider id. */
export interface IDataProviderFactory {
  getProvider(providerId: string): IDataProvider;
}

/**
 * Bundle returned by `ensurePlatformReady` / `ensureDataServicesHub`.
 *
 * The two hydration signals are split so consumers can paint the shell as
 * soon as the hub connection is live and await only the signal they need:
 *   - {@link appDataReady} — the AppData mirror's first snapshot (templates).
 *   - {@link catalogReady} — the worker's data-provider catalog preload
 *     (provider attach / picker lists).
 * {@link ready} is `Promise.all` of both, retained for callers that want full
 * hydration. `ensurePlatformReady` resolves the bundle once the hub connection
 * is established — these promises settle in the background afterward.
 */
export interface DataServicesHubBundle extends IDataProviderFactory {
  /** Both AppData mirror snapshot and worker catalog hydrated (`Promise.all`). */
  readonly ready: Promise<void>;
  /** AppData mirror's first snapshot has arrived. */
  readonly appDataReady: Promise<void>;
  /** Worker data-provider catalog preload completed. */
  readonly catalogReady: Promise<void>;
  /** Global teardown — wire `stop`. Does not run on grid unmount. */
  stopProvider(providerId: string): Promise<void>;
  /** Tear down hub client and worker connection for this window. */
  dispose(): void;
}
