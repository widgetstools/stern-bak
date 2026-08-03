/**
 * Construct the data-services SharedWorker.
 *
 * `workerScriptUrl` is OPTIONAL. Omit it and the library resolves its own
 * worker with the standard bundler idiom:
 *
 *     new SharedWorker(new URL('../../assets/data-services-worker.mjs',
 *                              import.meta.url), { type: 'module' })
 *
 * Vite, webpack 5, Rollup and Parcel all statically detect that exact form
 * (the `new URL(...)` must stay INLINE at the call site — hoisting it to a
 * variable defeats every one of them) and emit the worker themselves, so a
 * consumer needs no build configuration:
 *
 *     await ensurePlatformReady(config);   // no worker URL, no ?url import
 *
 * It points at the PREBUILT, esbuild-bundled asset — deliberately, not at
 * the unbundled `../worker/defaultEntry.js` source entry. Pointing at the
 * source made `vite build` FAIL outright for consumers:
 *
 *     Invalid value "iife" for option "worker.format" — UMD and IIFE output
 *     formats are not supported for code-splitting builds.
 *
 * Vite's default `worker.format` is `iife`, and the source graph reaches the
 * lazy `import('@stomp/stompjs')` in providers/transports/stomp.ts, which
 * forces code-splitting. A library cannot set `worker.format` on the
 * consumer's behalf, and making that import static would drag stompjs into
 * every consumer's MAIN bundle (stomp.ts is reachable from the package root
 * entry). The prebuilt asset has stompjs inlined and ZERO dynamic imports,
 * so nothing needs splitting and the default IIFE format builds cleanly.
 *
 * One caveat, documented in docs/EXTERNAL_CONSUMPTION.md:
 *   - Vite DEV prebundles bare node_modules imports into `.vite/deps/`,
 *     which relocates this module and breaks the relative resolution. Vite
 *     dev users add `optimizeDeps: { exclude: ['@wellsfargo-starui/data'] }`.
 *     (A package cannot opt itself out of Vite's optimizer.)
 *   - A Blob-URL worker would sidestep that but is NOT viable here: every
 *     `createObjectURL` yields a distinct URL, so each window would get its
 *     own worker instead of sharing one hub — the whole point of the design.
 *
 * Passing an explicit URL still wins, and remains the right choice for
 * CDN / OpenFin-manifest / plain-<script> hosting, where the pre-built
 * `@wellsfargo-starui/data/assets/data-services-worker.mjs` is served
 * directly.
 *
 * Two assets, not one:
 *   `perspective: true` selects `data-services-perspective-worker.mjs`, the
 *   entry that passes `loadPerspective` and is therefore the only worker able
 *   to host a Table. It is OPT-IN, and must stay opt-in: that build embeds its
 *   wasm as base64, so defaulting to it would charge every app megabytes it
 *   never uses — the reason there are two entries at all. An app that never
 *   opens a blotter keeps loading the smaller default asset unchanged.
 *
 *   Both URLs are written out as their own inline literal below rather than
 *   computed, for the same static-analysis reason as above: a bundler only
 *   emits a worker it can see the URL of at build time.
 *
 * Bootstrap fields (appId, userId, seed URL, REST URL) are sent as a
 * `worker-bootstrap` message on the worker's port — not as query params,
 * because Vite's dev `@fs/` handler breaks when extra search params are
 * appended to the worker script URL, and not via localStorage, which a
 * SharedWorker cannot read at all.
 */

import { sendWorkerBootstrap } from './sendWorkerBootstrap.js';

export interface CreateDataServicesWorkerOpts {
  /** Idempotency key — also used as SharedWorker `name` suffix. */
  appName: string;
  /**
   * ConfigService REST URL — stored in the worker bootstrap payload
   * (read by `defaultEntry` on hub boot).
   */
  configServiceRestUrl?: string;
  /** Deployment app id — worker ConfigManager uses this for scoped rows. */
  appId?: string;
  /** Signed-in user id — worker ConfigManager identity. */
  userId?: string;
  /**
   * Seed bundle URL — worker runs `seedIfEmpty` at hub boot so the first
   * connecting window does not block on a duplicate main-thread seed.
   */
  seedConfigUrl?: string;
  seedConfigReload?: 'empty-only' | 'when-changed';
  /**
   * Boot the Perspective worker entry instead of the default one.
   *
   * Required by any app that opens a `stomp-perspective` / `mock-perspective`
   * blotter: only that entry passes `loadPerspective`, so on the default
   * worker `client.attachPerspective(...)` answers
   * `{ ok: false, reason: 'This SharedWorker hosts no Perspective engine…' }`
   * and the pull path is unreachable. Ignored when `workerScriptUrl` is given
   * — an explicit URL already names the asset.
   */
  perspective?: boolean;
}

/** Package export path for the bundled worker (after `npm run build`). */
export const DATA_SERVICES_WORKER_ASSET =
  '@wellsfargo-starui/data/assets/data-services-worker.mjs';

/** Package export path for the Perspective-hosting worker — see `perspective`. */
export const DATA_SERVICES_PERSPECTIVE_WORKER_ASSET =
  '@wellsfargo-starui/data/assets/data-services-perspective-worker.mjs';

function resolveWorkerScriptUrl(scriptUrl: string): string {
  try {
    return new URL(scriptUrl).href;
  } catch {
    const base =
      typeof globalThis.location === 'object' && globalThis.location?.href
        ? globalThis.location.href
        : 'http://localhost/';
    return new URL(scriptUrl, base).href;
  }
}

export function createDataServicesWorker(
  workerScriptUrl: string | undefined,
  opts: CreateDataServicesWorkerOpts,
): SharedWorker {
  if (typeof SharedWorker === 'undefined') {
    throw new Error(
      '[@wellsfargo-starui/data] SharedWorker is not available in this '
        + 'environment. The data-services hub requires a browser; guard your '
        + 'bootstrap call for SSR/Node rendering.',
    );
  }

  const name = `mkt-data-services:${opts.appName}`;

  // Explicit URL wins (CDN / OpenFin manifest / <script> hosting).
  // Otherwise fall through to one of the two inline forms — each of which
  // MUST stay written out literally, with no intervening variable, or no
  // bundler will recognise it as a worker. See the module doc comment.
  const worker = workerScriptUrl
    ? new SharedWorker(resolveWorkerScriptUrl(workerScriptUrl), { type: 'module', name })
    : opts.perspective
      ? new SharedWorker(
          new URL('../../assets/data-services-perspective-worker.mjs', import.meta.url),
          { type: 'module', name },
        )
      : new SharedWorker(new URL('../../assets/data-services-worker.mjs', import.meta.url), {
          type: 'module',
          name,
        });

  worker.addEventListener('error', (ev) => {
    // eslint-disable-next-line no-console
    console.error('[@wellsfargo-starui/data] SharedWorker error event', ev);
  });

  // Must go out before anything else uses this port: the worker entry blocks
  // its ConfigManager construction on this message.
  sendWorkerBootstrap(worker.port, {
    appId: opts.appId ?? opts.appName,
    userId: opts.userId,
    seedConfigUrl: opts.seedConfigUrl,
    seedConfigReload: opts.seedConfigReload,
    configServiceRestUrl: opts.configServiceRestUrl,
  });

  return worker;
}
