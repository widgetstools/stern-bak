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
import perspectiveWorkerAssetUrl from '@wellsfargo-starui/data/assets/data-services-perspective-worker.mjs?url';
import { appDataBootstrapHooks } from './platform/appDataBootstrap.js';
import { isPerspectiveMode } from './perspectiveMode.js';

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
  // Two prebuilt worker assets, and the choice is made once here. Only the
  // Perspective entry hosts a Table, so `?perspective=1` has to reach the
  // worker construction or `attachPerspective` refuses; and only that entry
  // embeds the engine's wasm, so the default URL stays the light one.
  platform = await ensurePlatformReady(config, {
    workerScriptUrl: isPerspectiveMode() ? perspectiveWorkerAssetUrl : workerAssetUrl,
    appDataBootstrapHooks,
  });

  return { config, platform };
}
