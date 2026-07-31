import {
  ensurePlatformReady,
  resolvePlatformBootstrapFromJson,
  type PlatformBootstrapConfig,
  type ResolvedDataServicesHubBundle,
} from '@wellsfargo-starui/host-data';
import workerAssetUrl from '@wellsfargo-starui/host-data/assets/data-services-worker.mjs?url';

export interface PlatformBootstrapResult {
  config: PlatformBootstrapConfig;
  platform: ResolvedDataServicesHubBundle;
}

let platformRef: ResolvedDataServicesHubBundle | undefined;
let configRef: PlatformBootstrapConfig | undefined;

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

export async function initPlatformBootstrap(): Promise<PlatformBootstrapResult> {
  const config = await resolvePlatformBootstrapFromJson('/app-config.json');
  const platform = await ensurePlatformReady(config, { workerScriptUrl: workerAssetUrl });
  platformRef = platform;
  configRef = config;
  return { config, platform };
}
