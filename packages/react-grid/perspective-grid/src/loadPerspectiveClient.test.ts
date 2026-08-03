/**
 * The window loads the slim build, not the 5 MB one.
 *
 * These pin the two things that are easy to regress by "tidying": the dummy
 * server registration (without it `get_server()` throws and no window ever
 * gets a Client) and the fallback (a slow window beats a window with no grid).
 * What they cannot pin is that the slim build actually drives a real engine —
 * that is `harness/wasmshare.html`, which reads 20,000 rows through it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initClient = vi.fn();
const initServer = vi.fn();
const slimWorker = vi.fn();
const inlineWorker = vi.fn();

/**
 * Both builds are published with a `default` AND named exports, and which one
 * a bundler hands back depends on its interop settings — so the loader reads
 * `imported.default ?? imported` and these flags exercise both answers.
 */
let slimHasDefault = true;
let inlineHasDefault = true;

vi.mock('@perspective-dev/client', () => {
  const mod = { init_client: initClient, init_server: initServer, worker: slimWorker };
  return {
    ...mod,
    get default() {
      return slimHasDefault ? mod : undefined;
    },
  };
});
vi.mock('@perspective-dev/client/inline', () => {
  const mod = { worker: inlineWorker };
  return {
    ...mod,
    get default() {
      return inlineHasDefault ? mod : undefined;
    },
  };
});
vi.mock('@perspective-dev/client/dist/wasm/perspective-js.wasm?url', () => ({
  default: '/assets/perspective-js.wasm',
}));

const { loadPerspectiveClient, resetPerspectiveClientForTests } = await import(
  './loadPerspectiveClient.js'
);

function stubFetch(response: Partial<Response>): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response as Response));
}

beforeEach(() => {
  resetPerspectiveClientForTests();
  slimHasDefault = true;
  inlineHasDefault = true;
  initClient.mockClear();
  initServer.mockClear();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('loadPerspectiveClient', () => {
  it('initializes the slim build from the fetched wasm asset', async () => {
    const wasm = { ok: true, status: 200 };
    stubFetch(wasm);

    const perspective = await loadPerspectiveClient();

    expect(fetch).toHaveBeenCalledWith('/assets/perspective-js.wasm');
    expect(initClient).toHaveBeenCalledWith(wasm);
    expect(perspective.worker).toBe(slimWorker);
  });

  it('registers an empty server wasm so `get_server()` has something to answer', async () => {
    stubFetch({ ok: true, status: 200 });

    await loadPerspectiveClient();

    // The host ignores `args[0]` of the init handshake entirely, so the buffer
    // only has to exist — but `get_server()` throws outright when nothing was
    // registered, and that throw reaches the window as "no grid".
    expect(initServer).toHaveBeenCalledTimes(1);
    const [buffer, disableStage0] = initServer.mock.calls[0]!;
    expect(buffer).toBeInstanceOf(ArrayBuffer);
    expect((buffer as ArrayBuffer).byteLength).toBe(0);
    // Stage 0 is the self-extracting decompressor. Left on, it would try to
    // extract an empty buffer instead of leaving it alone.
    expect(disableStage0).toBe(true);
  });

  it('loads once per window, however many blotters ask', async () => {
    stubFetch({ ok: true, status: 200 });

    const [first, second] = await Promise.all([
      loadPerspectiveClient(),
      loadPerspectiveClient(),
    ]);

    expect(first).toBe(second);
    // `init_client` writes a module-global; calling it twice would have the
    // second caller initializing over the first.
    expect(initClient).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to the inline build when the wasm asset is missing', async () => {
    stubFetch({ ok: false, status: 404 });

    const perspective = await loadPerspectiveClient();

    expect(perspective.worker).toBe(inlineWorker);
    expect(initClient).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });

  it('memoizes the fallback too, rather than re-fetching a 404 per blotter', async () => {
    stubFetch({ ok: false, status: 404 });

    const first = await loadPerspectiveClient();
    const second = await loadPerspectiveClient();

    expect(first).toBe(second);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reads the namespace itself when the build has no default export', async () => {
    slimHasDefault = false;
    stubFetch({ ok: true, status: 200 });

    const perspective = await loadPerspectiveClient();

    expect(initClient).toHaveBeenCalledTimes(1);
    expect(perspective.worker).toBe(slimWorker);
  });

  it('reads the inline namespace itself too, so the fallback survives interop', async () => {
    inlineHasDefault = false;
    stubFetch({ ok: false, status: 404 });

    const perspective = await loadPerspectiveClient();

    expect(perspective.worker).toBe(inlineWorker);
  });
});
