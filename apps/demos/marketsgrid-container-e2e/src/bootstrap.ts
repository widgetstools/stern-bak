/**
 * Platform bootstrap — runs once before React mounts (see main.tsx).
 *
 * Spins up the main-thread ConfigManager + the SharedWorker data-services
 * hub so `HostedMarketsGrid` can resolve provider configs from the catalog
 * and lazy-start them. No STOMP / external server: the providers seeded by
 * App.tsx are `mock` transports, so the whole app is self-contained and
 * deterministic — exactly what a stable e2e host needs.
 */

import {
  ensurePlatformReady,
  resolvePlatformBootstrapFromJson,
  type ResolvedDataServicesHubBundle,
} from '@wellsfargo-starui/host-data';
import workerAssetUrl from '@wellsfargo-starui/host-data/assets/data-services-worker.mjs?url';

let platform: ResolvedDataServicesHubBundle | undefined;

export function getPlatform(): ResolvedDataServicesHubBundle {
  if (!platform) throw new Error('Call bootstrap() first');
  return platform;
}

export async function bootstrap() {
  const config = await resolvePlatformBootstrapFromJson('/app-config.json');
  platform = await ensurePlatformReady(config, { workerScriptUrl: workerAssetUrl });
  return { config, platform };
}
