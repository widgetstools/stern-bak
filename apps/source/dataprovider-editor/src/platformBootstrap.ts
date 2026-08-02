import {
  ensurePlatformReady,
  resolvePlatformBootstrapFromJson,
  type PlatformBootstrapConfig,
  type ResolvedDataServicesHubBundle,
} from '@wellsfargo-starui/data';
import workerAssetUrl from '@wellsfargo-starui/data/assets/data-services-worker.mjs?url';

export interface PlatformBootstrapResult {
  config: PlatformBootstrapConfig;
  platform: ResolvedDataServicesHubBundle;
}

let platformRef: ResolvedDataServicesHubBundle | undefined;

export function getPlatform(): ResolvedDataServicesHubBundle {
  if (!platformRef) {
    throw new Error('Call initPlatformBootstrap() before getPlatform()');
  }
  return platformRef;
}

export async function initPlatformBootstrap(): Promise<PlatformBootstrapResult> {
  const config = await resolvePlatformBootstrapFromJson('/app-config.json');
  const platform = await ensurePlatformReady(config, { workerScriptUrl: workerAssetUrl });
  platformRef = platform;
  return { config, platform };
}
