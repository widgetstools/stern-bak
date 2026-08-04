import {
  ensurePlatformReady,
  resolvePlatformBootstrapFromJson,
  type PlatformBootstrapConfig,
} from '@wellsfargo-starui/data';
import type { DataServices } from '@wellsfargo-starui/data/runtime';
import workerAssetUrl from '@wellsfargo-starui/data/assets/data-services-perspective-worker.mjs?url';
import { asLegacyDataServices } from './bootstrap/asLegacyDataServices.js';

export interface PlatformBootstrapResult {
  config: PlatformBootstrapConfig;
  platform: Awaited<ReturnType<typeof ensurePlatformReady>>;
  dataServices: DataServices;
}

/**
 * Load `/app-config.json`, init ConfigManager + SharedWorker hub.
 * Worker name: `mkt-data-services:${config.appId}`.
 *
 * The lab boots the PERSPECTIVE worker asset, not the default one. Every tab
 * offers a `client | perspective` row-engine toggle, and the toggle has to work
 * without reloading the page — but which worker a window runs is settled at
 * `new SharedWorker()`, and only this asset passes `loadPerspective`. On the
 * default one every Perspective variant would answer "this SharedWorker hosts
 * no Perspective engine" and the picker would be decoration.
 *
 * The cost is real and deliberate: this asset embeds the engine's wasm as
 * base64. A lab whose entire purpose is running both engines side by side is
 * exactly the app that should pay it — a product app that never opens a blotter
 * still gets the smaller default (see `EnsurePlatformReadyOpts.perspective`).
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
