import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const createView = vi.fn();
const createWindow = vi.fn();
const applySnapshot = vi.fn();
const loadRegistryConfig = vi.fn();
const getConfigManager = vi.fn();

vi.mock('@openfin/workspace-platform', () => ({
  AppManifestType: {
    Snapshot: 'snapshot',
    View: 'view',
    External: 'external',
    Manifest: 'manifest',
  },
  getCurrentSync: () => ({ createView, createWindow, applySnapshot }),
}));

vi.mock('./db.js', () => ({
  loadRegistryConfig: (...args: unknown[]) => loadRegistryConfig(...args),
  getConfigManager: (...args: unknown[]) => getConfigManager(...args),
}));

vi.mock('./hostUrl.js', () => ({
  resolveHostUrl: (u: string) => `http://resolved${u}`,
  appendLaunchIdentityParams: (u: string, id: string) => `${u}?instanceId=${id}`,
}));

const { __resetLaunchSingletonsForTests, launchApp, launchRegisteredComponent } =
  await import('./launch.js');

describe('launchApp', () => {
  beforeEach(() => {
    createView.mockReset().mockResolvedValue({ kind: 'view' });
    createWindow.mockReset().mockResolvedValue({ kind: 'window' });
    applySnapshot.mockReset().mockResolvedValue({ kind: 'platform' });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('returns undefined when manifest is missing', async () => {
    await expect(
      launchApp({ appId: 'a', title: 'A', manifestType: 'view' } as never),
    ).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it('dispatches Snapshot / View / External / default manifest types', async () => {
    const launchExternalProcess = vi.fn().mockResolvedValue({ uuid: 'ext' });
    const startFromManifest = vi.fn().mockResolvedValue({ uuid: 'app' });
    vi.stubGlobal('fin', {
      System: { launchExternalProcess },
      Application: { startFromManifest },
    });

    await expect(
      launchApp({
        appId: 's',
        title: 'S',
        manifestType: 'snapshot',
        manifest: 'snap.json',
      } as never),
    ).resolves.toEqual({ kind: 'platform' });
    expect(applySnapshot).toHaveBeenCalledWith('snap.json');

    await expect(
      launchApp({
        appId: 'v',
        title: 'V',
        manifestType: 'view',
        manifest: 'view.json',
      } as never),
    ).resolves.toEqual({ kind: 'view' });
    expect(createView).toHaveBeenCalledWith({ manifestUrl: 'view.json' });

    await expect(
      launchApp({
        appId: 'e',
        title: 'E',
        manifestType: 'external',
        manifest: '/bin/app',
      } as never),
    ).resolves.toEqual({ uuid: 'ext' });
    expect(launchExternalProcess).toHaveBeenCalledWith({
      path: '/bin/app',
      uuid: 'e',
    });

    await expect(
      launchApp({
        appId: 'm',
        title: 'M',
        manifestType: 'manifest',
        manifest: 'app.json',
      } as never),
    ).resolves.toEqual({ uuid: 'app' });
    expect(startFromManifest).toHaveBeenCalledWith('app.json');
  });
});

describe('launchRegisteredComponent', () => {
  const entry = {
    id: 'e1',
    displayName: 'Grid',
    hostUrl: '/grid',
    componentType: 'grid',
    componentSubType: 'trade',
    type: 'internal' as const,
    usesHostConfig: true,
    appId: 'TestApp',
    configServiceUrl: 'http://cfg',
    configId: 'grid-trade',
    singleton: false,
    asWindow: false,
  };

  beforeEach(() => {
    __resetLaunchSingletonsForTests();
    loadRegistryConfig.mockReset();
    getConfigManager.mockReset();
    createView.mockReset().mockResolvedValue({
      kind: 'view',
      focus: vi.fn().mockResolvedValue(undefined),
      on: vi.fn().mockResolvedValue(undefined),
    });
    createWindow.mockReset().mockResolvedValue({
      kind: 'window',
      focus: vi.fn().mockResolvedValue(undefined),
      setAsForeground: vi.fn().mockResolvedValue(undefined),
      bringToFront: vi.fn().mockResolvedValue(undefined),
      on: vi.fn().mockResolvedValue(undefined),
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns and returns undefined when the registry entry is missing', async () => {
    loadRegistryConfig.mockResolvedValue({ version: 1, entries: [], updatedAt: '' });
    await expect(launchRegisteredComponent('missing')).resolves.toBeUndefined();
    expect(console.warn).toHaveBeenCalled();
  });

  it('creates a view for a non-singleton entry on the template row — no per-instance row', async () => {
    loadRegistryConfig.mockResolvedValue({ version: 1, entries: [entry], updatedAt: '' });

    const view = await launchRegisteredComponent('e1');
    expect(view).toMatchObject({ kind: 'view' });
    expect(createView).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'http://resolved/grid?instanceId=grid-trade',
        customData: {
          instanceId: 'grid-trade',
          templateId: 'grid-trade',
          componentType: 'grid',
          componentSubType: 'trade',
          appId: 'TestApp',
          configServiceUrl: 'http://cfg',
          isTemplate: true,
          singleton: false,
        },
      }),
    );
    // Nothing is cloned or written at launch: the view reads the template row itself.
    expect(getConfigManager).not.toHaveBeenCalled();
  });

  it('every launch of a non-singleton entry opens another view on the same row', async () => {
    loadRegistryConfig.mockResolvedValue({ version: 1, entries: [entry], updatedAt: '' });
    createView.mockImplementation(async () => ({
      kind: 'view',
      focus: vi.fn().mockResolvedValue(undefined),
      on: vi.fn().mockResolvedValue(undefined),
    }));
    const first = await launchRegisteredComponent('e1');
    const second = await launchRegisteredComponent('e1');
    expect(createView).toHaveBeenCalledTimes(2);
    expect(first).not.toBe(second);
    const ids = createView.mock.calls.map((c) => (c[0] as { customData: { instanceId: string } }).customData.instanceId);
    expect(ids).toEqual(['grid-trade', 'grid-trade']);
  });

  it('creates a window when asWindow is true', async () => {
    loadRegistryConfig.mockResolvedValue({ version: 1, entries: [entry], updatedAt: '' });
    getConfigManager.mockResolvedValue({
      getConfig: vi.fn().mockResolvedValue(null),
      saveConfig: vi.fn(),
    });
    await launchRegisteredComponent('e1', { asWindow: true });
    expect(createWindow).toHaveBeenCalled();
    expect(createView).not.toHaveBeenCalled();
  });

  it('focuses an in-flight singleton instead of launching again', async () => {
    const singleton = { ...entry, singleton: true, configId: 'grid-trade' };
    loadRegistryConfig.mockResolvedValue({
      version: 1,
      entries: [singleton],
      updatedAt: '',
    });
    getConfigManager.mockResolvedValue({
      getConfig: vi.fn().mockResolvedValue(null),
      saveConfig: vi.fn(),
    });

    const first = launchRegisteredComponent('e1');
    const second = launchRegisteredComponent('e1');
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(createView).toHaveBeenCalledTimes(1);
    expect(a?.focus).toHaveBeenCalled();
  });

  it('relaunches when singleton focus fails (stale owner)', async () => {
    const singleton = { ...entry, singleton: true, configId: 'grid-trade' };
    loadRegistryConfig.mockResolvedValue({
      version: 1,
      entries: [singleton],
      updatedAt: '',
    });
    getConfigManager.mockResolvedValue({
      getConfig: vi.fn().mockResolvedValue(null),
      saveConfig: vi.fn(),
    });

    const stale = {
      focus: vi.fn().mockRejectedValue(new Error('dead')),
      on: vi.fn().mockResolvedValue(undefined),
    };
    createView
      .mockResolvedValueOnce(stale)
      .mockResolvedValueOnce({
        focus: vi.fn().mockResolvedValue(undefined),
        on: vi.fn().mockResolvedValue(undefined),
      });

    await launchRegisteredComponent('e1');
    const next = await launchRegisteredComponent('e1');
    expect(createView).toHaveBeenCalledTimes(2);
    expect(next).not.toBe(stale);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('focus failed'),
      expect.anything(),
    );
  });

  it('generates a templateId when the registry entry has no configId', async () => {
    const noConfig = { ...entry, configId: undefined };
    loadRegistryConfig.mockResolvedValue({ version: 1, entries: [noConfig], updatedAt: '' });
    getConfigManager.mockResolvedValue({
      getConfig: vi.fn().mockResolvedValue(null),
      saveConfig: vi.fn(),
    });
    await launchRegisteredComponent('e1');
    expect(createView).toHaveBeenCalledWith(
      expect.objectContaining({
        customData: expect.objectContaining({
          templateId: 'grid-trade',
          instanceId: 'grid-trade',
        }),
      }),
    );
  });

  it('uses setAsForeground and bringToFront when focusing a singleton window', async () => {
    const singleton = { ...entry, singleton: true, configId: 'grid-trade' };
    loadRegistryConfig.mockResolvedValue({
      version: 1,
      entries: [singleton],
      updatedAt: '',
    });
    getConfigManager.mockResolvedValue({
      getConfig: vi.fn().mockResolvedValue(null),
      saveConfig: vi.fn(),
    });
    const owner = {
      focus: vi.fn().mockResolvedValue(undefined),
      setAsForeground: vi.fn().mockResolvedValue(undefined),
      bringToFront: vi.fn().mockResolvedValue(undefined),
      on: vi.fn().mockResolvedValue(undefined),
    };
    createWindow.mockResolvedValueOnce(owner);
    await launchRegisteredComponent('e1', { asWindow: true });
    await launchRegisteredComponent('e1', { asWindow: true });
    expect(owner.setAsForeground).toHaveBeenCalled();
    expect(owner.bringToFront).toHaveBeenCalled();
    expect(createWindow).toHaveBeenCalledTimes(1);
  });

  it('clears singleton cache when the in-flight launch rejects', async () => {
    const singleton = { ...entry, singleton: true, configId: 'grid-trade' };
    loadRegistryConfig.mockResolvedValue({
      version: 1,
      entries: [singleton],
      updatedAt: '',
    });
    getConfigManager.mockResolvedValue({
      getConfig: vi.fn().mockResolvedValue(null),
      saveConfig: vi.fn(),
    });
    createView.mockRejectedValueOnce(new Error('launch failed'));
    await expect(launchRegisteredComponent('e1')).rejects.toThrow('launch failed');
    createView.mockResolvedValueOnce({
      focus: vi.fn().mockResolvedValue(undefined),
      on: vi.fn().mockResolvedValue(undefined),
    });
    await launchRegisteredComponent('e1');
    expect(createView).toHaveBeenCalledTimes(2);
  });

  it('removes singleton map entry when the owner closes', async () => {
    const singleton = { ...entry, singleton: true, configId: 'grid-trade' };
    loadRegistryConfig.mockResolvedValue({
      version: 1,
      entries: [singleton],
      updatedAt: '',
    });
    getConfigManager.mockResolvedValue({
      getConfig: vi.fn().mockResolvedValue(null),
      saveConfig: vi.fn(),
    });
    let closedHandler: (() => void) | undefined;
    const owner = {
      focus: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(async (evt: string, h: () => void) => {
        if (evt === 'closed') closedHandler = h;
      }),
    };
    createView.mockResolvedValueOnce(owner);
    await launchRegisteredComponent('e1');
    expect(closedHandler).toBeTypeOf('function');
    closedHandler!();
    createView.mockResolvedValueOnce({
      focus: vi.fn().mockResolvedValue(undefined),
      on: vi.fn().mockResolvedValue(undefined),
    });
    await launchRegisteredComponent('e1');
    expect(createView).toHaveBeenCalledTimes(2);
  });
});
