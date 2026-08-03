/**
 * SharedWorker entry for apps on the Perspective pull path.
 *
 * Identical to the default entry (`defaultEntry.ts` — same bootstrap
 * handshake, same ConfigManager/catalog/AppData hydration, every provider
 * type behaves exactly as it does there) plus one hub option: the Perspective
 * loader that `stomp-perspective` / `mock-perspective` providers build their
 * Table on. Shipped prebuilt as `assets/data-services-perspective-worker.mjs`
 * (see `scripts/buildWorker.mjs`), so an app switches paths by changing ONE
 * import — no worker file of its own:
 *
 *     import workerAssetUrl from
 *       '@wellsfargo-starui/data/assets/data-services-perspective-worker.mjs?url';
 *
 * It is a SEPARATE asset rather than a flag on the default one because the
 * inline Perspective client build embeds its wasm as base64: bundling it into
 * the entry every app already loads would cost every app megabytes even when
 * it never opens a blotter. An app that never uses Perspective keeps loading
 * the smaller default asset unchanged.
 */

import { bootDefaultWorker } from './bootWorker.js';

bootDefaultWorker({
  // Dynamic so the engine is fetched by this worker asset only, and only
  // when a provider actually needs a Table.
  loadPerspective: () => import('@perspective-dev/client/inline'),
}).catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[@wellsfargo-starui/data perspective worker] boot failed', err);
  throw err;
});
