import { describe, expect, it, vi } from 'vitest';
import { ensurePlatformReady, resolvePlatformBootstrapFromJson } from '@wellsfargo-starui/data';
import { initPlatformBootstrap } from './platformBootstrap';

describe('initPlatformBootstrap', () => {
  it('reads the deployment config and starts the hub against the bundled worker', async () => {
    const result = await initPlatformBootstrap();

    expect(resolvePlatformBootstrapFromJson).toHaveBeenCalledWith('/app-config.json');
    // The worker URL must be passed explicitly: the library's zero-config
    // fallback is stubbed out of every app build, so omitting it here gives a
    // hub that never constructs.
    expect(ensurePlatformReady).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'lab-user' }),
      { workerScriptUrl: '/mock-worker.mjs' },
    );
    expect(result.config.userId).toBe('lab-user');
    expect(result.platform).toBeDefined();
  });

  it('lets a failed hub start reach the caller, which renders the bootstrap error', async () => {
    vi.mocked(ensurePlatformReady).mockRejectedValueOnce(new Error('worker down'));
    await expect(initPlatformBootstrap()).rejects.toThrow('worker down');
  });
});
