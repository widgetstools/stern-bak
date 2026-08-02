/**
 * Platform bootstrap — runs once before React mounts (see main.tsx).
 *
 * Produces the `platform` bundle consumed by DataHubProvider and
 * optional direct access via getPlatform() (e.g. grid layout storage).
 */

import {
  ensurePlatformReady,
  resolvePlatformBootstrapFromJson,
  type ResolvedDataServicesHubBundle,
} from '@wellsfargo-starui/data';
import workerAssetUrl from '@wellsfargo-starui/data/assets/data-services-worker.mjs?url';
import { appDataBootstrapHooks } from './platform/appDataBootstrap.js';

/** Set by bootstrap(); read by App for HostedMarketsGrid layout persistence. */
let platform: ResolvedDataServicesHubBundle | undefined;

export function getPlatform(): ResolvedDataServicesHubBundle {
  if (!platform) throw new Error('Call bootstrap() first');
  return platform;
}

export async function bootstrap() {
  // Load appId / userId / useRest from public/app-config.json.
  const config = await resolvePlatformBootstrapFromJson('/app-config.json');

  // ensurePlatformReady:
  //   1. createConfigManager + init() on main thread (Dexie open/seed)
  //   2. spawn SharedWorker (worker ConfigManager + hydrateCatalog + hydrateAppData)
  //   3. wait for AppData mirror + worker catalog ready
  platform = await ensurePlatformReady(config, {
    workerScriptUrl: workerAssetUrl,
    appDataBootstrapHooks,
  });

  return { config, platform };
}
