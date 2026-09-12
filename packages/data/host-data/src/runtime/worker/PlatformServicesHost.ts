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
import type { AppDataRequest, CatalogEvent, HubIntrospectSnapshot, Request } from '../protocol.js';
import { HubAppDataService } from './HubAppDataService.js';
import {
  handleConfigInvalidate,
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
  private readonly configCatalog: ConfigCatalogCache | null;
  private readonly appDataSvc: HubAppDataService;
  private readonly connectedPorts = new Set<PortLike>();
  /** Empty forever — exists so introspect reuses the shared builder. */
  private readonly subscribers = new SubscriberRegistry();
  private readonly catalogRpcCtx: CatalogRpcContext;

  constructor(opts: PlatformServicesHostOpts = {}) {
    this.configCatalog = opts.configManager
      ? new ConfigCatalogCache(opts.configManager)
      : null;
    this.appDataSvc = new HubAppDataService(opts.configManager);
    this.catalogRpcCtx = {
      catalog: this.configCatalog,
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
    for (const port of this.connectedPorts) this.appDataSvc.onPortClosed(port);
    this.connectedPorts.clear();
    return Promise.resolve();
  }

  private broadcastCatalogEvent(event: CatalogEvent): void {
    for (const port of this.connectedPorts) {
      try { port.postMessage(event); }
      catch { this.connectedPorts.delete(port); }
    }
  }
}
