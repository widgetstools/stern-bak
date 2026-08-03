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
 *   1. Constructs the `SharedWorker` through `createDataServicesWorker`,
 *      which owns the inline `new URL(...)` literals for both prebuilt
 *      worker assets (default and Perspective) and sends the bootstrap
 *      handshake. This file used to carry a second copy of the default
 *      literal; with two assets to choose between, one copy of the choice
 *      is the only way the two entry points cannot drift.
 *   2. Constructs the main-thread `ConfigManager` (shared across
 *      editor flows).
 *   3. Calls `bootstrapDataServices(...)` and returns the bundle.
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
import { createDataServicesWorker } from './createDataServicesWorker.js';

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

  /**
   * Boot the Perspective worker entry — the only one that hosts a Table, so
   * the only one on which `client.attachPerspective(...)` can succeed.
   *
   * Opt-in, and it must stay that way: that asset embeds the engine's wasm as
   * base64, so booting it by default would charge every app megabytes for a
   * blotter it may never open. See `CreateDataServicesWorkerOpts.perspective`.
   */
  perspective?: boolean;
}

export function createDataServicesClient(
  opts: CreateDataServicesClientOpts,
): DataServices {
  const worker = createDataServicesWorker(undefined, {
    appName: opts.appName,
    appId: opts.appId,
    userId: opts.userId,
    seedConfigUrl: opts.seedConfigUrl,
    seedConfigReload: opts.seedConfigReload,
    configServiceRestUrl: opts.configServiceRestUrl,
    perspective: opts.perspective,
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
