/**
 * PlatformServicesHost — the platform-services SharedWorker's hub
 * (worker-split plan W1b): config catalog RPCs + AppData, and NOTHING
 * of the data plane. No provider slots, no transports, no SSRM WASM,
 * no tick loop — this event loop stays empty by construction, so a
 * tool window's `list-configs` or AppData attach never queues behind
 * a streaming blotter's ingest.
 *
 * Composed from the same modules the data hub used to host
 * (`hubCatalogRpc` handlers, {@link HubAppDataService},
 * {@link ConfigCatalogCache}) — moved, not rewritten. Data-plane
 * requests arriving here (nothing sends them) are ignored; the two
 * introspection RPCs answer honestly for THIS worker: zero providers,
 * nothing running.
 */
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import { ConfigCatalogCache } from '../../hub/ConfigCatalogCache.js';
import { isCatalogConfigRow } from '../../hub/isCatalogConfigRow.js';
import type { AppDataRequest, CatalogEvent, HubIntrospectSnapshot, Request } from '../protocol.js';
import { HubAppDataService } from './HubAppDataService.js';
import {
  handleConfigDelete,
  handleConfigInvalidate,
  handleConfigSave,
  handleGetConfig,
  handleHubIntrospect,
  handleHubReady,
  handleListConfigs,
  handleProviderRunning,
  type CatalogRpcContext,
} from './hubCatalogRpc.js';
import { buildIntrospectSnapshot } from './hubIntrospect.js';
import { SubscriberRegistry } from './SubscriberRegistry.js';
import type { PortLike } from './hubTypes.js';

export interface PlatformServicesHostOpts {
  configManager?: ConfigManager;
}

export class PlatformServicesHost {
  private readonly configManager: ConfigManager | null;
  private readonly configCatalog: ConfigCatalogCache | null;
  private readonly appDataSvc: HubAppDataService;
  private readonly connectedPorts = new Set<PortLike>();
  /** Empty forever — exists so introspect reuses the shared builder. */
  private readonly subscribers = new SubscriberRegistry();
  private readonly catalogRpcCtx: CatalogRpcContext;
  /** Config ids being written by this worker's own `config-save` / `config-delete` right now. */
  private readonly ownWrites = new Set<string>();
  private readonly unsubscribeChanges: (() => void) | null;

  constructor(opts: PlatformServicesHostOpts = {}) {
    this.configManager = opts.configManager ?? null;
    this.configCatalog = opts.configManager
      ? new ConfigCatalogCache(opts.configManager)
      : null;
    this.appDataSvc = new HubAppDataService(opts.configManager);
    // Invalidations originate where the write lands (W2): this worker's
    // ConfigManager notifies on its own writes AND relays other contexts'
    // IndexedDB writes over its cross-context channel, so no window has to
    // sync the catalog for it.
    this.unsubscribeChanges = opts.configManager?.onConfigChanged((configId) => this.onConfigChanged(configId)) ?? null;
    this.catalogRpcCtx = {
      catalog: this.configCatalog,
      configManager: this.configManager,
      ownWrites: this.ownWrites,
      broadcastCatalogEvent: (event) => this.broadcastCatalogEvent(event),
      resyncAppData: () => this.appDataSvc.resync(),
      buildIntrospect: () => this.buildIntrospectSnapshot(),
      isProviderRunning: () => false,
    };
  }

  /** This worker's diagnostics: catalog + AppData, zero providers. */
  buildIntrospectSnapshot(): HubIntrospectSnapshot {
    return buildIntrospectSnapshot({
      providers: new Map(),
      subscribers: this.subscribers,
      configCatalog: this.configCatalog,
      connectedPortCount: this.connectedPorts.size,
      appDataListenerCount: this.appDataSvc.listenerCount,
      appDataRows: this.appDataSvc.snapshotRows(),
    });
  }

  handleRequest(port: PortLike, req: Request): void {
    this.connectedPorts.add(port);
    switch (req.kind) {
      case 'hub-ready': handleHubReady(this.catalogRpcCtx, port, req); return;
      case 'get-config': void handleGetConfig(this.catalogRpcCtx, port, req); return;
      case 'list-configs': handleListConfigs(this.catalogRpcCtx, port, req); return;
      case 'config-invalidate': void handleConfigInvalidate(this.catalogRpcCtx, port, req); return;
      case 'config-save': void handleConfigSave(this.catalogRpcCtx, port, req); return;
      case 'config-delete': void handleConfigDelete(this.catalogRpcCtx, port, req); return;
      case 'hub-introspect': handleHubIntrospect(this.catalogRpcCtx, port, req); return;
      case 'provider-running': handleProviderRunning(this.catalogRpcCtx, port, req); return;
      case 'port-close': this.onPortClosed(port); return;
      default:
        // Data-plane traffic does not belong on this port; nothing sends
        // it here, and answering would fake a hub this worker is not.
        return;
    }
  }

  handleAppDataRequest(port: PortLike, req: AppDataRequest): void {
    this.connectedPorts.add(port);
    this.appDataSvc.handleRequest(port, req);
  }

  async hydrateCatalog(): Promise<void> {
    if (!this.configCatalog || this.configCatalog.isReady()) return;
    try {
      await this.configCatalog.loadAll();
      this.broadcastCatalogEvent({ kind: 'catalog-ready', full: true });
    } catch (err) {
      // Non-fatal — the catalog answers "not ready" until a retry succeeds.
      // eslint-disable-next-line no-console
      console.error('[platform-services] Config catalog hydrate failed', err);
    }
  }

  async hydrateAppData(userId = 'worker'): Promise<void> {
    await this.appDataSvc.hydrate(userId);
  }

  onPortClosed(port: PortLike): void {
    this.connectedPorts.delete(port);
    this.appDataSvc.onPortClosed(port);
  }

  dispose(): Promise<void> {
    this.unsubscribeChanges?.();
    for (const port of this.connectedPorts) this.appDataSvc.onPortClosed(port);
    this.connectedPorts.clear();
    return Promise.resolve();
  }

  /**
   * A config row changed somewhere. This worker's own RPC writes already
   * refreshed the catalog inline (skipped here via `ownWrites`); anything
   * else — a window on the no-worker fallback path writing IndexedDB
   * directly, another machine in REST mode — lands through the
   * ConfigManager's cross-context notifier. Catalog rows (data providers +
   * AppData) refresh and every port hears `catalog-ready`; other rows
   * (grid profiles, dock config) are ignored.
   */
  private onConfigChanged(configId: string): void {
    if (this.ownWrites.has(configId) || !this.configCatalog || !this.configManager) return;
    const catalog = this.configCatalog;
    const cm = this.configManager;
    void (async () => {
      const row = await cm.getConfig(configId);
      if (row ? !isCatalogConfigRow(row) : !catalog.get(configId)) return;
      await catalog.invalidate(configId);
      await this.appDataSvc.resync();
      this.broadcastCatalogEvent({ kind: 'catalog-ready', providerId: configId });
    })().catch((err: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[platform-services] catalog refresh after config change failed', err);
    });
  }

  private broadcastCatalogEvent(event: CatalogEvent): void {
    for (const port of this.connectedPorts) {
      try { port.postMessage(event); }
      catch { this.connectedPorts.delete(port); }
    }
  }
}
