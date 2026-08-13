/**
 * Both bootstrap entry points must name the SharedWorker identically.
 * Browsers key a named SharedWorker by its name, so a mismatch silently
 * gives one app two hubs — two caches, two upstream connections, and two
 * grids showing different numbers for the same feed.
 */
import { describe, expect, it, vi, afterEach } from 'vitest';

class MockSharedWorker {
  port = {
    start: vi.fn(),
    postMessage: vi.fn(),
    addEventListener: vi.fn(),
    close: vi.fn(),
  };
  addEventListener = vi.fn();
  constructor(
    public url: string | URL,
    public opts?: { type?: string; name?: string },
  ) {}
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function nameFromWorkerPath(): Promise<string | undefined> {
  vi.stubGlobal('SharedWorker', MockSharedWorker);
  const { createDataServicesWorker } = await import('./createDataServicesWorker.js');
  const worker = createDataServicesWorker('/assets/data-services-worker.mjs', {
    appName: 'demo-app',
  }) as unknown as MockSharedWorker;
  return worker.opts?.name;
}

async function nameFromClientPath(): Promise<string | undefined> {
  const created: MockSharedWorker[] = [];
  class Capturing extends MockSharedWorker {
    constructor(url: string | URL, opts?: { type?: string; name?: string }) {
      super(url, opts);
      created.push(this);
    }
  }
  vi.stubGlobal('SharedWorker', Capturing);
  const { createDataServicesClient } = await import('./createDataServicesClient.js');
  try {
    createDataServicesClient({ appName: 'demo-app' } as never);
  } catch {
    /* only the worker construction matters here */
  }
  return created[0]?.opts?.name;
}

describe('SharedWorker naming', () => {
  it('is identical across both bootstrap paths', async () => {
    const viaWorker = await nameFromWorkerPath();
    const viaClient = await nameFromClientPath();

    expect(viaWorker).toBeDefined();
    expect(viaClient).toBeDefined();
    expect(viaClient).toBe(viaWorker);
  });
});
