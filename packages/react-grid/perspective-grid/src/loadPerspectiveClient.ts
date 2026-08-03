/**
 * Load the Perspective client a blotter window needs — WITHOUT the 5 MB build.
 *
 * A window on this path never runs the engine. The engine and the book live in
 * the SharedWorker; this window holds a Client that proxies to it. Yet every
 * window was importing `@perspective-dev/client/inline`, which carries BOTH
 * wasm binaries base64-encoded in a single 5,070 kB JS chunk — including the
 * 2,406 kB server binary it can never execute. MEASURED across three windows:
 * ~900 ms of every window's ~1.1 s open is that chunk booting, against
 * 191–315 ms for everything the row engine does.
 *
 * So this loads the slim 47.70 kB build and points it at the client wasm as a
 * separate, cacheable 521 kB asset.
 *
 * ## Why not share the compiled module from the worker
 *
 * The vendor documents `getCompiledClientWasm()` for exactly this, and it was
 * tried first. It does not work here, for a reason no amount of plumbing fixes:
 *
 *   - `getCompiledClientWasm()` works fine in a SharedWorker: 0.2 ms, 103
 *     exports, once a client exists in that scope. (It throws in ~2 ms before
 *     one does, which is what the first attempt actually hit — a rejection
 *     that fast loses no race with a 1.5 s timeout, it settles first. The
 *     earlier "it blocks the worker's event loop" reading was wrong.)
 *   - **The Module cannot leave a SharedWorker.** `postMessage` does not
 *     throw; the receiving window raises `messageerror` and the value never
 *     arrives. A `WebAssembly.Module` is structured-cloneable but may not be
 *     deserialized in another agent cluster, and a SharedWorker is its own.
 *     (A dedicated Worker shares its owner's cluster — which is why an earlier
 *     round trip through one succeeded and proved less than it looked like.)
 *
 * Fetching the wasm needs no transfer at all, so the agent-cluster rule is
 * simply not in the picture. MEASURED, same page, both reading 20,000 rows
 * from the worker-held Table: inline 4,951.84 kB and 178.2 ms; this 555.67 kB
 * and 36.3 ms. The wasm is then an ordinary HTTP-cached asset, so windows
 * 2..N pay for neither the bytes nor, on browsers with a compiled-wasm cache,
 * the compile.
 */
import type { PerspectiveClientModuleLike } from './usePerspectiveTable.js';
import clientWasmUrl from '@perspective-dev/client/dist/wasm/perspective-js.wasm?url';

/** The slice of the slim build's init surface this needs. */
interface PerspectiveInitModuleLike extends PerspectiveClientModuleLike {
  init_client(wasm: Response): void;
  init_server(wasm: ArrayBuffer, disableStage0: boolean): void;
}

/**
 * Satisfy `get_server()` without shipping the server binary.
 *
 * The window's Client is a pure proxy: `api.worker()` puts whatever this
 * registers into `args[0]` of the init handshake, and the host IGNORES it
 * (`perspectiveHost.ts` — "the engine is already up, which is the point").
 * But `get_server()` THROWS outright when nothing was registered, so it has to
 * be handed something. An empty buffer with stage 0 disabled is the smallest
 * thing that satisfies it and it is never compiled, instantiated or run.
 *
 * This is safe precisely because the window never hosts a Table. A window that
 * needed its OWN engine would need the real 2,406 kB server binary — and would
 * not be on this path at all.
 */
function registerProxiedServerWasm(perspective: PerspectiveInitModuleLike): void {
  perspective.init_server(new ArrayBuffer(0), true);
}

let cached: Promise<PerspectiveClientModuleLike> | null = null;

/**
 * The window's Perspective module, loaded once per window.
 *
 * Cached because `init_client` writes a module-global: two callers racing it
 * would be initializing the same module instance twice, and the second would
 * be answering the first's state.
 */
export function loadPerspectiveClient(): Promise<PerspectiveClientModuleLike> {
  cached ??= loadSlimClient().catch((err: unknown) => {
    // Falling back rather than failing: a window that boots slowly is a
    // performance regression, a window with no grid is an outage. The inline
    // build is a separate chunk with its own module state, so nothing the slim
    // attempt did to its own globals carries over.
    console.warn(
      '[perspective] slim client unavailable, falling back to the inline build',
      err,
    );
    cached = loadInlineClient();
    return cached;
  });
  return cached;
}

async function loadSlimClient(): Promise<PerspectiveClientModuleLike> {
  const [imported, wasm] = await Promise.all([
    import('@perspective-dev/client') as Promise<
      { default?: PerspectiveInitModuleLike } & PerspectiveInitModuleLike
    >,
    fetch(clientWasmUrl),
  ]);
  if (!wasm.ok) {
    throw new Error(`client wasm ${wasm.status} from ${clientWasmUrl}`);
  }
  const perspective = imported.default ?? imported;

  // `init_client` is NOT async — it stores the compile as a promise and
  // returns. So a wasm that fetches 200 and then fails to compile surfaces at
  // `worker()`, not here, and the fallback above will not catch it. The status
  // check is the boundary this can actually police; a corrupt 200 from a
  // bundler-emitted asset is not a failure mode worth carrying code for.
  perspective.init_client(wasm);
  registerProxiedServerWasm(perspective);
  return perspective;
}

async function loadInlineClient(): Promise<PerspectiveClientModuleLike> {
  const imported = (await import('@perspective-dev/client/inline')) as {
    default?: PerspectiveClientModuleLike;
  } & PerspectiveClientModuleLike;
  return imported.default ?? imported;
}

/** Test seam — drops the memoized module so a case can load a fresh one. */
export function resetPerspectiveClientForTests(): void {
  cached = null;
}
