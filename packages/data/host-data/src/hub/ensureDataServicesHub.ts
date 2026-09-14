import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { PlatformBootstrapConfig } from '../bootstrap/PlatformBootstrapConfig.js';
import { resolveConfigServiceRestUrl } from '../bootstrap/PlatformBootstrapConfig.js';
import type { DataServices } from '../runtime/bootstrap/bootstrap.js';
import { bootstrapDataServices } from '../runtime/bootstrap/bootstrap.js';
import {
  createDataServicesWorker,
  createPlatformServicesWorker,
} from '../runtime/bootstrap/createDataServicesWorker.js';
import { SharedWorkerDataServicesClient } from '../runtime/client/SharedWorkerDataServicesClient.js';
import type { DataServicesHubBundle } from '../provider/IDataProvider.js';
import type { IDataProvider } from '../provider/IDataProvider.js';
import { ProviderClientAdapter } from '../provider/ProviderClientAdapter.js';
import {
  markAppDataReady,
  markCatalogReady,
  markHubConnected,
} from '../bootstrap/loadMarks.js';

/** Hub bundle including legacy {@link DataServices} handles for migration. */
export interface ResolvedDataServicesHubBundle extends DataServicesHubBundle {
  readonly client: DataServices['client'];
  /**
   * The platform-services worker's client (worker-split plan W1): config
   * catalog RPCs + AppData ride THIS port, isolated from the data plane.
   * Providers / SSRM stay on {@link client}.
   */
  readonly platformClient: SharedWorkerDataServicesClient;
  readonly appData: DataServices['appData'];
  readonly configManager: ConfigManager;
}

/** Options for {@link ensureDataServicesHub}. */
export interface EnsureHubOpts extends PlatformBootstrapConfig {
  /**
   * Worker script URL. OPTIONAL — omit it and the library resolves its own
   * bundled worker entry via `new URL(..., import.meta.url)`, which Vite,
   * webpack, Rollup and Parcel all handle with no consumer config. Pass a
   * URL only for CDN / OpenFin-manifest / plain-<script> hosting.
   */
  workerScriptUrl?: string;
  /** Main-thread ConfigManager (initialized before hub connect). */
  mainThreadConfigManager: ConfigManager;
}

/**
 * The window's SharedWorker ports for one `appId` — TWO workers since the
 * worker split (plan W1): the data hub (providers, CSRM deltas, SSRM) and
 * the platform-services worker (config catalog + AppData). One client per
 * port; the same client class serves both (it is port-generic — only the
 * traffic differs).
 */
export interface HubConnection {
  worker: SharedWorker;
  client: SharedWorkerDataServicesClient;
  platformWorker: SharedWorker;
  platformClient: SharedWorkerDataServicesClient;
}

/** Options for {@link warmHubConnection} — hub opts minus the ConfigManager. */
export type WarmHubConnectionOpts = PlatformBootstrapConfig & {
  /** Optional — see EnsureHubOpts.workerScriptUrl. */
  workerScriptUrl?: string;
};

/** The window's port to the platform-services worker alone (tool windows need nothing else). */
export interface PlatformConnection {
  worker: SharedWorker;
  client: SharedWorkerDataServicesClient;
}

const hubPromises = new Map<string, Promise<ResolvedDataServicesHubBundle>>();
const hubConnections = new Map<string, HubConnection>();
const platformConnections = new Map<string, PlatformConnection>();

function workerOptsOf(opts: WarmHubConnectionOpts) {
  return {
    appName: opts.appId,
    configServiceRestUrl: resolveConfigServiceRestUrl(opts),
    appId: opts.appId,
    userId: opts.userId,
    seedConfigUrl: opts.seedConfigUrl,
    seedConfigReload: opts.seedConfigReload,
  };
}

/**
 * Get or create this window's port to the platform-services worker — the
 * sole seeder and the catalog + AppData server. Spawned FIRST and on its
 * own, so a config-only window (tool window, editor) never spawns the data
 * worker at all (worker-split W2: thin windows).
 */
function getOrCreatePlatformConnection(opts: WarmHubConnectionOpts): PlatformConnection {
  const existing = platformConnections.get(opts.appId);
  if (existing) return existing;
  const worker = createPlatformServicesWorker(opts.workerScriptUrl, workerOptsOf(opts));
  const connection: PlatformConnection = {
    worker,
    client: new SharedWorkerDataServicesClient(worker.port),
  };
  platformConnections.set(opts.appId, connection);
  return connection;
}

/**
 * Get or create this window's TWO SharedWorker connections for `appId`.
 * One MessagePort per worker per window: the hub bundle wraps these
 * clients, so callers that connect early (to overlap worker spawn with
 * other init) don't leave throwaway ports behind.
 */
function getOrCreateHubConnection(opts: WarmHubConnectionOpts): HubConnection {
  const existing = hubConnections.get(opts.appId);
  if (existing) return existing;

  const platform = getOrCreatePlatformConnection(opts);
  // Data worker second; its ConfigManager attaches read-only (W1c).
  const worker = createDataServicesWorker(opts.workerScriptUrl, workerOptsOf(opts));
  const connection: HubConnection = {
    worker,
    client: new SharedWorkerDataServicesClient(worker.port),
    platformWorker: platform.worker,
    platformClient: platform.client,
  };
  hubConnections.set(opts.appId, connection);
  return connection;
}

/**
 * Fire-and-forget spawn of BOTH workers so they boot (and the platform one
 * seeds, on cold start) while the caller does other init. Never throws —
 * environments without SharedWorker surface the real error later from
 * {@link ensureDataServicesHub}.
 */
export function warmHubConnection(opts: WarmHubConnectionOpts): void {
  try {
    getOrCreateHubConnection(opts);
  } catch {
    /* hub connect will surface the real error */
  }
}

/**
 * Spawn / reuse the platform-services connection only. `null` where
 * SharedWorker is unavailable — the caller falls back to a self-contained
 * main-thread bootstrap.
 */
export function warmPlatformConnection(opts: WarmHubConnectionOpts): PlatformConnection | null {
  try {
    return getOrCreatePlatformConnection(opts);
  } catch {
    return null;
  }
}

/** The two hydration signals, resolved in parallel; `ready` = both. */
interface HubReadiness {
  ready: Promise<void>;
  appDataReady: Promise<void>;
  catalogReady: Promise<void>;
}

function buildReadiness(services: DataServices, platformClient: SharedWorkerDataServicesClient): HubReadiness {
  const appDataReady = (async () => {
    await services.ready;
    markAppDataReady();
  })();
  // Catalog answers come from the platform-services worker — the whole
  // point of the split: this readiness is independent of data-plane load.
  const catalogReady = (async () => {
    await platformClient.waitForCatalogReady();
    markCatalogReady();
  })();
  const ready = Promise.all([appDataReady, catalogReady]).then(() => undefined);
  // These may go unawaited (Phase 2: the bundle is returned before full
  // hydration). Attach no-op rejection handlers so a hydration failure can't
  // surface as an unhandled rejection — awaiters still observe the rejection.
  appDataReady.catch(() => {});
  catalogReady.catch(() => {});
  ready.catch(() => {});
  return { ready, appDataReady, catalogReady };
}

function adaptDataServicesToHubBundle(
  services: DataServices,
  appId: string,
  readiness: HubReadiness,
  platformClient: SharedWorkerDataServicesClient,
): ResolvedDataServicesHubBundle {
  return {
    ready: readiness.ready,
    appDataReady: readiness.appDataReady,
    catalogReady: readiness.catalogReady,
    getProvider(providerId: string): IDataProvider {
      return new ProviderClientAdapter({
        client: services.client,
        catalogClient: platformClient,
        providerId,
      });
    },
    stopProvider(providerId: string): Promise<void> {
      services.client.stop(providerId);
      return Promise.resolve();
    },
    dispose(): void {
      services.dispose();
      hubPromises.delete(appId);
      hubConnections.delete(appId);
      platformConnections.delete(appId);
    },
    client: services.client,
    platformClient,
    appData: services.appData,
    configManager: services.configManager,
  };
}

async function bootstrapHubOnce(opts: EnsureHubOpts): Promise<ResolvedDataServicesHubBundle> {
  const connection = getOrCreateHubConnection(opts);
  const services = bootstrapDataServices({
    appName: opts.appId,
    worker: connection.worker,
    client: connection.client,
    // AppData attaches to the PLATFORM-services worker (worker-split plan
    // W1): its snapshot and every set/upsert ride the low-frequency plane.
    appDataClient: connection.platformClient,
    configManager: opts.mainThreadConfigManager,
    userId: opts.userId,
  });
  markHubConnected();
  // Return as soon as the hub connection is established — the AppData snapshot
  // and catalog preload resolve in the background via the readiness promises.
  const readiness = buildReadiness(services, connection.platformClient);
  return adaptDataServicesToHubBundle(services, opts.appId, readiness, connection.platformClient);
}

/**
 * Lazy hub entry — one SharedWorker + client bundle per `appId` per window.
 * Resolves once the hub connection is established; the AppData mirror snapshot
 * and worker catalog preload settle in the background via the bundle's
 * `appDataReady` / `catalogReady` / `ready` promises.
 */
export function ensureDataServicesHub(opts: EnsureHubOpts): Promise<ResolvedDataServicesHubBundle> {
  const existing = hubPromises.get(opts.appId);
  if (existing) return existing;

  const pending = bootstrapHubOnce(opts);
  hubPromises.set(opts.appId, pending);
  pending.catch(() => {
    if (hubPromises.get(opts.appId) === pending) {
      hubPromises.delete(opts.appId);
    }
  });

  return pending;
}

/** Test-only — clears hub singleton registry. */
export function _resetEnsureDataServicesHubForTests(): void {
  hubPromises.clear();
  for (const connection of hubConnections.values()) {
    try { connection.client.close(); } catch { /* best-effort */ }
  }
  for (const connection of platformConnections.values()) {
    try { connection.client.close(); } catch { /* best-effort */ }
  }
  hubConnections.clear();
  platformConnections.clear();
}
