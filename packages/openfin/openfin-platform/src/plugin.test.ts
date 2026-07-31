import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const initWorkspace = vi.fn();

vi.mock('./workspace.js', () => ({
  initWorkspace: (...args: unknown[]) => initWorkspace(...args),
}));

const { openFinPlatformPlugin } = await import('./plugin.js');

describe('openFinPlatformPlugin', () => {
  beforeEach(() => {
    initWorkspace.mockReset();
    initWorkspace.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('exposes a stable plugin id', () => {
    expect(openFinPlatformPlugin.id).toBe('openfin-platform');
  });

  it('no-ops when fin is absent', async () => {
    vi.stubGlobal('fin', undefined);
    await openFinPlatformPlugin.register();
    expect(initWorkspace).not.toHaveBeenCalled();
  });

  it('no-ops when Platform.getCurrentSync is missing', async () => {
    vi.stubGlobal('fin', { Platform: {} });
    await openFinPlatformPlugin.register();
    expect(initWorkspace).not.toHaveBeenCalled();
  });

  it('calls initWorkspace inside OpenFin', async () => {
    vi.stubGlobal('fin', {
      Platform: { getCurrentSync: vi.fn() },
    });
    await openFinPlatformPlugin.register();
    expect(initWorkspace).toHaveBeenCalledTimes(1);
  });
});
