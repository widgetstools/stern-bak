import type { ColumnDefinition, ProviderConfig } from '@wellsfargo-starui/types';
import type { SharedWorkerDataServicesClient } from '../runtime/client/SharedWorkerDataServicesClient.js';
import type { ProviderStatus } from '../runtime/protocol.js';
import type { Unsubscribe } from './IDataProvider.js';
import type { ISsrmDataProvider } from './ISsrmDataProvider.js';
import type { ProviderCapabilities } from './ProviderCapabilities.js';
import { resolveProviderCapabilities } from './ProviderClientAdapter.js';
import type {
  SsrmApplyEditsRequest,
  SsrmApplyEditsResult,
  SsrmColumnValuesRequest,
  SsrmColumnValuesResult,
  SsrmGetRowsRequest,
  SsrmGetRowsResult,
  SsrmAggregatesRequest,
  SsrmAggregatesResult,
  SsrmRowCountRequest,
  SsrmRowCountResult,
  SsrmTickPayload,
  SsrmWatchGroupsRequest,
  SsrmWatchPredicateRequest,
} from '../runtime/ssrm/ssrmTypes.js';

export interface SsrmProviderClientAdapterOpts {
  /** Data-plane client: attach / RPCs / ticks ride this port. */
  client: SharedWorkerDataServicesClient;
  /**
   * Client whose worker serves the config catalog (the platform-services
   * worker since the split — worker-split W1c). Defaults to `client`.
   */
  catalogClient?: SharedWorkerDataServicesClient;
  providerId: string;
  inlineCfg?: ProviderConfig;
}

export class SsrmProviderClientAdapter implements ISsrmDataProvider {
  readonly id: string;
  private readonly client: SharedWorkerDataServicesClient;
  private readonly catalogClient: SharedWorkerDataServicesClient;
  private readonly inlineCfg?: ProviderConfig;
  private resolvedConfig: ProviderConfig | null = null;
  private subId: string | null = null;
  private offTick: Unsubscribe | null = null;
  private lastStatus: ProviderStatus = 'loading';

  /** Last hub status for this subscription — `loading` until the hub says otherwise. */
  get status(): ProviderStatus {
    return this.lastStatus;
  }

  private readonly tickHandlers = new Set<(payload: SsrmTickPayload) => void>();
  private readonly refreshHandlers = new Set<() => void>();
  private readonly rowsReceivedHandlers = new Set<(count: number) => void>();
  private readonly statusHandlers = new Set<(status: ProviderStatus, error?: string) => void>();
  private readonly errorHandlers = new Set<(error: Error) => void>();

  constructor(opts: SsrmProviderClientAdapterOpts) {
    this.id = opts.providerId;
    this.client = opts.client;
    this.catalogClient = opts.catalogClient ?? opts.client;
    this.inlineCfg = opts.inlineCfg;
  }

  get capabilities(): ProviderCapabilities {
    const providerType =
      this.resolvedConfig?.providerType
      ?? this.inlineCfg?.providerType
      ?? 'stomp-ssrm';
    return resolveProviderCapabilities(providerType);
  }

  async start(): Promise<void> {
    if (this.subId) return;
    if (this.inlineCfg) {
      this.resolvedConfig = this.inlineCfg;
    } else {
      const row = await this.catalogClient.getProviderConfig(this.id);
      if (!row?.config) {
        throw new Error(
          `[SsrmProviderClientAdapter] No config for providerId=${this.id}.`,
        );
      }
      this.resolvedConfig = row.config;
    }
    this.attach();
  }

  async stop(): Promise<void> {
    this.detach();
  }

  /**
   * No upstream I/O — the rows already sit in the worker's WASM cache, so
   * "refresh" means every bound grid purges its blocks and re-reads them.
   * The CSRM analogue replays the hub row cache to this subscriber.
   */
  async refresh(): Promise<void> {
    for (const h of this.refreshHandlers) h();
  }

  async restart(extra?: Record<string, unknown>): Promise<void> {
    this.detach();
    if (!this.resolvedConfig && !this.inlineCfg) {
      await this.start();
      return;
    }
    this.attach({ extra });
    // The reconnect re-boots the worker cache under us; blocks the grid
    // already holds are from the previous snapshot.
    await this.refresh();
  }

  /** Catalog row just fetched, or an editor draft — hub attach must not rely on a later cache hit. */
  private attachCfg(): ProviderConfig | undefined {
    return this.inlineCfg ?? this.resolvedConfig ?? undefined;
  }

  private attach(opts: { extra?: Record<string, unknown> } = {}): void {
    this.subId = this.client.attachSsrm(this.id, this.attachCfg(), {
      onStatus: (status, error) => {
        this.lastStatus = status;
        for (const h of this.statusHandlers) h(status, error);
        if (status === 'error' && error) {
          const err = new Error(error);
          for (const h of this.errorHandlers) h(err);
        }
      },
      onRowsReceived: (count) => {
        for (const h of this.rowsReceivedHandlers) h(count);
      },
    }, opts.extra ? { extra: opts.extra } : {});
    this.offTick = this.client.onSsrmTick(this.subId, (payload) => {
      for (const h of this.tickHandlers) h(payload);
    });
  }

  private detach(): void {
    this.offTick?.();
    this.offTick = null;
    if (this.subId) {
      this.client.detach(this.subId);
      this.subId = null;
    }
    this.lastStatus = 'loading';
  }

  applyEdits(req: SsrmApplyEditsRequest): Promise<SsrmApplyEditsResult> {
    if (!this.subId) return Promise.reject(new Error('[SsrmProviderClientAdapter] not started'));
    return this.client.ssrmApplyEdits(this.id, this.subId, req.rows, req.editedColumns);
  }

  getConfig(): ProviderConfig {
    const cfg = this.resolvedConfig ?? this.inlineCfg;
    if (!cfg) throw new Error('[SsrmProviderClientAdapter] not started');
    return cfg;
  }

  getColumnDefs(): readonly ColumnDefinition[] {
    const cfg = this.getConfig() as ProviderConfig & { columnDefinitions?: ColumnDefinition[] };
    return cfg.columnDefinitions ?? [];
  }

  getRows(req: SsrmGetRowsRequest): Promise<SsrmGetRowsResult> {
    if (!this.subId) return Promise.reject(new Error('[SsrmProviderClientAdapter] not started'));
    return this.client.ssrmGetRows(this.id, this.subId, req);
  }

  getColumnValues(req: SsrmColumnValuesRequest): Promise<SsrmColumnValuesResult> {
    if (!this.subId) return Promise.reject(new Error('[SsrmProviderClientAdapter] not started'));
    return this.client.ssrmColumnValues(this.id, this.subId, req);
  }

  getRowCount(req: SsrmRowCountRequest): Promise<SsrmRowCountResult> {
    if (!this.subId) return Promise.reject(new Error('[SsrmProviderClientAdapter] not started'));
    return this.client.ssrmRowCount(this.id, this.subId, req);
  }

  getAggregates(req: SsrmAggregatesRequest): Promise<SsrmAggregatesResult> {
    if (!this.subId) return Promise.reject(new Error('[SsrmProviderClientAdapter] not started'));
    return this.client.ssrmAggregates(this.id, this.subId, req);
  }

  watchGroups(req: SsrmWatchGroupsRequest): Promise<void> {
    if (!this.subId) return Promise.reject(new Error('[SsrmProviderClientAdapter] not started'));
    return this.client.ssrmWatchGroups(this.id, this.subId, req.groupBy, req.aggregates);
  }

  watchPredicate(req: SsrmWatchPredicateRequest): Promise<void> {
    if (!this.subId) return Promise.reject(new Error('[SsrmProviderClientAdapter] not started'));
    return this.client.ssrmWatchPredicate(this.id, this.subId, req.ruleId, req.expr);
  }

  unwatchPredicate(ruleId: string): Promise<void> {
    if (!this.subId) return Promise.reject(new Error('[SsrmProviderClientAdapter] not started'));
    return this.client.ssrmUnwatchPredicate(this.id, this.subId, ruleId);
  }

  onSsrmTick(handler: (payload: SsrmTickPayload) => void): Unsubscribe {
    this.tickHandlers.add(handler);
    return () => { this.tickHandlers.delete(handler); };
  }

  onRefresh(handler: () => void): Unsubscribe {
    this.refreshHandlers.add(handler);
    return () => { this.refreshHandlers.delete(handler); };
  }

  onRowsReceived(handler: (count: number) => void): Unsubscribe {
    this.rowsReceivedHandlers.add(handler);
    return () => { this.rowsReceivedHandlers.delete(handler); };
  }

  onStatus(handler: (status: ProviderStatus, error?: string) => void): Unsubscribe {
    this.statusHandlers.add(handler);
    return () => { this.statusHandlers.delete(handler); };
  }

  onError(handler: (error: Error) => void): Unsubscribe {
    this.errorHandlers.add(handler);
    return () => { this.errorHandlers.delete(handler); };
  }
}
