/**
 * createDataServicesClient — one-call factory that owns the
 * SharedWorker construction + `bootstrapDataServices` wrapping.
 *
 * Before this helper, every consuming app duplicated the literal:
 *
 *     const worker = new SharedWorker(
 *       new URL('./dataServices.sharedWorker.ts', import.meta.url),
 *       { type: 'module', name: ... });
 *     export const dataServices = bootstrapDataServices({ ... });
 *
 * plus an app-local `dataServices.sharedWorker.ts` that did
 * `installSharedWorkerHub` + `createConfigManager`. Both pieces are
 * generic — only `appName`, `userId`, and `restUrl` vary per app.
 *
 * This factory:
 *   1. Constructs the `SharedWorker` with an INLINE
 *      `new URL('../../assets/data-services-worker.mjs', import.meta.url)`
 *      (the pre-built, self-contained worker bundle that ships inside this
 *      package) and `{ type: 'module', name: ... }`. The literal must stay
 *      inline for bundlers to emit the worker.
 *   3. Constructs the main-thread `ConfigManager` (shared across
 *      editor flows).
 *   4. Calls `bootstrapDataServices(...)` and returns the bundle.
 *
 * Worker URL constraint (Vite + tarball consumers):
 *   Prefer the bundled worker asset + `bootstrapDataServicesWithWorkerAsset`:
 *
 *     import workerAssetUrl from '@wellsfargo-starui/data/assets/data-services-worker.mjs?url';
 *     export const dataServices = bootstrapDataServicesWithWorkerAsset(workerAssetUrl, { ... });
 *
 *   The `?url` import must stay in app code; the library ships a
 *   pre-built `dist/assets/data-services-worker.mjs` (esbuild bundle).
 *
 *   Legacy alternatives: app-local `sharedWorker/entry.ts`, or this
 *   factory for non-Vite bundlers/tests that resolve source without
 *   prebundling.
 *
 * Escape hatch:
 *   Apps that need bespoke worker setup (extra services, custom
 *   ConfigManager wiring) should keep their own worker file and call
 *   `installSharedWorkerHub({...})` + `bootstrapDataServices({...})`
 *   directly. This factory is the default for the 99% case.
 */

import { createConfigManager, type ConfigManager } from '@wellsfargo-starui/core/host/config';
import { bootstrapDataServices, type DataServices } from './bootstrap.js';
import { sendWorkerBootstrap } from './sendWorkerBootstrap.js';
import { dataServicesWorkerName } from './workerName.js';

export interface CreateDataServicesClientOpts {
  /**
   * Idempotency key for `bootstrapDataServices`. Same `appName`
   * across calls = same `DataServices` object reference.
   *
   * Also used to name the SharedWorker (`mkt-data-services:<appName>`)
   * so multiple apps in the same browser cohabit cleanly.
   */
  appName: string;

  /**
   * Logged-in user id. Stamped onto AppData rows created by this
   * client.
   */
  userId: string;

  /**
   * ConfigService REST URL. Forwarded to the worker through the
   * bootstrap handshake (NOT the scriptURL query string — that was
   * removed; nothing read `self.location.search`). Empty/missing →
   * local Dexie only.
   */
  configServiceRestUrl?: string;

  /**
   * Deployment app id for the worker's ConfigManager (scoped rows).
   * Defaults to `appName`.
   */
  appId?: string;

  /**
   * Seed bundle URL — the worker runs `seedIfEmpty` at hub boot so the
   * first connecting window doesn't block on a duplicate main-thread seed.
   */
  seedConfigUrl?: string;

  seedConfigReload?: 'empty-only' | 'when-changed';

  /**
   * Optional override — supply a ConfigManager for the main-thread
   * bundle (editor flows). Defaults to a fresh
   * `createConfigManager({ configServiceRestUrl })` so the main
   * thread and the worker stay aligned automatically.
   */
  mainThreadConfigManager?: ConfigManager;
}

export function createDataServicesClient(
  opts: CreateDataServicesClientOpts,
): DataServices {
  // The `new URL(...)` MUST stay inline here: Vite, webpack, Rollup and
  // Parcel only recognise a worker when the URL literal sits directly in
  // the constructor call. This previously hoisted it to a variable and
  // mutated `searchParams` to stamp the REST URL — which defeated every
  // bundler's static analysis (so the worker was emitted as an unbundled
  // static asset and failed on its bare import specifiers) AND was dead
  // code: nothing reads `self.location.search` anywhere. The worker gets
  // its bootstrap from the `worker-bootstrap` handshake sent below.
  //
  // It must also point at the PREBUILT asset rather than the `../worker/
  // defaultEntry.js` source entry: the source graph reaches a lazy
  // `import('@stomp/stompjs')`, and a code-splitting worker is rejected
  // outright by Vite's default `worker.format: 'iife'`, failing the
  // consumer's build. See createDataServicesWorker.ts for the full note.
  const worker = new SharedWorker(new URL('../../assets/data-services-worker.mjs', import.meta.url), {
    type: 'module',
    name: dataServicesWorkerName(opts.appName),
  });

  worker.addEventListener('error', (ev) => {
     
    console.error('[@wellsfargo-starui/data] SharedWorker error event', ev);
  });

  // This path previously sent NOTHING — the comment above claimed the worker
  // got its bootstrap from `writeWorkerBootstrapPayload`, but nothing here
  // ever called it, so the worker never saw appId/userId/REST URL even once
  // the storage transport is set aside.
  sendWorkerBootstrap(worker.port, {
    appId: opts.appId ?? opts.appName,
    userId: opts.userId,
    seedConfigUrl: opts.seedConfigUrl,
    seedConfigReload: opts.seedConfigReload,
    configServiceRestUrl: opts.configServiceRestUrl,
  });

  const configManager =
    opts.mainThreadConfigManager ??
    createConfigManager({ configServiceRestUrl: opts.configServiceRestUrl });

  return bootstrapDataServices({
    appName: opts.appName,
    worker,
    configManager,
    userId: opts.userId,
  });
}
