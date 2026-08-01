import './testSetupMocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ensurePlatformReady,
  resolvePlatformBootstrapFromJson,
} from '@wellsfargo-starui/host-data';

describe('platformBootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('throws when getPlatform is called before init', async () => {
    const { getPlatform } = await import('./platformBootstrap');
    expect(() => getPlatform()).toThrow('Call initPlatformBootstrap() before getPlatform()');
  });

  it('resolves config, starts platform, and returns legacy data services', async () => {
    const config = { userId: 'dev1', appId: 'TestApp' };
    const platform = {
      client: { subscribe: vi.fn() },
      appData: {},
      configManager: {},
      ready: Promise.resolve(),
      dispose: vi.fn(),
    };

    vi.mocked(resolvePlatformBootstrapFromJson).mockResolvedValue(config as never);
    vi.mocked(ensurePlatformReady).mockResolvedValue(platform as never);

    const { initPlatformBootstrap, getPlatform } = await import('./platformBootstrap');
    const result = await initPlatformBootstrap();

    expect(resolvePlatformBootstrapFromJson).toHaveBeenCalledWith('/app-config.json');
    expect(ensurePlatformReady).toHaveBeenCalledWith(config, {
      workerScriptUrl: '/mock-worker.mjs',
    });
    expect(result.config).toBe(config);
    expect(result.platform).toBe(platform);
    expect(result.dataServices.client).toBe(platform.client);
    expect(getPlatform()).toBe(platform);
  });
});
