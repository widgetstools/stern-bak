import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createDataServicesWorker, createPlatformServicesWorker } from './createDataServicesWorker.js';

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

describe('worker script URL resolution', () => {
  beforeEach(() => {
    vi.stubGlobal('SharedWorker', MockSharedWorker);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('resolves a relative URL against the page', () => {
    vi.stubGlobal('location', { href: 'http://host:5174/app/index.html' });
    const worker = createDataServicesWorker('./worker.mjs', { appName: 'a' });
    expect(worker.url).toBe('http://host:5174/app/worker.mjs');
  });

  it('resolves a relative URL against localhost where there is no location', () => {
    // An OpenFin provider or a test host can construct the hub before any
    // document exists; a bare `new URL(relative)` would throw there and take
    // the whole bootstrap down.
    vi.stubGlobal('location', undefined);
    const worker = createDataServicesWorker('/assets/worker.mjs', { appName: 'a' });
    expect(worker.url).toBe('http://localhost/assets/worker.mjs');
  });

  // The no-URL fallback (`new URL('../../assets/...', import.meta.url)`) is
  // deliberately untested. It must stay written out literally for a bundler to
  // recognise it as a worker, and `scripts/staruiConsumerAliases.mjs` replaces
  // that exact expression with a throwing stub in every app build — all six
  // hub apps pass `workerScriptUrl`, so the fallback never executes in
  // production. Under vitest the specifier does not resolve either.
});

/**
 * The platform-services worker is the SAME bundle under a different
 * SharedWorker name (worker-split W1) — and that name is the whole mechanism.
 * SharedWorker identity is (script URL, name), so a name that collided with
 * the data hub's would hand back the hub's own instance and put config RPCs
 * right back behind the tick loop this split exists to escape.
 */
describe('createPlatformServicesWorker', () => {
  beforeEach(() => {
    vi.stubGlobal('SharedWorker', MockSharedWorker);
    vi.stubGlobal('location', { href: 'http://localhost:5174/' });
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('runs under its own SharedWorker name, not the data hub\'s', () => {
    const platform = createPlatformServicesWorker('/assets/data-services-worker.mjs', {
      appName: 'demo-app',
    });
    const data = createDataServicesWorker('/assets/data-services-worker.mjs', {
      appName: 'demo-app',
    });

    expect(platform.opts).toMatchObject({
      type: 'module',
      name: 'mkt-platform-services:demo-app',
    });
    expect(platform.opts.name).not.toBe(data.opts.name);
  });

  it('sends the same bootstrap handshake on its own port', () => {
    const worker = createPlatformServicesWorker('/assets/data-services-worker.mjs', {
      appName: 'demo-app',
      userId: 'dev1',
      seedConfigUrl: '/seed.json',
      seedConfigReload: 'empty-only',
      configServiceRestUrl: 'http://localhost:3000/api',
    }) as unknown as MockSharedWorker;

    expect(worker.port.postMessage).toHaveBeenCalledWith({
      kind: 'worker-bootstrap',
      payload: {
        appId: 'demo-app',
        userId: 'dev1',
        seedConfigUrl: '/seed.json',
        seedConfigReload: 'empty-only',
        configServiceRestUrl: 'http://localhost:3000/api',
      },
    });
  });

  it('logs its own error events distinguishably from the data hub\'s', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    createPlatformServicesWorker('/assets/data-services-worker.mjs', { appName: 'demo' });
    MockSharedWorker.errorHandler?.({ type: 'error' });
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('platform-services SharedWorker error'),
      expect.anything(),
    );
    consoleError.mockRestore();
  });

  it('throws when SharedWorker is unavailable', () => {
    vi.stubGlobal('SharedWorker', undefined);
    expect(() => createPlatformServicesWorker('/worker.mjs', { appName: 'demo' }))
      .toThrow('platform-services worker requires a browser');
  });
});
