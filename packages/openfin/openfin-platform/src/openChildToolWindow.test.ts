import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./db.js', () => ({
  getPlatformDefaultScope: () => ({ appId: 'TestApp', userId: 'dev1' }),
}));

const {
  __resetOpenChildToolWindowCacheForTests,
  openChildToolWindow,
  openDataProvidersToolWindow,
} = await import('./openChildToolWindow.js');

describe('openChildToolWindow', () => {
  let createWindow: ReturnType<typeof vi.fn>;
  let existing: {
    getInfo: ReturnType<typeof vi.fn>;
    setAsForeground: ReturnType<typeof vi.fn>;
    navigate: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    __resetOpenChildToolWindowCacheForTests();
    createWindow = vi.fn().mockResolvedValue(undefined);
    existing = {
      getInfo: vi.fn(),
      setAsForeground: vi.fn().mockResolvedValue(undefined),
      navigate: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubFin(opts?: {
    providerUrl?: string;
    wrapThrows?: boolean;
    existingUrl?: string;
    createThrows?: boolean;
  }) {
    const getManifest = vi.fn().mockResolvedValue({
      platform: { providerUrl: opts?.providerUrl ?? 'http://localhost:5175/provider' },
    });
    createWindow = opts?.createThrows
      ? vi.fn().mockRejectedValue(new Error('create failed'))
      : vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fin', {
      me: { identity: { uuid: 'platform-uuid' } },
      Application: {
        getCurrent: vi.fn().mockResolvedValue({ getManifest }),
      },
      Window: {
        wrapSync: vi.fn(() => {
          if (opts?.wrapThrows) throw new Error('missing');
          return existing;
        }),
      },
      Platform: {
        getCurrentSync: vi.fn(() => ({ createWindow })),
      },
    });
    if (opts?.existingUrl !== undefined) {
      existing.getInfo.mockResolvedValue({ url: opts.existingUrl });
    }
    return { getManifest };
  }

  it('logs and returns when the provider URL cannot be resolved', async () => {
    stubFin({ providerUrl: 'not-a-url' });
    await openChildToolWindow('cfg', '/config-browser', 100, 100);
    expect(console.error).toHaveBeenCalled();
    expect(createWindow).not.toHaveBeenCalled();
  });

  it('foregrounds an existing window and navigates when the URL differs', async () => {
    stubFin({
      existingUrl: 'http://localhost:5175/other',
    });
    await openChildToolWindow('cfg', '/config-browser', 100, 100);
    expect(existing.setAsForeground).toHaveBeenCalled();
    expect(existing.navigate).toHaveBeenCalledWith(
      'http://localhost:5175/config-browser',
    );
    expect(createWindow).not.toHaveBeenCalled();
  });

  it('skips navigate when the existing window is already on the same document', async () => {
    stubFin({
      existingUrl: 'http://localhost:5175/config-browser',
    });
    await openChildToolWindow('cfg', '/config-browser', 100, 100);
    expect(existing.navigate).not.toHaveBeenCalled();
  });

  it('creates a new platform window when wrapSync fails', async () => {
    stubFin({ wrapThrows: true });
    await openChildToolWindow('cfg', '/config-browser', 1100, 720, {
      customData: { appId: 'x' },
    });
    expect(createWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'cfg',
        url: 'http://localhost:5175/config-browser',
        defaultWidth: 1100,
        defaultHeight: 720,
        contextMenuSettings: { enable: true, devtools: true, reload: true },
        customData: { appId: 'x' },
      }),
    );
  });

  it('swallows createWindow failures', async () => {
    stubFin({ wrapThrows: true, createThrows: true });
    await expect(
      openChildToolWindow('cfg', '/config-browser', 100, 100),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it('caches a successful provider URL across calls', async () => {
    const { getManifest } = stubFin({ wrapThrows: true });
    await openChildToolWindow('a', '/a', 10, 10);
    await openChildToolWindow('b', '/b', 10, 10);
    expect(getManifest).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failed provider URL lookup', async () => {
    const getManifest = vi.fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValueOnce({
        platform: { providerUrl: 'http://localhost:5175/provider' },
      });
    vi.stubGlobal('fin', {
      me: { identity: { uuid: 'u' } },
      Application: { getCurrent: vi.fn().mockResolvedValue({ getManifest }) },
      Window: { wrapSync: vi.fn(() => { throw new Error('missing'); }) },
      Platform: { getCurrentSync: vi.fn(() => ({ createWindow })) },
    });
    await openChildToolWindow('a', '/a', 10, 10);
    await openChildToolWindow('b', '/b', 10, 10);
    expect(getManifest).toHaveBeenCalledTimes(2);
    expect(createWindow).toHaveBeenCalledTimes(1);
  });
});

describe('openDataProvidersToolWindow', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    __resetOpenChildToolWindowCacheForTests();
  });

  it('opens data-providers with scope customData and optional ?id=', async () => {
    const createWindow = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fin', {
      me: { identity: { uuid: 'u' } },
      Application: {
        getCurrent: vi.fn().mockResolvedValue({
          getManifest: vi.fn().mockResolvedValue({
            platform: { providerUrl: 'http://localhost:5175/provider' },
          }),
        }),
      },
      Window: { wrapSync: vi.fn(() => { throw new Error('missing'); }) },
      Platform: { getCurrentSync: vi.fn(() => ({ createWindow })) },
    });
    await openDataProvidersToolWindow({ providerId: 'dp-1' });
    expect(createWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'data-providers',
        url: 'http://localhost:5175/dataproviders?id=dp-1',
        customData: { appId: 'TestApp', userId: 'dev1' },
      }),
    );
  });
});
