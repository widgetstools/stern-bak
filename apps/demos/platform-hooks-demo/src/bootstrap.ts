import {
  ensurePlatformReady,
  resolvePlatformBootstrapFromJson,
  type ResolvedDataServicesHubBundle,
} from '@wellsfargo-starui/host-data';
import workerAssetUrl from '@wellsfargo-starui/host-data/assets/data-services-worker.mjs?url';
import { appDataBootstrapHooks } from './platform/appDataBootstrap.js';

let platform: ResolvedDataServicesHubBundle | undefined;

export function getPlatform(): ResolvedDataServicesHubBundle {
  if (!platform) throw new Error('Call bootstrap() first');
  return platform;
}

export async function bootstrap() {
  const config = await resolvePlatformBootstrapFromJson('/app-config.json');
  platform = await ensurePlatformReady(config, {
    workerScriptUrl: workerAssetUrl,
    appDataBootstrapHooks,
  });
  return { config, platform };
}
