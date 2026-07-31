import {
  ensurePlatformReady,
  resolvePlatformBootstrapFromJson,
  type PlatformBootstrapConfig,
  type ResolvedDataServicesHubBundle,
} from '@wellsfargo-starui/host-data';
import { resolvePlatformBootstrapFromManifest } from '@wellsfargo-starui/openfin-platform/config';
import workerAssetUrl from '@wellsfargo-starui/host-data/assets/data-services-worker.mjs?url';

export interface PlatformBootstrapResult {
  config: PlatformBootstrapConfig;
  platform: ResolvedDataServicesHubBundle;
}

let platformRef: ResolvedDataServicesHubBundle | undefined;
let configRef: PlatformBootstrapConfig | undefined;

function isOpenFinRuntime(): boolean {
  if (typeof globalThis === 'undefined') return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fin = (globalThis as any).fin;
  return Boolean(fin?.Platform?.getCurrentSync);
}

export function getPlatform(): ResolvedDataServicesHubBundle {
  if (!platformRef) {
    throw new Error('Call initPlatformBootstrap() before getPlatform()');
  }
  return platformRef;
}

export function getBootstrapConfig(): PlatformBootstrapConfig {
  if (!configRef) {
    throw new Error('Call initPlatformBootstrap() first');
  }
  return configRef;
}

/**
 * Browser: `/app-config.json`. OpenFin: manifest `customSettings`.
 * Worker name: `mkt-data-services:${config.appId}`.
 *
 * `appId` is the single source of truth in `seed-config.json` —
 * see {@link resolveAppIdFromSeed}. The `appId` carried by
 * app-config.json / the manifest is only a fallback used when the seed
 * can't be read; this keeps the row-scope key `(instanceId, appId,
 * userId)` stable across browser/OpenFin and prevents the "settings lost
 * on restart" drift caused by divergent appId values.
 */
export async function initPlatformBootstrap(): Promise<PlatformBootstrapResult> {
  const base = isOpenFinRuntime()
    ? await resolvePlatformBootstrapFromManifest()
    : await resolvePlatformBootstrapFromJson('/app-config.json');
  // Seed is the canonical appId source; bootstrap value is the fallback.
  const appId = await resolveAppIdFromSeed(base.seedConfigUrl, base.appId);
  const config: PlatformBootstrapConfig = { ...base, appId };
  const platform = await ensurePlatformReady(config, { workerScriptUrl: workerAssetUrl });
  platformRef = platform;
  configRef = config;
  return { config, platform };
}

/**
 * Read the canonical `appId` from `seed-config.json`'s `appRegistry`.
 *
 * The seed is the single source of truth for app identity: its
 * `appRegistry[].appId` defines the scope every config row (profiles,
 * settings, workspaces) is keyed under. We resolve it at bootstrap —
 * before the ConfigManager / SharedWorker are created — so the whole
 * platform agrees on one value regardless of what app-config.json or the
 * OpenFin manifest happen to carry.
 *
 * Resolution: the entry whose `manifestUrl` matches the current document
 * origin wins (disambiguates multi-app seeds); otherwise the first entry
 * with a non-empty `appId`. Falls back to `fallbackAppId` (the bootstrap
 * value) when the seed can't be fetched / has no usable appId, so a
 * missing or malformed seed never hard-fails startup.
 */
async function resolveAppIdFromSeed(
  seedConfigUrl: string | undefined,
  fallbackAppId: string,
): Promise<string> {
  if (!seedConfigUrl) return fallbackAppId;
  try {
    const res = await fetch(seedConfigUrl);
    if (!res.ok) return fallbackAppId;
    const seed = (await res.json()) as {
      appRegistry?: Array<{ appId?: unknown; manifestUrl?: unknown }>;
    };
    const registry = Array.isArray(seed?.appRegistry) ? seed.appRegistry : [];
    const entries = registry.filter(
      (e): e is { appId: string; manifestUrl?: string } =>
        typeof e?.appId === 'string' && e.appId.trim().length > 0,
    );
    if (entries.length === 0) return fallbackAppId;

    // Prefer the entry registered for this origin (multi-app seeds);
    // else the first registered app.
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const matched = origin
      ? entries.find(
          (e) => typeof e.manifestUrl === 'string' && e.manifestUrl.startsWith(origin),
        )
      : undefined;
    return (matched ?? entries[0]).appId.trim();
  } catch {
    return fallbackAppId;
  }
}
