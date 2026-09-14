import { createConfigManager, isSeedIdentityCached, type ConfigManager, type ConfigWriter } from '@wellsfargo-starui/core/host/config';
import {
  validatePlatformBootstrapConfig,
  resolveConfigServiceRestUrl,
  type PlatformBootstrapConfig,
} from './PlatformBootstrapConfig.js';
import { PlatformBootstrapConfigError } from './resolvePlatformBootstrap.js';
import {
  ensureDataServicesHub,
  warmHubConnection,
  warmPlatformConnection,
  type PlatformConnection,
  type ResolvedDataServicesHubBundle,
} from '../hub/ensureDataServicesHub.js';
import type { SharedWorkerDataServicesClient } from '../runtime/client/SharedWorkerDataServicesClient.js';
import {
  _resetPlatformWarmSessionForTests,
  isPlatformWarm,
  markPlatformWarm,
} from './platformWarmSession.js';
import { markConfigReady, markPlatformReady } from './loadMarks.js';
import {
  runAppDataBootstrap,
  type AppDataBootstrapHookRegistry,
} from './appDataBootstrap.js';
import { acquireBackgroundFreezeExemption } from './freezeExemptionLock.js';

export interface EnsureConfigReadyOpts {
  /**
   * Worker script URL. OPTIONAL — omit it and the library resolves its own
   * bundled worker entry via `new URL(..., import.meta.url)`, which Vite,
   * webpack, Rollup and Parcel all handle with no consumer config. Pass a
   * URL only for CDN / OpenFin-manifest / plain-<script> hosting.
   */
  workerScriptUrl?: string;
}

export interface EnsurePlatformReadyOpts extends EnsureConfigReadyOpts {
  /** App-authored hook registry keyed by stable ids from app-config.json. */
  appDataBootstrapHooks?: AppDataBootstrapHookRegistry;
}

/** Result of {@link ensureConfigReady} — the window's config tier. */
export interface ConfigReadyBundle {
  configManager: ConfigManager;
  /** True when this window ran no seed of its own (always, on the services-worker path). */
  attachMode: boolean;
  /**
   * The platform-services worker's client that gated this window and now
   * carries its config writes (worker-split W2). `null` only on the
   * no-SharedWorker fallback, where the window bootstrapped itself.
   */
  platformClient: SharedWorkerDataServicesClient | null;
}

/**
 * How long a window waits for the platform-services worker's catalog
 * before proceeding anyway. The worker answers `hub-ready` within
 * milliseconds of booting; this backstop only trips when the worker cannot
 * boot at all, and then a degraded window beats a hung one.
 */
export const CONFIG_READY_DEADLINE_MS = 20_000;

const configReadyPromises = new Map<string, Promise<ConfigReadyBundle>>();
const platformPromises = new Map<string, Promise<ResolvedDataServicesHubBundle>>();

function validateOrThrow(config: PlatformBootstrapConfig): void {
  const validation = validatePlatformBootstrapConfig(config);
  if (!validation.valid) {
    throw new PlatformBootstrapConfigError(
      `Invalid platform bootstrap config: ${validation.errors.join('; ')}`,
      validation.errors,
      validation.warnings,
    );
  }
}

/**
 * Thin-window config bootstrap (worker-split plan W2). A window does not
 * LOAD config — it REQUESTS it: this connects the platform-services worker
 * port (spawning that worker first, and nothing else), opens the shared
 * IndexedDB read-only, and gates on the worker's catalog — which implies
 * the worker seeded, so the window never seeds, never fetches a seed
 * bundle and never takes the seed lock. Config writes from this window ride
 * the same port (`ConfigWriter` → `config-save` / `config-delete`), so the
 * services worker is the only context that writes config rows.
 *
 * Windows that only read/write config rows (tool windows, editors) suspend
 * on this instead of the full {@link ensurePlatformReady}, skipping the data
 * worker entirely. Idempotent per `appId`; {@link ensurePlatformReady}
 * reuses the same ConfigManager and port.
 *
 * Where SharedWorker is unavailable the window falls back to bootstrapping
 * itself (attach when a prior window seeded, else seed), unchanged.
 */
export function ensureConfigReady(
  config: PlatformBootstrapConfig,
  opts: EnsureConfigReadyOpts = {},
): Promise<ConfigReadyBundle> {
  try {
    validateOrThrow(config);
  } catch (err) {
    // Reject (don't sync-throw) so the contract matches ensurePlatformReady.
    return Promise.reject(err);
  }

  const existing = configReadyPromises.get(config.appId);
  if (existing) return existing;

  const pending = bootstrapConfigOnce(config, opts);
  configReadyPromises.set(config.appId, pending);
  pending.catch(() => {
    if (configReadyPromises.get(config.appId) === pending) {
      configReadyPromises.delete(config.appId);
    }
  });

  return pending;
}

async function bootstrapConfigOnce(
  config: PlatformBootstrapConfig,
  opts: EnsureConfigReadyOpts,
): Promise<ConfigReadyBundle> {
  const platform = warmPlatformConnection({ ...config, workerScriptUrl: opts.workerScriptUrl });
  if (!platform) return bootstrapConfigLocally(config);

  const configManager = createConfigManager({
    appId: config.appId,
    identity: { userId: config.userId, displayName: config.userId },
    configServiceRestUrl: resolveConfigServiceRestUrl(config),
    writer: platformConfigWriter(platform.client),
  });
  // Both in parallel: the window's read-only IndexedDB open, and the
  // services worker's "catalog hydrated" — the only seed signal a thin
  // window needs.
  await Promise.all([
    configManager.init({ mode: 'attach' }),
    awaitServicesWorker(platform, config.appId),
  ]);
  markConfigReady();
  return { configManager, attachMode: true, platformClient: platform.client };
}

/** The window's config writes become platform-services RPCs. */
function platformConfigWriter(client: SharedWorkerDataServicesClient): ConfigWriter {
  return {
    saveConfig: (row, options) => client.saveConfigRow(row, options),
    deleteConfig: (configId) => client.deleteConfigRow(configId),
  };
}

async function awaitServicesWorker(platform: PlatformConnection, appId: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), CONFIG_READY_DEADLINE_MS);
  });
  const outcome = await Promise.race([platform.client.waitForCatalogReady().then(() => 'ready' as const), deadline]);
  clearTimeout(timer);
  if (outcome === 'timeout') {
    // eslint-disable-next-line no-console
    console.warn(
      `[ensureConfigReady:${appId}] platform-services worker did not report its catalog within `
        + `${CONFIG_READY_DEADLINE_MS}ms — continuing; config reads may be empty until it boots.`,
    );
  }
}

/**
 * No-SharedWorker fallback: the window is its own platform. Attach (skip
 * `seedIfEmpty`) when a prior window already completed a full bootstrap for
 * this deployment — seeding lands in IndexedDB, which outlives windows, so
 * the cross-window warm marker is a sufficient signal. If the marker is
 * stale (manually wiped DB with surviving localStorage) the window sees an
 * empty store until a full bootstrap re-seeds, same as a cold first launch.
 */
async function bootstrapConfigLocally(config: PlatformBootstrapConfig): Promise<ConfigReadyBundle> {
  const attachMode = resolveAttachMode(config);
  const configManager = createConfigManager({
    appId: config.appId,
    identity: { userId: config.userId, displayName: config.userId },
    configServiceRestUrl: resolveConfigServiceRestUrl(config),
    seedConfigUrl: attachMode ? undefined : config.seedConfigUrl,
    seedConfigReload: attachMode ? undefined : config.seedConfigReload,
  });
  await configManager.init(attachMode ? { mode: 'attach' } : undefined);
  markConfigReady();
  return { configManager, attachMode, platformClient: null };
}

function resolveAttachMode(config: PlatformBootstrapConfig): boolean {
  if (config.seedConfigUrl && !isSeedIdentityCached(config.seedConfigUrl)) {
    return false;
  }
  return isPlatformWarm(config.appId);
}

/**
 * Resolve platform identity, init ConfigManager, spawn/connect SharedWorker hub.
 * Idempotent per `appId` within the current window.
 */
export async function ensurePlatformReady(
  config: PlatformBootstrapConfig,
  opts: EnsurePlatformReadyOpts = {},
): Promise<ResolvedDataServicesHubBundle> {
  validateOrThrow(config);

  // Any window running the data platform is a live-data window and must
  // not be frozen while hidden/minimized (see freezeExemptionLock.ts).
  acquireBackgroundFreezeExemption();

  const existing = platformPromises.get(config.appId);
  if (existing) return existing;

  const pending = bootstrapPlatformOnce(config, opts);
  platformPromises.set(config.appId, pending);
  pending.catch(() => {
    if (platformPromises.get(config.appId) === pending) {
      platformPromises.delete(config.appId);
    }
  });

  return pending;
}

async function bootstrapPlatformOnce(
  config: PlatformBootstrapConfig,
  opts: EnsurePlatformReadyOpts,
): Promise<ResolvedDataServicesHubBundle> {
  // Spawn BOTH workers now — the platform-services worker first (the
  // config tier below gates on it alone), the data worker behind it so it
  // boots while the window's config tier resolves. The same ports are
  // reused by the hub below — one port per worker per window.
  warmHubConnection({ ...config, workerScriptUrl: opts.workerScriptUrl });

  const { configManager } = await ensureConfigReady(config, { workerScriptUrl: opts.workerScriptUrl });

  const bundle = await ensureDataServicesHub({
    ...config,
    workerScriptUrl: opts.workerScriptUrl,
    mainThreadConfigManager: configManager,
  });

  // Phase 2: return once config + hub connection are established. Full
  // hydration (AppData snapshot + catalog preload) settles in the background;
  // consumers paint the shell now and await `bundle.appDataReady` /
  // `bundle.catalogReady` only where they need it.
  void bundle.ready
    .then(() => {
      markPlatformReady();
      // Warm marker drives the no-SharedWorker fallback's attach mode in
      // later windows: bundle.ready implies the worker catalog hydrated,
      // which implies seeding completed.
      markPlatformWarm(config.appId);
    })
    .catch(() => {
      /* hydration failure already surfaces to awaiters of bundle.ready */
    });

  if (config.appDataBootstrap && opts.appDataBootstrapHooks) {
    const { appDataBootstrap } = config;
    const { appDataBootstrapHooks } = opts;
    // AppData hooks need the mirror hydrated — run them off appDataReady in the
    // background so they don't gate the window's first paint.
    void bundle.appDataReady
      .then(() =>
        runAppDataBootstrap({
          manifest: appDataBootstrap,
          registry: appDataBootstrapHooks,
          appId: config.appId,
          userId: config.userId,
          appData: bundle.appData,
          configManager: bundle.configManager,
        }),
      )
      .catch((err) => {
        console.error(`[ensurePlatformReady:${config.appId}] AppData bootstrap failed:`, err);
      });
  }

  return bundle;
}

/** Test-only — clears platform singleton registry. */
export function _resetEnsurePlatformReadyForTests(): void {
  configReadyPromises.clear();
  platformPromises.clear();
  _resetPlatformWarmSessionForTests();
}
