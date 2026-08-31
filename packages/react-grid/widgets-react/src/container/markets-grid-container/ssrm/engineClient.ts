import type { Client } from '@perspective-dev/client';

/*
 * Perspective needs two WebAssembly binaries: the client (the JS-facing API,
 * running on this thread) and the server (the engine itself, which `worker()`
 * hosts in a dedicated Web Worker built from a blob URL — no separate worker
 * entry point to register with the bundler).
 *
 * The binaries themselves ship with `@wellsfargo-starui/data`: `buildWorker.mjs`
 * copies `perspective-js.wasm` and `perspective-server.wasm` beside the
 * provider-worker asset (`dist/assets/data-provider-worker.js`), so any window
 * that knows the provider worker's URL — which every data-services client does
 * — can fetch them as siblings. That keeps this library free of bundler-
 * specific `?url` imports.
 *
 * Only the wasm32 engine is registered. The memory64 build raises the heap
 * ceiling from 4GB to 16GB at some cost in engine speed, which a per-window
 * replica of a blotter comes nowhere near needing.
 */
let clientPromise: Promise<Client> | null = null;

export interface SsrmEngineAssets {
  /** URL of `perspective-js.wasm` (the client binary). */
  clientWasmUrl: string;
  /** URL of `perspective-server.wasm` (the engine binary). */
  serverWasmUrl: string;
}

/**
 * The one Perspective client of this window, booted on first use. The first
 * caller's asset URLs win — every grid in a window resolves them from the same
 * data-services client, so they cannot disagree in practice.
 *
 * `@perspective-dev/client` is imported LAZILY on purpose: its Node entry
 * self-boots wasm at import time (crashing any Node/vitest process that
 * merely imports this module's consumers), and in the browser the engine JS
 * is dead weight for every grid still on the client-side row model.
 */
export function getSsrmEngineClient(assets: SsrmEngineAssets): Promise<Client> {
  if (!clientPromise) {
    clientPromise = import('@perspective-dev/client').then(({ default: perspective }) => {
      perspective.init_client(fetch(assets.clientWasmUrl));
      perspective.init_server(fetch(assets.serverWasmUrl));
      return perspective.worker();
    });
  }
  return clientPromise;
}

/**
 * Derives the two wasm asset URLs from the provider-worker asset URL the
 * data-services client already carries (they are emitted as its siblings).
 *
 * The worker URL is often ROOT-RELATIVE — a Vite dev server's `?url` import
 * yields `/@fs/C:/...` — and a relative string is not a valid `URL` base on
 * its own (`new URL(x, '/@fs/...')` throws "Invalid base URL"), so it is
 * resolved against the document first.
 */
export function engineAssetsFromWorkerUrl(providerWorkerUrl: string): SsrmEngineAssets {
  const base =
    typeof location !== 'undefined'
      ? new URL(providerWorkerUrl, location.href)
      : new URL(providerWorkerUrl);
  return {
    clientWasmUrl: new URL('perspective-js.wasm', base).href,
    serverWasmUrl: new URL('perspective-server.wasm', base).href,
  };
}
