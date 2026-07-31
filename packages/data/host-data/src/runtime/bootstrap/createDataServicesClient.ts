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
 *     import workerAssetUrl from '@wellsfargo-starui/host-data/assets/data-services-worker.mjs?url';
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

import { createConfigManager, type ConfigManager } from '@wellsfargo-starui/host-config';
import { bootstrapDataServices, type DataServices } from './bootstrap.js';

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
   * bootstrap payload (NOT the scriptURL query string — that was
   * removed; nothing read `self.location.search`). Empty/missing →
   * local Dexie only.
   */
  configServiceRestUrl?: string;

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
  // its bootstrap via `writeWorkerBootstrapPayload` instead.
  //
  // It must also point at the PREBUILT asset rather than the `../worker/
  // defaultEntry.js` source entry: the source graph reaches a lazy
  // `import('@stomp/stompjs')`, and a code-splitting worker is rejected
  // outright by Vite's default `worker.format: 'iife'`, failing the
  // consumer's build. See createDataServicesWorker.ts for the full note.
  const worker = new SharedWorker(new URL('../../assets/data-services-worker.mjs', import.meta.url), {
    type: 'module',
    name: `mkt-data-services:${opts.appName}`,
  });

  worker.addEventListener('error', (ev) => {
    // eslint-disable-next-line no-console
    console.error('[@wellsfargo-starui/host-data] SharedWorker error event', ev);
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
