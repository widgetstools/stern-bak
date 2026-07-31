import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createDataServicesWorker } from './createDataServicesWorker.js';

class MockSharedWorker {
  port = {};
  addEventListener = vi.fn();

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
});
