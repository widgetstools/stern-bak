import {
  ensurePlatformReady,
  resolvePlatformBootstrapFromJson,
  type PlatformBootstrapConfig,
} from '@wellsfargo-starui/data';
import type { DataServices } from '@wellsfargo-starui/data/runtime';
import workerAssetUrl from '@wellsfargo-starui/data/assets/data-services-worker.mjs?url';
import { asLegacyDataServices } from './bootstrap/asLegacyDataServices.js';

export interface PlatformBootstrapResult {
  config: PlatformBootstrapConfig;
  platform: Awaited<ReturnType<typeof ensurePlatformReady>>;
  dataServices: DataServices;
}

/**
 * Load `/app-config.json`, init ConfigManager + SharedWorker hub.
 * Worker name: `mkt-data-services:${config.appId}`.
 */
export async function initPlatformBootstrap(): Promise<PlatformBootstrapResult> {
  const config = await resolvePlatformBootstrapFromJson('/app-config.json');
  const platform = await ensurePlatformReady(config, { workerScriptUrl: workerAssetUrl });
  return {
    config,
    platform,
    dataServices: asLegacyDataServices(platform),
  };
}
