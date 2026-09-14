/**
 * Load `/app-config.json`, init ConfigManager + SharedWorker hub — same
 * flow as the CSRM lab. Worker name derives from appId, so this app gets
 * its own SharedWorker (and its own SSRM engine cache).
 */
import {
  ensurePlatformReady,
  resolvePlatformBootstrapFromJson,
  type PlatformBootstrapConfig,
} from '@wellsfargo-starui/data';
import workerAssetUrl from '@wellsfargo-starui/data/assets/data-services-worker.mjs?url';

export interface PlatformBootstrapResult {
  config: PlatformBootstrapConfig;
  platform: Awaited<ReturnType<typeof ensurePlatformReady>>;
}

export async function initPlatformBootstrap(): Promise<PlatformBootstrapResult> {
  const config = await resolvePlatformBootstrapFromJson('/app-config.json');
  const platform = await ensurePlatformReady(config, { workerScriptUrl: workerAssetUrl });
  return { config, platform };
}
