/**
 * Script entry for the provider sub-worker. Bundled by
 * `scripts/buildWorker.mjs` into a self-contained classic worker script
 * that the hub embeds (blob URL) and also emits as
 * `dist/assets/data-provider-worker.js` for hosts that must load workers
 * from a URL (CSP without `blob:` in `worker-src`).
 */
import { installProviderWorker } from './providerWorkerEntry.js';

installProviderWorker();
