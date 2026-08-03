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

  // Only the Perspective entry hosts a Table, and only it embeds the engine's
  // wasm — so the flag has to reach the worker construction, and a plain load
  // has to stay on the light asset.
  it('boots the Perspective worker asset in Perspective mode', async () => {
    window.history.replaceState({}, '', '/?perspective=1');
    staruiTestState.resolvePlatformBootstrapFromJson.mockResolvedValue({
      appId: 'stomp-minimal',
      userId: 'dev1',
      useRest: false,
    });
    staruiTestState.ensurePlatformReady.mockResolvedValue(staruiTestState.platform);

    const { bootstrap } = await import('./bootstrap.js');
    await bootstrap();

    expect(staruiTestState.ensurePlatformReady).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ workerScriptUrl: '/mock-perspective-worker.mjs' }),
    );
    window.history.replaceState({}, '', '/');
  });
});
