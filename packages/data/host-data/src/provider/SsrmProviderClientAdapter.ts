import type { ColumnDefinition, ProviderConfig, ProviderType } from '@wellsfargo-starui/types';
import type {
  SharedWorkerDataServicesClient,
  SubscribeHandle,
} from '../runtime/client/SharedWorkerDataServicesClient.js';
import type { ProviderStatus } from '../runtime/protocol.js';
import type {
  ExpressionRule,
  SetFilterValuesRequest,
  SsrmGetRowsRequest,
  SsrmGetRowsResult,
  StatusBarRequest,
  StatusBarSummary,
} from '../runtime/ssrm/index.js';
import type { Unsubscribe } from './IDataProvider.js';
import type { ISsrmDataProvider, SsrmTickPayload } from './ISsrmDataProvider.js';
import { resolveProviderCapabilities } from './ProviderClientAdapter.js';

export interface SsrmProviderClientAdapterOpts {
  client: SharedWorkerDataServicesClient;
  providerId: string;
  inlineCfg?: ProviderConfig;
}

/**
 * {@link ISsrmDataProvider} over the SharedWorker hub — attaches the
 * STOMP feed for lifecycle/status and routes query/ticks through the
 * SSRM plane RPCs.
 */
export class SsrmProviderClientAdapter implements ISsrmDataProvider {
  readonly id: string;

  private readonly client: SharedWorkerDataServicesClient;
  private readonly inlineCfg?: ProviderConfig;
  private resolvedConfig: ProviderConfig | null = null;
  private handle: SubscribeHandle | null = null;
  private offSsrmTick: (() => void) | null = null;

  private readonly rowsReceivedHandlers = new Set<(count: number) => void>();
  private readonly tickHandlers = new Set<(payload: SsrmTickPayload) => void>();
  private readonly errorHandlers = new Set<(error: Error) => void>();
  private readonly statusHandlers = new Set<
    (status: ProviderStatus, error?: string) => void
  >();

  constructor(opts: SsrmProviderClientAdapterOpts) {
    this.id = opts.providerId;
    this.client = opts.client;
    this.inlineCfg = opts.inlineCfg;
  }

  private get sessionId(): string {
    if (!this.handle) {
      throw new Error(
        `[SsrmProviderClientAdapter] Not started (providerId=${this.id})`,
      );
    }
    return this.handle.subId;
  }

  async start(): Promise<void> {
    // Re-entrant: await the in-flight snapshot instead of returning early
    // (early return left callers thinking start() finished with no rows).
    if (this.handle) {
      await this.handle.snapshot;
      return;
    }

    if (this.inlineCfg) {
      this.resolvedConfig = this.inlineCfg;
    } else {
      const row = await this.client.getProviderConfig(this.id);
      if (!row?.config) {
        throw new Error(
          `[SsrmProviderClientAdapter] No config for providerId=${this.id}`,
        );
      }
      this.resolvedConfig = row.config;
    }

    // Pass resolved cfg so hub attach works even if the worker catalog
    // cache briefly lags IndexedDB (cfg-free attach would error + hang
    // `snapshot` with no subscriber).
    const handle = this.client.subscribe(
      this.id,
      this.resolvedConfig ?? this.inlineCfg,
    );
    this.wireHandle(handle);
    this.handle = handle;
    // Wait for snapshot so the plane is seeded before first getRows.
    await handle.snapshot;
  }

  async refresh(): Promise<void> {
    this.assertStarted();
    await this.handle!.refresh();
  }

  async restart(extra?: Record<string, unknown>): Promise<void> {
    this.detach();
    if (!this.resolvedConfig && !this.inlineCfg) {
      const row = await this.client.getProviderConfig(this.id);
      if (!row?.config) {
        throw new Error(
          `[SsrmProviderClientAdapter] No config for providerId=${this.id}`,
        );
      }
      this.resolvedConfig = row.config;
    }
    const handle = this.client.subscribe(
      this.id,
      this.resolvedConfig ?? this.inlineCfg,
      extra ? { extra } : {},
    );
    this.wireHandle(handle);
    this.handle = handle;
    await handle.snapshot;
  }

  getConfig(): ProviderConfig {
    if (!this.resolvedConfig) {
      throw new Error(
        `[SsrmProviderClientAdapter] getConfig() before start() for providerId=${this.id}`,
      );
    }
    return this.resolvedConfig;
  }

  getColumnDefs(): readonly ColumnDefinition[] {
    const config = this.getConfig() as ProviderConfig & {
      columnDefinitions?: ColumnDefinition[];
    };
    return config.columnDefinitions ?? [];
  }

  getRows(req: SsrmGetRowsRequest): Promise<SsrmGetRowsResult> {
    return this.client.ssrmGetRows(this.id, this.sessionId, req);
  }

  async setViewport(keys: string[]): Promise<void> {
    this.client.ssrmSetViewport(this.id, this.sessionId, keys);
  }

  configureExpressions(rules: ExpressionRule[]): Promise<void> {
    return this.client.ssrmConfigureExpressions(this.id, rules);
  }

  getSetFilterValues(req: SetFilterValuesRequest): Promise<string[]> {
    return this.client.ssrmGetSetFilterValues(this.id, req);
  }

  getStatusBar(req?: StatusBarRequest): Promise<StatusBarSummary> {
    return this.client.ssrmGetStatusBar(this.id, req);
  }

  onSsrmTick(handler: (payload: SsrmTickPayload) => void): Unsubscribe {
    this.tickHandlers.add(handler);
    return () => this.tickHandlers.delete(handler);
  }

  onRowsReceived(handler: (count: number) => void): Unsubscribe {
    this.rowsReceivedHandlers.add(handler);
    return () => this.rowsReceivedHandlers.delete(handler);
  }

  onStatus(
    handler: (status: ProviderStatus, error?: string) => void,
  ): Unsubscribe {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  onError(handler: (error: Error) => void): Unsubscribe {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  async stop(): Promise<void> {
    this.detach();
    this.rowsReceivedHandlers.clear();
    this.tickHandlers.clear();
    this.errorHandlers.clear();
    this.statusHandlers.clear();
  }

  /** Capabilities helper for SSRM STOMP providers. */
  get capabilities() {
    const providerType: ProviderType =
      this.resolvedConfig?.providerType ??
      this.inlineCfg?.providerType ??
      'stomp-ssrm';
    return resolveProviderCapabilities(providerType);
  }

  private wireHandle(handle: SubscribeHandle): void {
    this.offSsrmTick?.();
    this.offSsrmTick = this.client.onSsrmTick(handle.subId, (ev) => {
      const payload: SsrmTickPayload = {
        event: ev.event,
        interestedKeys: ev.interestedKeys,
      };
      for (const handler of this.tickHandlers) handler(payload);
    });

    handle.onRowsReceived((count) => {
      for (const handler of this.rowsReceivedHandlers) handler(count);
    });

    handle.onStatus((status, error) => {
      for (const handler of this.statusHandlers) handler(status, error);
      if (status === 'error') {
        const err = new Error(error ?? 'Provider error');
        for (const handler of this.errorHandlers) handler(err);
      }
    });

    void handle.snapshot.catch((err: unknown) => {
      const error = err instanceof Error ? err : new Error(String(err));
      for (const handler of this.errorHandlers) handler(error);
    });
  }

  private detach(): void {
    this.offSsrmTick?.();
    this.offSsrmTick = null;
    this.handle?.unsubscribe();
    this.handle = null;
  }

  private assertStarted(): void {
    if (!this.handle) {
      throw new Error(
        `[SsrmProviderClientAdapter] Operation requires start() for providerId=${this.id}`,
      );
    }
  }
}
