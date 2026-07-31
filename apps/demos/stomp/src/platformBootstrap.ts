import {
  ensurePlatformReady,
  resolvePlatformBootstrapFromJson,
  type PlatformBootstrapConfig,
  type ResolvedDataServicesHubBundle,
} from '@wellsfargo-starui/host-data';
import type { DataServices } from '@wellsfargo-starui/host-data/runtime';
import workerAssetUrl from '@wellsfargo-starui/host-data/assets/data-services-worker.mjs?url';
import { asLegacyDataServices } from './bootstrap/asLegacyDataServices.js';

export interface PlatformBootstrapResult {
  config: PlatformBootstrapConfig;
  platform: ResolvedDataServicesHubBundle;
  dataServices: DataServices;
}

let platformRef: ResolvedDataServicesHubBundle | undefined;

/** Hub bundle after {@link initPlatformBootstrap} — for views that need `configManager`. */
export function getPlatform(): ResolvedDataServicesHubBundle {
  if (!platformRef) {
    throw new Error('Call initPlatformBootstrap() before getPlatform()');
  }
  return platformRef;
}

/**
 * Load `/app-config.json`, init ConfigManager + SharedWorker hub.
 * Worker name: `mkt-data-services:${config.appId}`.
 */
export async function initPlatformBootstrap(): Promise<PlatformBootstrapResult> {
  const config = await resolvePlatformBootstrapFromJson('/app-config.json');
  const platform = await ensurePlatformReady(config, { workerScriptUrl: workerAssetUrl });
  platformRef = platform;
  return {
    config,
    platform,
    dataServices: asLegacyDataServices(platform),
  };
}
