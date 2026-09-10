import type {
  ColumnDefinition,
  IabChannelBridgeProviderConfig,
  ProviderConfig,
} from '@wellsfargo-starui/types';
import type { ProviderStatus } from '../runtime/protocol.js';
import type { IDataProvider, Unsubscribe } from './IDataProvider.js';
import type { ProviderCapabilities } from './ProviderCapabilities.js';
import {
  CHANNEL_HUB_ACTIONS,
  type ChannelHubAttachResult,
  type ChannelHubEventPayload,
  type ChannelHubReply,
  type ChannelHubRefreshResult,
  resolveChannelHubName,
} from '../channel/channelHubProtocol.js';

/** Minimal OpenFin Channel client surface (injected for tests). */
export interface ChannelHubClient {
  dispatch(action: string, payload: unknown): Promise<unknown>;
  register(action: string, fn: (payload: unknown) => unknown): boolean;
  disconnect(): Promise<void>;
}

export type ConnectChannelHubClient = (channelName: string) => Promise<ChannelHubClient>;

export interface ChannelBridgeClientAdapterOpts {
  providerId: string;
  inlineCfg?: ProviderConfig;
  connect?: ConnectChannelHubClient;
  /** Resolve saved bridge row from catalog (same as {@link ProviderClientAdapter}). */
  loadProviderConfig?: (providerId: string) => Promise<ProviderConfig | null>;
}

declare const fin: {
  InterApplicationBus?: {
    Channel?: { connect(name: string): Promise<ChannelHubClient> };
  };
} | undefined;

async function defaultConnect(channelName: string): Promise<ChannelHubClient> {
  if (typeof fin === 'undefined' || !fin.InterApplicationBus?.Channel) {
    throw new Error(
      '[ChannelBridgeClientAdapter] OpenFin runtime not present — IAB channel bridge requires OpenFin.',
    );
  }
  return fin.InterApplicationBus.Channel.connect(channelName);
}

function unwrapReply<T>(raw: unknown): T {
  const reply = raw as ChannelHubReply<T>;
  if (!reply || typeof reply !== 'object' || !('ok' in reply)) {
    throw new Error('[ChannelBridgeClientAdapter] Invalid hub reply');
  }
  if (!reply.ok) {
    throw new Error(reply.error);
  }
  return reply.data;
}

/**
 * {@link IDataProvider} that proxies attach/detach to a dock-hosted hub
 * over OpenFin InterApplicationBus Channel (cross-origin safe).
 */
export class ChannelBridgeClientAdapter<T = Record<string, unknown>>
  implements IDataProvider<T>
{
  readonly id: string;

  private readonly inlineCfg?: ProviderConfig;
  private readonly connect: ConnectChannelHubClient;
  private readonly loadProviderConfig?: (providerId: string) => Promise<ProviderConfig | null>;
  private bridgeCfg: IabChannelBridgeProviderConfig | null = null;
  private upstreamConfig: ProviderConfig | null = null;
  private client: ChannelHubClient | null = null;
  private subscriptionId: string | null = null;
  private snapshotRows: readonly T[] = [];

  private readonly rowsReceivedHandlers = new Set<(count: number) => void>();
  private readonly snapshotHandlers = new Set<(rows: readonly T[]) => void>();
  private readonly tickHandlers = new Set<(rows: readonly T[]) => void>();
  private readonly errorHandlers = new Set<(error: Error) => void>();
  private readonly statusHandlers = new Set<(status: ProviderStatus, error?: string) => void>();

  constructor(opts: ChannelBridgeClientAdapterOpts) {
    this.id = opts.providerId;
    this.inlineCfg = opts.inlineCfg;
    this.connect = opts.connect ?? defaultConnect;
    this.loadProviderConfig = opts.loadProviderConfig;
  }

  get capabilities(): ProviderCapabilities {
    return {
      providerType: 'iab-channel-bridge',
      streaming: true,
      realtime: true,
      supportsRefresh: true,
      supportsRestart: true,
    };
  }

  async start(): Promise<void> {
    if (this.subscriptionId) return;

    const bridge = await this.resolveBridgeCfg();
    this.bridgeCfg = bridge;
    await this.attachToHub(bridge);
  }

  async refresh(): Promise<void> {
    this.assertStarted();
    const raw = await this.client!.dispatch(CHANNEL_HUB_ACTIONS.REFRESH, {
      subscriptionId: this.subscriptionId,
    });
    const data = unwrapReply<ChannelHubRefreshResult>(raw);
    this.applySnapshot(data.snapshot as readonly T[]);
  }

  async restart(extra?: Record<string, unknown>): Promise<void> {
    await this.detachFromHub();
    const bridge = await this.resolveBridgeCfg();
    await this.attachToHub(bridge, extra);
  }

  getData(): readonly T[] {
    return this.snapshotRows;
  }

  getConfig(): ProviderConfig {
    if (this.upstreamConfig) return this.upstreamConfig;
    if (this.bridgeCfg) return this.bridgeCfg;
    throw new Error(
      `[ChannelBridgeClientAdapter] getConfig() before start() for providerId=${this.id}`,
    );
  }

  getColumnDefs(): readonly ColumnDefinition[] {
    const config = this.getConfig() as ProviderConfig & {
      columnDefinitions?: ColumnDefinition[];
    };
    return config.columnDefinitions ?? [];
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

  async stop(): Promise<void> {
    await this.detachFromHub();
    this.clearHandlers();
  }

  private async resolveBridgeCfg(): Promise<IabChannelBridgeProviderConfig> {
    if (this.inlineCfg?.providerType === 'iab-channel-bridge') {
      return this.inlineCfg;
    }
    if (this.bridgeCfg) return this.bridgeCfg;
    if (this.loadProviderConfig) {
      const cfg = await this.loadProviderConfig(this.id);
      if (cfg?.providerType === 'iab-channel-bridge') {
        this.bridgeCfg = cfg;
        return cfg;
      }
    }
    throw new Error(
      `[ChannelBridgeClientAdapter] Missing iab-channel-bridge config for providerId=${this.id}. ` +
        'Pass inlineCfg or save a bridge row in the catalog.',
    );
  }

  private async attachToHub(
    bridge: IabChannelBridgeProviderConfig,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    const channelName = resolveChannelHubName(bridge.channelName);
    if (!this.client) {
      this.client = await this.connect(channelName);
      this.client.register(CHANNEL_HUB_ACTIONS.HUB_EVENT, (payload) => {
        this.handleHubEvent(payload as ChannelHubEventPayload);
        return undefined;
      });
    }
    const raw = await this.client.dispatch(CHANNEL_HUB_ACTIONS.ATTACH, {
      providerId: bridge.upstreamProviderId,
      extra,
    });
    const data = unwrapReply<ChannelHubAttachResult>(raw);
    this.subscriptionId = data.subscriptionId;
    this.upstreamConfig = data.config;
    this.applySnapshot(data.snapshot as readonly T[]);
    for (const handler of this.statusHandlers) {
      handler(data.status);
    }
  }

  private async detachFromHub(): Promise<void> {
    if (this.client && this.subscriptionId) {
      try {
        await this.client.dispatch(CHANNEL_HUB_ACTIONS.DETACH, {
          subscriptionId: this.subscriptionId,
        });
      } catch {
        /* best-effort */
      }
    }
    if (this.client) {
      await this.client.disconnect().catch(() => undefined);
    }
    this.client = null;
    this.subscriptionId = null;
    this.snapshotRows = [];
  }

  private handleHubEvent(payload: ChannelHubEventPayload): void {
    if (!this.subscriptionId || payload.subscriptionId !== this.subscriptionId) return;

    switch (payload.type) {
      case 'delta': {
        if (payload.replace) {
          this.applySnapshot(payload.rows as readonly T[]);
        } else {
          for (const handler of this.tickHandlers) {
            handler(payload.rows as readonly T[]);
          }
        }
        break;
      }
      case 'status': {
        for (const handler of this.statusHandlers) {
          handler(payload.status, payload.error);
        }
        if (payload.status === 'error') {
          const err = new Error(payload.error ?? 'Provider error');
          for (const handler of this.errorHandlers) handler(err);
        }
        break;
      }
      case 'rows-received': {
        for (const handler of this.rowsReceivedHandlers) handler(payload.count);
        break;
      }
      case 'error': {
        const err = new Error(payload.message);
        for (const handler of this.errorHandlers) handler(err);
        break;
      }
      default:
        break;
    }
  }

  private applySnapshot(rows: readonly T[]): void {
    this.snapshotRows = rows;
    for (const handler of this.snapshotHandlers) handler(rows);
  }

  private clearHandlers(): void {
    this.rowsReceivedHandlers.clear();
    this.snapshotHandlers.clear();
    this.tickHandlers.clear();
    this.errorHandlers.clear();
    this.statusHandlers.clear();
  }

  private assertStarted(): void {
    if (!this.client || !this.subscriptionId) {
      throw new Error(
        `[ChannelBridgeClientAdapter] Operation requires start() for providerId=${this.id}`,
      );
    }
  }
}
