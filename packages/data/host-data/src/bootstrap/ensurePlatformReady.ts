import { createConfigManager, isSeedIdentityCached, type ConfigManager } from '@wellsfargo-starui/core/host/config';
import {
  validatePlatformBootstrapConfig,
  resolveConfigServiceRestUrl,
  type PlatformBootstrapConfig,
} from './PlatformBootstrapConfig.js';
import { PlatformBootstrapConfigError } from './resolvePlatformBootstrap.js';
import {
  ensureDataServicesHub,
  warmHubConnection,
  type ResolvedDataServicesHubBundle,
} from '../hub/ensureDataServicesHub.js';
import { wireWorkerCatalogSync } from '../hub/wireWorkerCatalogSync.js';
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

export interface EnsurePlatformReadyOpts {
  /**
   * Worker script URL. OPTIONAL — omit it and the library resolves its own
   * bundled worker entry via `new URL(..., import.meta.url)`, which Vite,
   * webpack, Rollup and Parcel all handle with no consumer config. Pass a
   * URL only for CDN / OpenFin-manifest / plain-<script> hosting.
   */
  workerScriptUrl?: string;
  /**
   * Boot the Perspective SharedWorker entry rather than the default one.
   *
   * An app that opens a `stomp-perspective` / `mock-perspective` blotter must
   * set this: only that entry passes `loadPerspective`, so without it
   * `attachPerspective` refuses and the grid never leaves its pending state.
   * Opt-in because the Perspective asset embeds the engine's wasm as base64 —
   * see `CreateDataServicesWorkerOpts.perspective`.
   */
  perspective?: boolean;
  /** App-authored hook registry keyed by stable ids from app-config.json. */
  appDataBootstrapHooks?: AppDataBootstrapHookRegistry;
}

/** Result of {@link ensureConfigReady} — ConfigManager-only bootstrap. */
export interface ConfigReadyBundle {
  configManager: ConfigManager;
  /** True when seeding was skipped because a prior window already ran full bootstrap. */
  attachMode: boolean;
}

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
 * Attach (skip `seedIfEmpty`) when a prior window already completed a full
 * bootstrap for this deployment. Seeding lands in IndexedDB, which outlives
 * both the windows and the SharedWorker, so the cross-window warm marker is
 * a sufficient signal — no worker round-trip needed. If the marker is stale
 * (manually wiped DB with surviving localStorage), the worker's own
 * `seedIfEmpty` at hub boot re-seeds for data windows; config-only windows
 * see an empty store until then, same as a cold first launch.
 */
function resolveAttachMode(config: PlatformBootstrapConfig): boolean {
  if (config.seedConfigUrl && !isSeedIdentityCached(config.seedConfigUrl)) {
    return false;
  }
  return isPlatformWarm(config.appId);
}

/**
 * Lightweight bootstrap: resolve attach mode, init the window's ConfigManager.
 * Does NOT touch the SharedWorker hub — windows that only read/write config
 * rows (tool windows, editors) suspend on this instead of the full
 * {@link ensurePlatformReady}, skipping hub connect + AppData snapshot +
 * catalog preload. Idempotent per `appId`; {@link ensurePlatformReady} reuses
 * the same ConfigManager, so a window can upgrade from config-only to full
 * without a second IndexedDB connection.
 */
export function ensureConfigReady(
  config: PlatformBootstrapConfig,
): Promise<ConfigReadyBundle> {
  try {
    validateOrThrow(config);
  } catch (err) {
    // Reject (don't sync-throw) so the contract matches ensurePlatformReady.
    return Promise.reject(err);
  }

  const existing = configReadyPromises.get(config.appId);
  if (existing) return existing;

  const pending = bootstrapConfigOnce(config);
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
): Promise<ConfigReadyBundle> {
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
  return { configManager, attachMode };
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
  // Open the window's single SharedWorker connection now so the worker
  // spawns (and seeds, on cold start) while the main-thread ConfigManager
  // opens IndexedDB. The same connection is reused by the hub below —
  // one port per window, no throwaway probe connection.
  warmHubConnection({
    ...config,
    workerScriptUrl: opts.workerScriptUrl,
    perspective: opts.perspective,
  });

  const { configManager } = await ensureConfigReady(config);

  const bundle = await ensureDataServicesHub({
    ...config,
    workerScriptUrl: opts.workerScriptUrl,
    perspective: opts.perspective,
    mainThreadConfigManager: configManager,
  });

  wireWorkerCatalogSync(configManager, bundle.client);

  // Phase 2: return once config + hub connection are established. Full
  // hydration (AppData snapshot + catalog preload) settles in the background;
  // consumers paint the shell now and await `bundle.appDataReady` /
  // `bundle.catalogReady` only where they need it.
  void bundle.ready
    .then(() => {
      markPlatformReady();
      // Warm marker drives resolveAttachMode in later windows: bundle.ready
      // implies the worker catalog hydrated, which implies seeding completed.
      // Firing it only after full hydration keeps attach-mode correct.
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
