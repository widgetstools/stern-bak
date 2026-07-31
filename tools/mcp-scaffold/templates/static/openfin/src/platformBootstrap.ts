import {
  ensurePlatformReady,
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

export function getPlatform(): ResolvedDataServicesHubBundle {
  if (!platformRef) {
    throw new Error('Call initPlatformBootstrap() before getPlatform()');
  }
  return platformRef;
}

export function getBootstrapConfig(): PlatformBootstrapConfig {
  if (!configRef) {
    throw new Error('Call initPlatformBootstrap() before getPlatform()');
  }
  return configRef;
}

/**
 * Resolve manifest `customSettings`, init ConfigManager + SharedWorker hub.
 * Worker name: `mkt-data-services:${config.appId}`.
 */
export async function initPlatformBootstrap(): Promise<PlatformBootstrapResult> {
  const config = await resolvePlatformBootstrapFromManifest();
  const platform = await ensurePlatformReady(config, { workerScriptUrl: workerAssetUrl });
  platformRef = platform;
  configRef = config;
  return { config, platform };
}
