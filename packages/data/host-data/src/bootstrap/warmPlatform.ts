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
import type { ProviderStats } from '../runtime/protocol.js';

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
  if (!opts.providers) {
    // Worth saying: it separates "the dock was never asked to warm anything"
    // from "it asked, and no row was flagged" — which look identical otherwise.
    trace(`${config.appId}: no provider warm-up requested (workers + hydrate only)`);
    return;
  }
  // Provider rows are served by the platform-services worker; wait for its
  // catalog so `'autoStart'` sees every row and a cfg-free attach resolves.
  await bundle.catalogReady;
  const picked = await resolveWarmProviders(bundle, opts.providers, config.appId);
  const warmed = warmedProviders.get(config.appId);
  const fresh = picked.filter((row) => !warmed?.has(row.providerId));
  const already = picked.length - fresh.length;
  trace(
    `${config.appId}: starting ${fresh.length} of ${picked.length} provider(s)`
    + (already > 0 ? ` (${already} already warm)` : ''),
  );
  for (const row of picked) warmProvider(config.appId, bundle, row);
}

/** The catalog rows to warm, in the order they will be started. */
interface WarmRow {
  providerId: string;
  providerType?: string;
}

async function resolveWarmProviders(
  bundle: ResolvedDataServicesHubBundle,
  providers: 'autoStart' | readonly string[],
  appId: string,
): Promise<WarmRow[]> {
  if (providers !== 'autoStart') {
    trace(`${appId}: warming an explicit id list: ${providers.join(', ') || '(empty)'}`);
    return providers.map((providerId) => ({ providerId }));
  }
  const rows = await bundle.platformClient.listProviderConfigs();
  const eligible = rows.filter((row) => Boolean(row.providerId) && row.config?.autoStart === true);
  // The denominator matters: it separates "only one row is flagged" from
  // "the catalog read came back short".
  trace(`${appId}: ${eligible.length} of ${rows.length} catalog provider(s) marked autoStart`);
  for (const row of eligible) {
    trace(`${appId}: autoStart → ${row.providerId} (${row.config?.providerType ?? 'unknown type'})`);
  }
  return eligible.map((row) => ({
    providerId: row.providerId as string,
    providerType: row.config?.providerType as string | undefined,
  }));
}

function warmProvider(appId: string, bundle: ResolvedDataServicesHubBundle, row: WarmRow): void {
  let warmed = warmedProviders.get(appId);
  if (!warmed) {
    warmed = new Set();
    warmedProviders.set(appId, warmed);
  }
  if (warmed.has(row.providerId)) return;
  warmed.add(row.providerId);
  const label = row.providerType ? `${row.providerId} (${row.providerType})` : row.providerId;
  const startedAt = Date.now();
  trace(`${label}: attaching in stats mode`);
  bundle.client.attachStats(row.providerId, { onStats: traceStartup(label, startedAt) });
}

/**
 * The warm-up attach used to discard its stats. They are the only view of
 * what an auto-started provider actually DOES — so report the milestones
 * once each: the hub answering, the snapshot landing, the first error.
 */
function traceStartup(label: string, startedAt: number): (stats: ProviderStats) => void {
  let sawStats = false;
  let sawRows = false;
  let lastError: string | undefined;
  return (stats: ProviderStats) => {
    if (!sawStats) {
      sawStats = true;
      trace(`${label}: hub is running it (+${Date.now() - startedAt}ms), awaiting snapshot`);
    }
    if (!sawRows && stats.rowCount > 0) {
      sawRows = true;
      const took = stats.snapshotFetchMs ?? Date.now() - startedAt;
      trace(`${label}: snapshot loaded — ${stats.rowCount} rows in ${took}ms`);
    }
    if (stats.lastError && stats.lastError !== lastError) {
      lastError = stats.lastError;
      trace(`${label}: error (${stats.errorCount} total) — ${stats.lastError}`);
    }
  };
}

function trace(message: string): void {
  // eslint-disable-next-line no-console
  console.log(`[provider-startup] ${message}`);
}

/** Test-only — forget which providers were warmed. */
export function _resetWarmPlatformForTests(): void {
  warmedProviders.clear();
}
