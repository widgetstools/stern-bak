/**
 * Script entry for the provider sub-worker. Bundled by
 * `scripts/buildWorker.mjs` into a self-contained classic worker script
 * that the hub embeds (blob URL) and also emits as
 * `dist/assets/data-provider-worker.js` for hosts that must load workers
 * from a URL (CSP without `blob:` in `worker-src`).
 */
import { installProviderWorker } from './providerWorkerEntry.js';

/**
 * The Perspective wasm assets ship next to this script in `dist/assets/`
 * (buildWorker.mjs copies them), so resolve them against the worker's
 * own URL. Hosts that serve the script from somewhere the assets are
 * not (blob URLs, exotic CSP setups) simply run `dataPlane: 'engine'`
 * providers as plain sub-workers.
 */
function engineAssets(): { clientWasmUrl: string; serverWasmUrl: string } | undefined {
  try {
    const base = (globalThis as { location?: { href?: string } }).location?.href;
    if (!base || base.startsWith('blob:')) return undefined;
    return {
      clientWasmUrl: new URL('./perspective-js.wasm', base).href,
      serverWasmUrl: new URL('./perspective-server.wasm', base).href,
    };
  } catch {
    return undefined;
  }
}

installProviderWorker(undefined, { engineAssets: engineAssets() });

