import type { ColumnDefinition, TransportConfig, ProviderType } from '@wellsfargo-starui/types';
import type { SharedWorkerDataServicesClient, SubscribeHandle } from '../runtime/client/SharedWorkerDataServicesClient.js';
import type { ProviderStatus } from '../runtime/protocol.js';
import type { IDataProvider, Unsubscribe } from './IDataProvider.js';
import type { ProviderCapabilities } from './ProviderCapabilities.js';

export interface ProviderClientAdapterOpts {
  client: SharedWorkerDataServicesClient;
  providerId: string;
  /** Draft cfg when the provider row is not in the catalog yet. */
  inlineCfg?: TransportConfig;
}

export function resolveProviderCapabilities(providerType: ProviderType): ProviderCapabilities {
  switch (providerType) {
    case 'stomp':
    case 'stomp-ssrm':
    case 'mock':
    case 'mock-ssrm':
      return {
        providerType,
        streaming: true,
        realtime: true,
        supportsRefresh: true,
        supportsRestart: true,
      };
    case 'rest':
      return {
        providerType,
        streaming: false,
        realtime: false,
        supportsRefresh: true,
        supportsRestart: true,
      };
    case 'appdata':
      return {
        providerType,
        streaming: false,
        realtime: false,
        supportsRefresh: false,
        supportsRestart: false,
      };
    default:
      return {
        providerType,
        streaming: false,
        realtime: false,
        supportsRefresh: true,
        supportsRestart: true,
      };
  }
}

/**
 * Client-side {@link IDataProvider} backed by {@link SharedWorkerDataServicesClient}.
 * One adapter instance = one hub subscriber (attach/detach).
 */
export class ProviderClientAdapter<T = Record<string, unknown>> implements IDataProvider<T> {
  readonly id: string;

  private readonly client: SharedWorkerDataServicesClient;
  private readonly inlineCfg?: TransportConfig;
  private resolvedConfig: TransportConfig | null = null;
  private handle: SubscribeHandle<T> | null = null;
  /** Reference to the last snapshot commit — not copied, not updated on live ticks. */
  private snapshotRows: readonly T[] = [];

  private readonly rowsReceivedHandlers = new Set<(count: number) => void>();
  private readonly snapshotHandlers = new Set<(rows: readonly T[]) => void>();
  private readonly tickHandlers = new Set<(rows: readonly T[]) => void>();
  private readonly errorHandlers = new Set<(error: Error) => void>();
  private readonly statusHandlers = new Set<(status: ProviderStatus, error?: string) => void>();

  constructor(opts: ProviderClientAdapterOpts) {
    this.id = opts.providerId;
    this.client = opts.client;
    this.inlineCfg = opts.inlineCfg;
  }

  get capabilities(): ProviderCapabilities {
    const providerType =
      this.resolvedConfig?.providerType ??
      this.inlineCfg?.providerType ??
      'mock';
    return resolveProviderCapabilities(providerType);
  }

  async start(): Promise<void> {
    if (this.handle) return;

    // eslint-disable-next-line no-console
    console.info('[starui/stomp-template] main thread ProviderClientAdapter.start', {
      providerId: this.id,
      note: 'Hub loads catalog cfg in worker — see hub.attach / stomp.onConnect logs for wire destinations.',
    });

    if (this.inlineCfg) {
      this.resolvedConfig = this.inlineCfg;
    } else {
      // Phase 3: `getProviderConfig` resolves this one provider on demand in
      // the worker (cached or a single-row read) — no need to gate on the full
      // catalog preload. The worker caches the row, so the attach below finds
      // it synchronously.
      const row = await this.client.getProviderConfig(this.id);
      if (!row?.config) {
        throw new Error(
          `[ProviderClientAdapter] No config for providerId=${this.id}. ` +
            'Pass inlineCfg for drafts or ensure the catalog is hydrated.',
        );
      }
      this.resolvedConfig = row.config;
    }

    const handle = this.client.subscribe<T>(
      this.id,
      this.inlineCfg,
    );
    this.wireHandle(handle);
    this.handle = handle;
    await handle.snapshot;
  }

  async refresh(): Promise<void> {
    this.assertStarted();
    const rows = await this.handle!.refresh();
    this.snapshotRows = rows;
    for (const handler of this.snapshotHandlers) {
      handler(rows);
    }
  }

  async restart(extra?: Record<string, unknown>): Promise<void> {
    // eslint-disable-next-line no-console
    console.info('[starui/stomp-template] main thread ProviderClientAdapter.restart', {
      providerId: this.id,
      extra: extra ?? null,
    });
    this.detach();
    if (!this.resolvedConfig && !this.inlineCfg) {
      const row = await this.client.getProviderConfig(this.id);
      if (!row?.config) {
        throw new Error(`[ProviderClientAdapter] No config for providerId=${this.id}`);
      }
      this.resolvedConfig = row.config;
    }

    const handle = this.client.subscribe<T>(
      this.id,
      this.inlineCfg,
      extra ? { extra } : {},
    );
    this.wireHandle(handle);
    this.handle = handle;
    await handle.snapshot;
  }

  getData(): readonly T[] {
    return this.snapshotRows;
  }

  getConfig(): TransportConfig {
    if (!this.resolvedConfig) {
      throw new Error(
        `[ProviderClientAdapter] getConfig() before start() for providerId=${this.id}`,
      );
    }
    return this.resolvedConfig;
  }

  getConfigOrNull(): TransportConfig | null {
    return this.resolvedConfig;
  }

  getColumnDefs(): readonly ColumnDefinition[] {
    const config = this.resolvedConfig as (TransportConfig & {
      columnDefinitions?: ColumnDefinition[];
    }) | null;
    return config?.columnDefinitions ?? [];
  }

  onRowsReceived(handler: (count: number) => void): Unsubscribe {
    this.rowsReceivedHandlers.add(handler);
    return () => this.rowsReceivedHandlers.delete(handler);
  }

  onSnapshotData(handler: (rows: readonly T[]) => void): Unsubscribe {
    this.snapshotHandlers.add(handler);
    return () => this.snapshotHandlers.delete(handler);
  }

  onTick(handler: (rows: readonly T[]) => void): Unsubscribe {
    this.tickHandlers.add(handler);
    return () => this.tickHandlers.delete(handler);
  }

  onError(handler: (error: Error) => void): Unsubscribe {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  onStatus(handler: (status: ProviderStatus, error?: string) => void): Unsubscribe {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  private wireHandle(handle: SubscribeHandle<T>): void {
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

    handle.onUpdate((rows) => {
      for (const handler of this.tickHandlers) handler(rows);
    });

    const deliverSnapshot = (rows: readonly T[]) => {
      this.snapshotRows = rows;
      for (const handler of this.snapshotHandlers) handler(rows);
    };

    handle.onReset((rows) => {
      deliverSnapshot(rows);
    });

    handle.onSnapshotCommit(deliverSnapshot);

    void handle.snapshot.catch((err: unknown) => {
      const error = err instanceof Error ? err : new Error(String(err));
      for (const handler of this.errorHandlers) handler(error);
    });
  }

  async stop(): Promise<void> {
    this.detach();
    this.clearHandlers();
  }

  private clearHandlers(): void {
    this.rowsReceivedHandlers.clear();
    this.snapshotHandlers.clear();
    this.tickHandlers.clear();
    this.errorHandlers.clear();
    this.statusHandlers.clear();
  }

  private detach(): void {
    this.handle?.unsubscribe();
    this.handle = null;
    this.snapshotRows = [];
  }

  private assertStarted(): void {
    if (!this.handle) {
      throw new Error(
        `[ProviderClientAdapter] Operation requires start() for providerId=${this.id}`,
      );
    }
  }
}
