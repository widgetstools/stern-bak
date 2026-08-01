import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createDataServicesWorker } from './createDataServicesWorker.js';

class MockSharedWorker {
  port = { postMessage: vi.fn() };
  addEventListener = vi.fn((event: string, handler: (ev: unknown) => void) => {
    if (event === 'error') {
      MockSharedWorker.errorHandler = handler;
    }
  });
  static errorHandler: ((ev: unknown) => void) | undefined;

  constructor(
    public url: string,
    public opts: SharedWorkerOptions,
  ) {}
}

describe('createDataServicesWorker', () => {
  beforeEach(() => {
    vi.stubGlobal('SharedWorker', MockSharedWorker);
    vi.stubGlobal('location', { href: 'http://localhost:5174/' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('names the worker from appName and keeps the script URL free of bootstrap query params', () => {
    const worker = createDataServicesWorker('/assets/data-services-worker.mjs', {
      appName: 'demo-app',
      appId: 'demo-app',
      userId: 'dev1',
      configServiceRestUrl: 'http://localhost:3000/api',
    });

    expect(worker).toBeInstanceOf(MockSharedWorker);
    expect(worker.url).toContain('data-services-worker.mjs');
    expect(worker.url).not.toContain('appId=');
    expect(worker.opts).toMatchObject({
      type: 'module',
      name: 'mkt-data-services:demo-app',
    });
  });

  it('accepts absolute worker script URLs', () => {
    const worker = createDataServicesWorker('https://cdn.example/worker.mjs', {
      appName: 'remote',
    });

    expect(worker.url).toBe('https://cdn.example/worker.mjs');
  });

  // A SharedWorker cannot read localStorage — the port is the only channel
  // that reaches it, so the deployment fields MUST go out as a message.
  it('sends the bootstrap handshake on the worker port', () => {
    const worker = createDataServicesWorker('/assets/data-services-worker.mjs', {
      appName: 'demo-app',
      appId: 'demo-app',
      userId: 'dev1',
      seedConfigUrl: '/seed.json',
      seedConfigReload: 'when-changed',
      configServiceRestUrl: 'http://localhost:3000/api',
    }) as unknown as MockSharedWorker;

    expect(worker.port.postMessage).toHaveBeenCalledWith({
      kind: 'worker-bootstrap',
      payload: {
        appId: 'demo-app',
        userId: 'dev1',
        seedConfigUrl: '/seed.json',
        seedConfigReload: 'when-changed',
        configServiceRestUrl: 'http://localhost:3000/api',
      },
    });
  });

  it('defaults the bootstrap appId to appName', () => {
    const worker = createDataServicesWorker('/assets/data-services-worker.mjs', {
      appName: 'fallback-app',
      userId: 'dev1',
    }) as unknown as MockSharedWorker;

    expect(worker.port.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ appId: 'fallback-app' }),
      }),
    );
  });

  it('throws when SharedWorker is unavailable', () => {
    vi.stubGlobal('SharedWorker', undefined);

    expect(() =>
      createDataServicesWorker('/worker.mjs', { appName: 'demo' }),
    ).toThrow('SharedWorker is not available');
  });

  it('logs worker error events', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    createDataServicesWorker('/assets/data-services-worker.mjs', { appName: 'demo' });
    MockSharedWorker.errorHandler?.({ type: 'error' });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
