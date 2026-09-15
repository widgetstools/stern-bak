import { describe, expect, it, vi } from 'vitest';

const { ensurePlatformReady, resolvePlatformBootstrapFromJson } = vi.hoisted(() => ({
  ensurePlatformReady: vi.fn(async () => ({ hub: 'platform' })),
  resolvePlatformBootstrapFromJson: vi.fn(async () => ({ appId: 'spg', userId: 'dev1' })),
}));

vi.mock('@wellsfargo-starui/data', () => ({ ensurePlatformReady, resolvePlatformBootstrapFromJson }));
vi.mock('@wellsfargo-starui/data/assets/data-services-worker.mjs?url', () => ({
  default: '/assets/data-services-worker.mjs',
}));

import { initPlatformBootstrap } from './platformBootstrap';

describe('initPlatformBootstrap', () => {
  it('reads the deployment config and starts the hub against the bundled worker', async () => {
    const result = await initPlatformBootstrap();

    expect(resolvePlatformBootstrapFromJson).toHaveBeenCalledWith('/app-config.json');
    // The worker URL has to be passed explicitly: the library's zero-config
    // fallback is stubbed out of every app build, so an omitted URL here is a
    // hub that never constructs.
    expect(ensurePlatformReady).toHaveBeenCalledWith(
      { appId: 'spg', userId: 'dev1' },
      { workerScriptUrl: '/assets/data-services-worker.mjs' },
    );
    expect(result).toEqual({
      config: { appId: 'spg', userId: 'dev1' },
      platform: { hub: 'platform' },
    });
  });

  it('lets a failed hub start reach the caller, which renders the bootstrap error', async () => {
    ensurePlatformReady.mockRejectedValueOnce(new Error('worker down'));
    await expect(initPlatformBootstrap()).rejects.toThrow('worker down');
  });
});
