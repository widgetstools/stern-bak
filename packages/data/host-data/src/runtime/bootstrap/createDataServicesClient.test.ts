/**
 * `createDataServicesClient` builds its own SharedWorker rather than going
 * through `createDataServicesWorker`, and used to send the worker NOTHING —
 * its comment claimed the bootstrap went out via `writeWorkerBootstrapPayload`,
 * but no call to it existed on this path. Any consumer using this factory got
 * a worker that silently ran local/anonymous.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const bootstrapDataServices = vi.fn();

vi.mock('./bootstrap.js', () => ({
  bootstrapDataServices: (...args: unknown[]) => bootstrapDataServices(...args),
}));

vi.mock('@wellsfargo-starui/host-config', () => ({
  createConfigManager: vi.fn(() => ({ init: vi.fn(), isRestMode: () => false })),
}));

const postMessage = vi.fn();

class MockSharedWorker {
  port = { postMessage };
  addEventListener = vi.fn();
  constructor(public url: URL | string, public opts: SharedWorkerOptions) {}
}

describe('createDataServicesClient', () => {
  beforeEach(() => {
    postMessage.mockReset();
    bootstrapDataServices.mockReset().mockReturnValue({});
    vi.stubGlobal('SharedWorker', MockSharedWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the bootstrap handshake so the worker sees the REST URL', async () => {
    const { createDataServicesClient } = await import('./createDataServicesClient.js');

    createDataServicesClient({
      appName: 'star-demo',
      userId: 'k151344',
      configServiceRestUrl: 'http://localhost:3001/api/v1',
      seedConfigUrl: '/seed.json',
    });

    expect(postMessage).toHaveBeenCalledWith({
      kind: 'worker-bootstrap',
      payload: {
        appId: 'star-demo',
        userId: 'k151344',
        seedConfigUrl: '/seed.json',
        seedConfigReload: undefined,
        configServiceRestUrl: 'http://localhost:3001/api/v1',
      },
    });
  });

  it('prefers an explicit appId over appName', async () => {
    const { createDataServicesClient } = await import('./createDataServicesClient.js');

    createDataServicesClient({
      appName: 'star-demo',
      appId: 'Star-Demo-Prod',
      userId: 'k151344',
    });

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ appId: 'Star-Demo-Prod' }),
      }),
    );
  });
});
