import {
  ensurePlatformReady,
  resolvePlatformBootstrapFromJson,
  type ResolvedDataServicesHubBundle,
} from '@wellsfargo-starui/data';
import workerAssetUrl from '@wellsfargo-starui/data/assets/data-services-worker.mjs?url';

let platform: ResolvedDataServicesHubBundle | undefined;

export function getPlatform(): ResolvedDataServicesHubBundle {
  if (!platform) throw new Error('Call bootstrap() first');
  return platform;
}

export async function bootstrap() {
  const config = await resolvePlatformBootstrapFromJson('/app-config.json');
  platform = await ensurePlatformReady(config, {
    workerScriptUrl: workerAssetUrl,
  });
  return { config, platform };
}
