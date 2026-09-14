import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const storage = {
  saveWorkspace: vi.fn(),
  getWorkspaces: vi.fn(),
  getWorkspace: vi.fn(),
  deleteWorkspace: vi.fn(),
};

vi.mock('@openfin/workspace-platform', () => ({
  getCurrentSync: () => ({ Storage: storage }),
}));

const { launchMock, deleteConfigMock, loadRegistryMock } = vi.hoisted(() => ({
  launchMock: vi.fn(),
  deleteConfigMock: vi.fn(),
  loadRegistryMock: vi.fn(),
}));
vi.mock('../launch.js', () => ({ launchRegisteredComponent: launchMock }));
vi.mock('../db.js', () => ({
  getConfigManager: async () => ({ deleteConfig: deleteConfigMock }),
  loadRegistryConfig: loadRegistryMock,
}));

const { __resetTestBridgeForTests, installTestBridge } = await import('./install.js');

describe('installTestBridge', () => {
  let handlers: Record<string, (payload?: unknown) => Promise<unknown>>;
  let create: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    __resetTestBridgeForTests();
    handlers = {};
    create = vi.fn().mockResolvedValue({
      register: (name: string, fn: (payload?: unknown) => Promise<unknown>) => {
        handlers[name] = fn;
      },
    });
    Object.values(storage).forEach((fn) => fn.mockReset());
    launchMock.mockReset();
    deleteConfigMock.mockReset();
    loadRegistryMock.mockReset();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('no-ops when fin is absent', async () => {
    vi.stubGlobal('fin', undefined);
    await installTestBridge();
    expect(create).not.toHaveBeenCalled();
  });

  it('registers channel actions and is idempotent', async () => {
    vi.stubGlobal('fin', {
      InterApplicationBus: { Channel: { create } },
    });
    await installTestBridge();
    await installTestBridge();
    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith('marketsui-test-bridge');
    expect(Object.keys(handlers).sort()).toEqual([
      'deleteConfig',
      'deleteWorkspace',
      'getWorkspace',
      'getWorkspaces',
      'launchComponent',
      'listRegistry',
      'ping',
      'saveWorkspace',
    ]);
  });

  it('listRegistry summarises the live registry entries (empty when there is no registry)', async () => {
    vi.stubGlobal('fin', {
      InterApplicationBus: { Channel: { create } },
    });
    await installTestBridge();

    loadRegistryMock.mockResolvedValue({
      version: 2,
      entries: [
        { id: 'e1', hostUrl: '/#/blotters/marketsgrid', componentType: 'grid', componentSubType: 'test', displayName: 'TestGrid', singleton: false, iconId: '', configId: 'grid-test', createdAt: '' },
        { id: 'e2', hostUrl: '/#/tools', componentType: 'tool', componentSubType: 'x', singleton: true, iconId: '', configId: 'tool-x', createdAt: '' },
      ],
    });
    await expect(handlers.listRegistry()).resolves.toEqual({
      ok: true,
      data: [
        { id: 'e1', displayName: 'TestGrid', componentType: 'grid', componentSubType: 'test', hostUrl: '/#/blotters/marketsgrid', singleton: false },
        { id: 'e2', displayName: '', componentType: 'tool', componentSubType: 'x', hostUrl: '/#/tools', singleton: true },
      ],
    });

    loadRegistryMock.mockResolvedValue(null);
    await expect(handlers.listRegistry()).resolves.toEqual({ ok: true, data: [] });
  });

  it('launchComponent launches a registry entry through the platform and reports its identity', async () => {
    vi.stubGlobal('fin', {
      InterApplicationBus: { Channel: { create } },
    });
    await installTestBridge();

    launchMock.mockResolvedValue({
      identity: { uuid: 'star-demo', name: 'registered-grid-test-abc' },
      getOptions: async () => ({
        url: 'http://localhost:5175/?instanceId=abc&id=abc#/blotters/marketsgrid',
        customData: { instanceId: 'abc', templateId: 'grid-test' },
      }),
    });
    await expect(handlers.launchComponent({ entryId: 'grid-test', asWindow: true })).resolves.toEqual({
      ok: true,
      data: {
        uuid: 'star-demo',
        name: 'registered-grid-test-abc',
        kind: 'window',
        instanceId: 'abc',
        url: 'http://localhost:5175/?instanceId=abc&id=abc#/blotters/marketsgrid',
      },
    });
    expect(launchMock).toHaveBeenCalledWith('grid-test', { asWindow: true });

    // Default is a view (a dock click); a View owner reports kind 'view'.
    launchMock.mockResolvedValue({
      identity: { uuid: 'star-demo', name: 'internal-generated-view-1' },
      destroy: async () => undefined,
      getOptions: async () => ({ url: 'http://x/?instanceId=v1#/blotters/marketsgrid', customData: { instanceId: 'v1' } }),
    });
    const asView = await handlers.launchComponent({ entryId: 'grid-test' });
    expect(asView).toMatchObject({ ok: true, data: { kind: 'view', instanceId: 'v1', name: 'internal-generated-view-1' } });
    expect(launchMock).toHaveBeenLastCalledWith('grid-test', { asWindow: false });

    // An unknown entry is a structured failure.
    launchMock.mockResolvedValue(undefined);
    await expect(handlers.launchComponent({ entryId: 'nope' })).resolves.toEqual({
      ok: false,
      error: "registry entry 'nope' not found",
    });
  });

  it('deleteConfig removes a row through the host ConfigManager', async () => {
    vi.stubGlobal('fin', {
      InterApplicationBus: { Channel: { create } },
    });
    await installTestBridge();

    deleteConfigMock.mockResolvedValue(undefined);
    await expect(handlers.deleteConfig({ configId: 'abc' })).resolves.toEqual({ ok: true, data: null });
    expect(deleteConfigMock).toHaveBeenCalledWith('abc');

    deleteConfigMock.mockRejectedValue(new Error('locked'));
    await expect(handlers.deleteConfig({ configId: 'abc' })).resolves.toEqual({ ok: false, error: 'locked' });
  });

  it('ping returns a structured ok reply', async () => {
    vi.stubGlobal('fin', {
      InterApplicationBus: { Channel: { create } },
    });
    await installTestBridge();
    await expect(handlers.ping()).resolves.toEqual({ ok: true, data: 'pong' });
  });

  it('safe() wraps storage successes and failures', async () => {
    vi.stubGlobal('fin', {
      InterApplicationBus: { Channel: { create } },
    });
    await installTestBridge();

    storage.getWorkspaces.mockResolvedValue([{ id: 'w1' }]);
    await expect(handlers.getWorkspaces()).resolves.toEqual({
      ok: true,
      data: [{ id: 'w1' }],
    });

    storage.getWorkspace.mockRejectedValue(new Error('missing'));
    await expect(handlers.getWorkspace({ id: 'x' })).resolves.toEqual({
      ok: false,
      error: 'missing',
    });

    storage.saveWorkspace.mockResolvedValue(undefined);
    await expect(handlers.saveWorkspace({ id: 'w' })).resolves.toEqual({
      ok: true,
      data: null,
    });

    storage.deleteWorkspace.mockRejectedValue('boom');
    await expect(handlers.deleteWorkspace({ id: 'w' })).resolves.toEqual({
      ok: false,
      error: 'boom',
    });
  });
});
