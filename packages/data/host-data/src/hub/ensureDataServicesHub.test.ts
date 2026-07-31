import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigManager } from '@wellsfargo-starui/host-config';
import { DEV_PLATFORM_BOOTSTRAP } from '../bootstrap/PlatformBootstrapConfig.js';
import {
  _resetEnsureDataServicesHubForTests,
  ensureDataServicesHub,
} from './ensureDataServicesHub.js';

const createDataServicesWorkerMock = vi.fn();
const bootstrapDataServicesMock = vi.fn();

vi.mock('../runtime/bootstrap/createDataServicesWorker.js', () => ({
  createDataServicesWorker: (...args: unknown[]) => createDataServicesWorkerMock(...args),
}));

vi.mock('../runtime/bootstrap/bootstrap.js', () => ({
  bootstrapDataServices: (...args: unknown[]) => bootstrapDataServicesMock(...args),
}));

describe('ensureDataServicesHub', () => {
  const fakeCm = {} as ConfigManager;
  let waitForCatalogReady: ReturnType<typeof vi.fn>;
  let dispose: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    waitForCatalogReady = vi.fn().mockResolvedValue(undefined);
    dispose = vi.fn();
    // Real MessagePort surface — getOrCreateHubConnection wraps the port in
    // a real SharedWorkerDataServicesClient before bootstrap is invoked.
    createDataServicesWorkerMock.mockReturnValue({
      port: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        postMessage: vi.fn(),
        start: vi.fn(),
        close: vi.fn(),
      },
    });
    bootstrapDataServicesMock.mockImplementation(() => ({
      client: { waitForCatalogReady, stop: vi.fn() },
      appData: {},
      configManager: fakeCm,
      ready: Promise.resolve(),
      dispose,
    }));
  });

  afterEach(() => {
    _resetEnsureDataServicesHubForTests();
    vi.clearAllMocks();
  });

  it('creates worker named by appId and waits for catalog preload', async () => {
    const bundle = await ensureDataServicesHub({
      ...DEV_PLATFORM_BOOTSTRAP,
      workerScriptUrl: '/worker.mjs',
      mainThreadConfigManager: fakeCm,
    });

    expect(createDataServicesWorkerMock).toHaveBeenCalledWith('/worker.mjs', {
      appName: 'TestApp',
      configServiceRestUrl: undefined,
      appId: 'TestApp',
      userId: 'dev1',
      seedConfigUrl: undefined,
      seedConfigReload: undefined,
    });
    expect(bootstrapDataServicesMock).toHaveBeenCalledWith({
      appName: 'TestApp',
      worker: expect.any(Object),
      client: expect.any(Object),
      configManager: fakeCm,
      userId: 'dev1',
    });
    expect(waitForCatalogReady).toHaveBeenCalledTimes(1);
    await bundle.ready;
  });

  it('returns the same bundle on double call for the same appId', async () => {
    const opts = {
      ...DEV_PLATFORM_BOOTSTRAP,
      workerScriptUrl: '/worker.mjs',
      mainThreadConfigManager: fakeCm,
    };
    const first = await ensureDataServicesHub(opts);
    const second = await ensureDataServicesHub(opts);

    expect(second).toBe(first);
    expect(createDataServicesWorkerMock).toHaveBeenCalledTimes(1);
    expect(bootstrapDataServicesMock).toHaveBeenCalledTimes(1);
  });

  it('forwards REST URL to the worker when useRest is true', async () => {
    await ensureDataServicesHub({
      appId: 'RestApp',
      userId: 'dev1',
      useRest: true,
      configServiceRestUrl: 'http://localhost:3001/api/v1',
      workerScriptUrl: '/worker.mjs',
      mainThreadConfigManager: fakeCm,
    });

    expect(createDataServicesWorkerMock).toHaveBeenCalledWith('/worker.mjs', {
      appName: 'RestApp',
      configServiceRestUrl: 'http://localhost:3001/api/v1',
      appId: 'RestApp',
      userId: 'dev1',
      seedConfigUrl: undefined,
      seedConfigReload: undefined,
    });
  });

  it('getProvider returns a ProviderClientAdapter bound to the hub client', async () => {
    const bundle = await ensureDataServicesHub({
      ...DEV_PLATFORM_BOOTSTRAP,
      workerScriptUrl: '/worker.mjs',
      mainThreadConfigManager: fakeCm,
    });

    const provider = bundle.getProvider('p1');
    expect(provider.id).toBe('p1');
    expect(provider.capabilities.providerType).toBe('mock');
  });
});
