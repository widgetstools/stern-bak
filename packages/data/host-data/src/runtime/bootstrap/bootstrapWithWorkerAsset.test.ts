/**
 * `bootstrapDataServicesWithWorkerAsset` is pure wiring: build the
 * worker, pick a ConfigManager, hand both to `bootstrapDataServices`.
 * The one decision it makes is the ConfigManager choice — an app that
 * already owns a main-thread manager must NOT get a second one, because
 * two managers over the same IndexedDB seed and drain independently.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const createDataServicesWorker = vi.fn();
const createConfigManager = vi.fn();
const bootstrapDataServices = vi.fn();

vi.mock('./createDataServicesWorker.js', () => ({
  createDataServicesWorker: (...args: unknown[]) => createDataServicesWorker(...args),
}));
vi.mock('@wellsfargo-starui/core/host/config', () => ({
  createConfigManager: (...args: unknown[]) => createConfigManager(...args),
}));
vi.mock('./bootstrap.js', () => ({
  bootstrapDataServices: (...args: unknown[]) => bootstrapDataServices(...args),
}));

const { bootstrapDataServicesWithWorkerAsset } = await import('./bootstrapWithWorkerAsset.js');

describe('bootstrapDataServicesWithWorkerAsset', () => {
  const worker = { port: {} } as unknown as SharedWorker;
  const services = { kind: 'data-services' };

  beforeEach(() => {
    vi.clearAllMocks();
    createDataServicesWorker.mockReturnValue(worker);
    bootstrapDataServices.mockReturnValue(services);
    createConfigManager.mockImplementation(() => ({ id: 'created' }));
  });

  it('passes the worker URL and the full opts through to the worker factory', () => {
    bootstrapDataServicesWithWorkerAsset('/assets/worker.mjs', {
      appName: 'star',
      userId: 'alice',
      appId: 'TestApp',
      configServiceRestUrl: 'https://cfg/api',
    });

    expect(createDataServicesWorker).toHaveBeenCalledWith(
      '/assets/worker.mjs',
      expect.objectContaining({ appName: 'star', userId: 'alice', appId: 'TestApp' }),
    );
  });

  it('lets the URL be omitted so the library resolves its own bundled worker', () => {
    bootstrapDataServicesWithWorkerAsset(undefined, { appName: 'star', userId: 'alice' });
    expect(createDataServicesWorker).toHaveBeenCalledWith(undefined, expect.anything());
  });

  it('creates a ConfigManager pointed at the same REST URL when none is supplied', () => {
    bootstrapDataServicesWithWorkerAsset('/w.mjs', {
      appName: 'star',
      userId: 'alice',
      configServiceRestUrl: 'https://cfg/api',
    });

    expect(createConfigManager).toHaveBeenCalledWith({ configServiceRestUrl: 'https://cfg/api' });
    expect(bootstrapDataServices).toHaveBeenCalledWith({
      appName: 'star',
      worker,
      configManager: { id: 'created' },
      userId: 'alice',
    });
  });

  it('adopts the caller\'s ConfigManager instead of creating a second one', () => {
    // Two managers over one IndexedDB would seed and drain twice.
    const mainThreadConfigManager = { id: 'app-owned' } as never;

    bootstrapDataServicesWithWorkerAsset('/w.mjs', {
      appName: 'star',
      userId: 'alice',
      mainThreadConfigManager,
    });

    expect(createConfigManager).not.toHaveBeenCalled();
    expect(bootstrapDataServices).toHaveBeenCalledWith(
      expect.objectContaining({ configManager: mainThreadConfigManager }),
    );
  });

  it('returns whatever bootstrapDataServices returns', () => {
    expect(
      bootstrapDataServicesWithWorkerAsset('/w.mjs', { appName: 'star', userId: 'alice' }),
    ).toBe(services);
  });
});
