import { beforeEach, describe, expect, it, vi } from 'vitest';
import './test/setupMocks.js';
import { staruiTestState } from './test/setupMocks.js';

describe('bootstrap', () => {
  beforeEach(() => {
    vi.resetModules();
    staruiTestState.resolvePlatformBootstrapFromJson.mockReset();
    staruiTestState.ensurePlatformReady.mockReset();
  });

  it('getPlatform throws before bootstrap completes', async () => {
    const { getPlatform } = await import('./bootstrap.js');
    expect(() => getPlatform()).toThrow('Call bootstrap() first');
  });

  it('bootstrap resolves platform config and stores platform bundle', async () => {
    const config = { appId: 'stomp-minimal', userId: 'dev1', useRest: false };
    staruiTestState.resolvePlatformBootstrapFromJson.mockResolvedValue(config);
    staruiTestState.ensurePlatformReady.mockResolvedValue(staruiTestState.platform);

    const { bootstrap, getPlatform } = await import('./bootstrap.js');
    const result = await bootstrap();

    expect(staruiTestState.resolvePlatformBootstrapFromJson).toHaveBeenCalledWith('/app-config.json');
    expect(staruiTestState.ensurePlatformReady).toHaveBeenCalledWith(config, {
      workerScriptUrl: '/mock-worker.mjs',
      appDataBootstrapHooks: expect.objectContaining({
        'session-context': expect.any(Function),
      }),
    });
    expect(result).toEqual({ config, platform: staruiTestState.platform });
    expect(getPlatform()).toBe(staruiTestState.platform);
  });
});
