/**
 * warmPlatform() — the one-line app-load warm-up (worker-split plan W2).
 *
 * Fire-and-forget at app entry / OpenFin dock load: spawns both
 * SharedWorkers, hydrates catalog + AppData, and starts the named
 * providers — all off the UI thread — so the first grid that mounts
 * attaches to a RUNNING provider and paints from the worker cache instead
 * of paying the whole platform boot on its own first paint.
 *
 * It IS `ensurePlatformReady` plus provider warm-up under a deliberate
 * name, merged with the lazy grid-mount path through the same per-`appId`
 * promise maps: whichever caller runs first owns the flight, the other
 * attaches to it, nothing double-boots, and repeat calls are no-ops.
 *
 * Provider warm-up is a STATS-mode attach on the data client: the hub
 * creates the provider (cfg resolved by its lifecycle read) and keeps it
 * alive under its normal idle rules, but encodes and broadcasts nothing
 * until a data listener appears — a hidden dock window pays no fan-out.
 * When the warming window closes, its stats subscription leaves and the
 * provider auto-stops unless a grid attached meanwhile: exactly the lazy
 * fallback, untouched.
 */

import type { PlatformBootstrapConfig } from './PlatformBootstrapConfig.js';
import { ensurePlatformReady, type EnsurePlatformReadyOpts } from './ensurePlatformReady.js';
import type { ResolvedDataServicesHubBundle } from '../hub/ensureDataServicesHub.js';

export interface WarmPlatformOpts extends EnsurePlatformReadyOpts {
  /**
   * Providers to start once the hub is up. `'autoStart'` starts every
   * catalog row whose transport cfg carries `autoStart: true`; an explicit
   * id list starts exactly those; omitted → workers + hydrate only.
   */
  providers?: 'autoStart' | readonly string[];
}

/** Provider ids already warmed per `appId` — repeat calls attach nothing twice. */
const warmedProviders = new Map<string, Set<string>>();

/**
 * Never rejects: a failed warm-up is logged, and the lazy path still boots
 * everything when the first grid mounts.
 */
export function warmPlatform(
  config: PlatformBootstrapConfig,
  opts: WarmPlatformOpts = {},
): Promise<void> {
  return warm(config, opts).catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.warn(`[warmPlatform:${config.appId}] warm-up failed — lazy boot still covers it:`, err);
  });
}

async function warm(config: PlatformBootstrapConfig, opts: WarmPlatformOpts): Promise<void> {
  const bundle = await ensurePlatformReady(config, opts);
  if (!opts.providers) return;
  // Provider rows are served by the platform-services worker; wait for its
  // catalog so `'autoStart'` sees every row and a cfg-free attach resolves.
  await bundle.catalogReady;
  const ids = await resolveWarmProviderIds(bundle, opts.providers);
  for (const providerId of ids) warmProvider(config.appId, bundle, providerId);
}

async function resolveWarmProviderIds(
  bundle: ResolvedDataServicesHubBundle,
  providers: 'autoStart' | readonly string[],
): Promise<string[]> {
  if (providers !== 'autoStart') return [...providers];
  const rows = await bundle.platformClient.listProviderConfigs();
  return rows
    .filter((row) => Boolean(row.providerId) && (row.config as { autoStart?: boolean } | undefined)?.autoStart === true)
    .map((row) => row.providerId as string);
}

function warmProvider(appId: string, bundle: ResolvedDataServicesHubBundle, providerId: string): void {
  let warmed = warmedProviders.get(appId);
  if (!warmed) {
    warmed = new Set();
    warmedProviders.set(appId, warmed);
  }
  if (warmed.has(providerId)) return;
  warmed.add(providerId);
  bundle.client.attachStats(providerId, { onStats: () => undefined });
}

/** Test-only — forget which providers were warmed. */
export function _resetWarmPlatformForTests(): void {
  warmedProviders.clear();
}
