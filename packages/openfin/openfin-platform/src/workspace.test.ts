import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const platformInit = vi.fn();
const getCurrentSync = vi.fn();
const registerHome = vi.fn();
const registerStore = vi.fn();
const registerDock = vi.fn();
const registerNotifications = vi.fn();
const shutdownDock = vi.fn();
const setExcludedDockTools = vi.fn();
const Home = { show: vi.fn(), deregister: vi.fn() };
const Storefront = { deregister: vi.fn() };
const createConfigManager = vi.fn();
const peekConfigManager = vi.fn();
const setConfigManager = vi.fn();
const setPlatformDefaultScope = vi.fn();
const getPlatformDefaultScope = vi.fn(() => ({ appId: 'TestApp', userId: 'dev1' }));
const migrateLegacyPlatformScope = vi.fn().mockResolvedValue({ migrated: 0 });
const migrateRegistryToGlobalScope = vi.fn().mockResolvedValue({ migrated: 0 });
const migrateRegistryAppIdDrift = vi.fn().mockResolvedValue({ migrated: 0 });
const realignAllConfigsToPlatformScope = vi.fn().mockResolvedValue({ realigned: 0, total: 0 });
const resolveDefaultPlatformScope = vi.fn().mockResolvedValue({ appId: 'TestApp', userId: 'dev1' });
const resolveDeploymentIdentity = vi.fn().mockResolvedValue({ appId: 'TestApp', userId: 'dev1' });
const resolveSeedConfigUrl = vi.fn(async (u: string) => u);
const createWorkspacePersistenceOverride = vi.fn(() => vi.fn());
const buildCustomActions = vi.fn(() => ({}));
const openChildToolWindow = vi.fn();
const openDataProvidersToolWindow = vi.fn();
const launchApp = vi.fn();
const launchRegisteredComponent = vi.fn();
const reloadDockFromConfig = vi.fn();

vi.mock('@openfin/workspace-platform', () => ({
  init: (...a: unknown[]) => platformInit(...a),
  getCurrentSync: () => getCurrentSync(),
  ColorSchemeOptionType: { Dark: 'dark', Light: 'light' },
}));

vi.mock('@openfin/workspace', () => ({
  Home,
  Storefront,
}));

vi.mock('@wellsfargo-starui/core/host/config', () => ({
  createConfigManager: (...a: unknown[]) => createConfigManager(...a),
}));

vi.mock('./db.js', () => ({
  peekConfigManager: (...a: unknown[]) => peekConfigManager(...a),
  setConfigManager: (...a: unknown[]) => setConfigManager(...a),
  setPlatformDefaultScope: (...a: unknown[]) => setPlatformDefaultScope(...a),
  getPlatformDefaultScope: () => getPlatformDefaultScope(),
  migrateLegacyPlatformScope: (...a: unknown[]) => migrateLegacyPlatformScope(...a),
  migrateRegistryToGlobalScope: (...a: unknown[]) => migrateRegistryToGlobalScope(...a),
  migrateRegistryAppIdDrift: (...a: unknown[]) => migrateRegistryAppIdDrift(...a),
  realignAllConfigsToPlatformScope: (...a: unknown[]) => realignAllConfigsToPlatformScope(...a),
}));

vi.mock('./dock.js', async () => {
  const topics = await import('./iabTopics.js');
  return {
    ...topics,
    registerDock: (...a: unknown[]) => registerDock(...a),
    setExcludedDockTools: (...a: unknown[]) => setExcludedDockTools(...a),
    reloadDockFromConfig: (...a: unknown[]) => reloadDockFromConfig(...a),
    shutdownDock: (...a: unknown[]) => shutdownDock(...a),
  };
});

vi.mock('./home.js', () => ({
  registerHome: (...a: unknown[]) => registerHome(...a),
}));
vi.mock('./store.js', () => ({
  registerStore: (...a: unknown[]) => registerStore(...a),
}));
vi.mock('./notifications.js', () => ({
  registerNotifications: (...a: unknown[]) => registerNotifications(...a),
}));
vi.mock('./launch.js', () => ({
  launchApp: (...a: unknown[]) => launchApp(...a),
  launchRegisteredComponent: (...a: unknown[]) => launchRegisteredComponent(...a),
}));
vi.mock('./platformBootstrap.js', () => ({
  resolveDeploymentIdentity: (...a: unknown[]) => resolveDeploymentIdentity(...a),
}));
vi.mock('./resolveSeedConfigUrl.js', () => ({
  resolveSeedConfigUrl: (...a: unknown[]) => resolveSeedConfigUrl(...a),
}));
vi.mock('./platformScope.js', () => ({
  resolveDefaultPlatformScope: (...a: unknown[]) => resolveDefaultPlatformScope(...a),
}));
vi.mock('./workspacePersistence.js', () => ({
  createWorkspacePersistenceOverride: (...a: unknown[]) =>
    createWorkspacePersistenceOverride(...a),
}));
vi.mock('./internal/customActions.js', () => ({
  buildCustomActions: (...a: unknown[]) => buildCustomActions(...a),
}));
vi.mock('./openChildToolWindow.js', () => ({
  openChildToolWindow: (...a: unknown[]) => openChildToolWindow(...a),
  openDataProvidersToolWindow: (...a: unknown[]) => openDataProvidersToolWindow(...a),
}));
vi.mock('./openfinPalette.js', () => ({
  buildOpenFinPalettesFromDesignSystem: () => ({
    dark: { background1: '#111', brandPrimary: '#a' },
    light: { background1: '#eee', brandPrimary: '#b' },
  }),
  applyDarkPaletteOverrides: (p: unknown) => p,
}));

const { __resetWorkspaceForTests, initWorkspace } = await import('./workspace.js');
const {
  ACTION_EXPORT_CONFIG,
  ACTION_INSPECT_SHARED_WORKER,
  ACTION_LAUNCH_APP,
  ACTION_LAUNCH_COMPONENT,
  ACTION_OPEN_CONFIG_BROWSER,
  ACTION_OPEN_DATA_PROVIDERS,
  ACTION_OPEN_DOCK_EDITOR,
  ACTION_OPEN_REGISTRY_EDITOR,
  ACTION_OPEN_WORKSPACE_SETUP,
  ACTION_RELOAD_DOCK,
  ACTION_SHOW_DEVTOOLS,
  ACTION_TOGGLE_PROVIDER,
  ACTION_IMPORT_CONFIG,
} = await import('./iabTopics.js');

describe('initWorkspace', () => {
  let platformReadyHandler: (() => Promise<void>) | undefined;
  let closeRequestedHandler: (() => Promise<void>) | undefined;
  let windowClosedHandler: ((evt: { name?: string }) => void) | undefined;
  let browserGetAllWindows: ReturnType<typeof vi.fn>;
  let setActiveWorkspace: ReturnType<typeof vi.fn>;
  let getSnapshot: ReturnType<typeof vi.fn>;
  let setSelectedScheme: ReturnType<typeof vi.fn>;
  let getSelectedScheme: ReturnType<typeof vi.fn>;
  let platformOn: ReturnType<typeof vi.fn>;
  let providerOnce: ReturnType<typeof vi.fn>;
  let platformQuit: ReturnType<typeof vi.fn>;
  let capturedCustomActionDeps: {
    runThemeToggle: (cont: (isDark: boolean) => Promise<void>) => Promise<void>;
    exportAllConfig: (cm: unknown) => Promise<void>;
  } | undefined;
  let cm: {
    init: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
    getAllApps: ReturnType<typeof vi.fn>;
    getConfigsByAppUnfiltered: ReturnType<typeof vi.fn>;
    getConfig: ReturnType<typeof vi.fn>;
    getAllRoles: ReturnType<typeof vi.fn>;
    getAllPermissions: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    __resetWorkspaceForTests();
    platformReadyHandler = undefined;
    closeRequestedHandler = undefined;
    windowClosedHandler = undefined;
    browserGetAllWindows = vi.fn().mockResolvedValue([]);
    setActiveWorkspace = vi.fn().mockResolvedValue(undefined);
    getSnapshot = vi.fn().mockResolvedValue({ windows: [] });
    setSelectedScheme = vi.fn().mockResolvedValue(undefined);
    getSelectedScheme = vi.fn().mockResolvedValue('dark');
    platformQuit = vi.fn().mockResolvedValue(undefined);
    platformOn = vi.fn((evt: string, h: (e: { name?: string }) => void) => {
      if (evt === 'window-closed') windowClosedHandler = h;
    });
    providerOnce = vi.fn((evt: string, h: () => Promise<void>) => {
      if (evt === 'close-requested') closeRequestedHandler = h;
      return Promise.resolve();
    });
    getCurrentSync.mockReturnValue({
      Browser: { getAllWindows: browserGetAllWindows },
      getSnapshot,
      setActiveWorkspace,
      Theme: {
        getSelectedScheme,
        setSelectedScheme,
      },
      on: platformOn,
    });
    platformInit.mockReset().mockImplementation(async () => {
      await platformReadyHandler?.();
    });
    cm = {
      init: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
      getAllApps: vi.fn().mockResolvedValue([{ appId: 'TestApp' }]),
      getConfigsByAppUnfiltered: vi.fn().mockResolvedValue([{ configId: 'c1' }]),
      getConfig: vi.fn().mockResolvedValue(null),
      getAllRoles: vi.fn().mockResolvedValue([]),
      getAllPermissions: vi.fn().mockResolvedValue([]),
    };
    createConfigManager.mockReset().mockReturnValue(cm);
    peekConfigManager.mockReset().mockReturnValue(undefined);
    registerHome.mockReset().mockResolvedValue({});
    registerStore.mockReset().mockResolvedValue({});
    registerDock.mockReset().mockImplementation(async (_s, _a, _i, _d, _l, _r, dispatcher) => {
      // stash dispatcher for action coverage
      (registerDock as unknown as { dispatcher?: typeof dispatcher }).dispatcher = dispatcher;
      return {};
    });
    registerNotifications.mockReset().mockResolvedValue({});
    shutdownDock.mockReset().mockResolvedValue(undefined);
    Home.show.mockReset().mockResolvedValue(undefined);
    Home.deregister.mockReset().mockResolvedValue(undefined);
    Storefront.deregister.mockReset().mockResolvedValue(undefined);
    migrateLegacyPlatformScope.mockReset().mockResolvedValue({ migrated: 1 });
    realignAllConfigsToPlatformScope.mockReset().mockResolvedValue({ realigned: 2, total: 3 });
    migrateRegistryToGlobalScope.mockReset().mockResolvedValue({ migrated: 1 });
    migrateRegistryAppIdDrift.mockReset().mockResolvedValue({ migrated: 1 });
    buildCustomActions.mockClear().mockImplementation((deps) => {
      capturedCustomActionDeps = deps;
      return {};
    });
    openChildToolWindow.mockReset().mockResolvedValue(undefined);
    openDataProvidersToolWindow.mockReset().mockResolvedValue(undefined);
    launchApp.mockReset();
    launchRegisteredComponent.mockReset();
    reloadDockFromConfig.mockReset().mockResolvedValue(undefined);

    const providerWindow = {
      once: providerOnce,
      showDeveloperTools: vi.fn().mockResolvedValue(undefined),
      isShowing: vi.fn().mockResolvedValue(true),
      hide: vi.fn().mockResolvedValue(undefined),
      show: vi.fn().mockResolvedValue(undefined),
    };

    vi.stubGlobal('fin', {
      me: { identity: { uuid: 'plat-uuid' } },
      Application: {
        getCurrent: vi.fn().mockResolvedValue({
          getManifest: vi.fn().mockResolvedValue({
            platform: { uuid: 'plat-uuid', icon: 'icon.png', providerUrl: 'http://localhost:5175/p' },
            shortcut: { name: 'StarUI' },
            customSettings: {
              appId: 'TestApp',
              userId: 'dev1',
              apps: [{ appId: 'a1', title: 'A', manifest: 'm', manifestType: 'view' }],
              dockVersion: 'dock2',
            },
          }),
        }),
        getCurrentSync: vi.fn(() => ({
          getViews: vi.fn().mockResolvedValue([
            { inspectSharedWorker: vi.fn().mockResolvedValue(undefined) },
          ]),
        })),
      },
      Platform: {
        getCurrentSync: vi.fn(() => ({
          once: (evt: string, h: () => Promise<void>) => {
            if (evt === 'platform-api-ready') platformReadyHandler = h;
            return Promise.resolve();
          },
          quit: platformQuit,
        })),
      },
      Window: {
        getCurrentSync: vi.fn(() => providerWindow),
      },
    });

    document.documentElement.setAttribute('data-theme', 'dark');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    __resetWorkspaceForTests();
  });

  it('is idempotent and registers all workspace components', async () => {
    const log = vi.fn();
    await initWorkspace({ onProgress: log });
    await initWorkspace({ onProgress: log });

    expect(createConfigManager).toHaveBeenCalledTimes(1);
    expect(platformInit).toHaveBeenCalledTimes(1);
    expect(registerHome).toHaveBeenCalledTimes(1);
    expect(registerStore).toHaveBeenCalledTimes(1);
    expect(registerDock).toHaveBeenCalledTimes(1);
    expect(registerNotifications).toHaveBeenCalledTimes(1);
    expect(setPlatformDefaultScope).toHaveBeenCalledWith({
      appId: 'TestApp',
      userId: 'dev1',
    });
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Migrated 1 legacy-scope'));
    expect(buildCustomActions).toHaveBeenCalled();
  });

  it('uses a prewired ConfigManager and swallows migration failures', async () => {
    peekConfigManager.mockReturnValue(cm);
    migrateLegacyPlatformScope.mockRejectedValueOnce(new Error('m1'));
    realignAllConfigsToPlatformScope.mockRejectedValueOnce(new Error('m2'));
    migrateRegistryToGlobalScope.mockRejectedValueOnce(new Error('m3'));
    migrateRegistryAppIdDrift.mockRejectedValueOnce(new Error('m4'));

    await initWorkspace({ components: { home: false, store: false, dock: false, notifications: false } });
    expect(createConfigManager).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('migrateLegacyPlatformScope failed'),
      expect.anything(),
    );
  });

  it('wires dockActionHandlers through registerDock dispatcher', async () => {
    await initWorkspace();
    const dispatcher = (registerDock as unknown as {
      dispatcher: (id: string, data?: unknown) => Promise<void>;
    }).dispatcher;
    expect(dispatcher).toBeTypeOf('function');

    await dispatcher(ACTION_LAUNCH_APP, { appId: 'a' });
    expect(launchApp).toHaveBeenCalled();

    await dispatcher(ACTION_LAUNCH_COMPONENT, {});
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('missing registryEntryId'),
    );
    await dispatcher(ACTION_LAUNCH_COMPONENT, { registryEntryId: 'e1' });
    expect(launchRegisteredComponent).toHaveBeenCalledWith('e1', { asWindow: undefined });

    await dispatcher(ACTION_OPEN_DOCK_EDITOR);
    await dispatcher(ACTION_OPEN_REGISTRY_EDITOR);
    await dispatcher(ACTION_OPEN_WORKSPACE_SETUP);
    await dispatcher(ACTION_OPEN_CONFIG_BROWSER);
    await dispatcher(ACTION_OPEN_DATA_PROVIDERS);
    await dispatcher(ACTION_IMPORT_CONFIG);
    expect(openChildToolWindow).toHaveBeenCalled();
    expect(openDataProvidersToolWindow).toHaveBeenCalled();

    await dispatcher(ACTION_RELOAD_DOCK);
    expect(reloadDockFromConfig).toHaveBeenCalled();
    reloadDockFromConfig.mockRejectedValueOnce(new Error('reload'));
    await dispatcher(ACTION_RELOAD_DOCK);

    await dispatcher(ACTION_SHOW_DEVTOOLS);
    await dispatcher(ACTION_INSPECT_SHARED_WORKER);
    await dispatcher(ACTION_TOGGLE_PROVIDER);

    // export uses the module configManager
    cm.getConfig
      .mockResolvedValueOnce({ configId: 'dock-config' })
      .mockResolvedValueOnce({ configId: 'component-registry' });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await dispatcher(ACTION_EXPORT_CONFIG);
    expect(click).toHaveBeenCalled();
    click.mockRestore();

    await dispatcher('unknown-action');
    expect(console.warn).toHaveBeenCalledWith('Unknown dock action: unknown-action');
  });

  it('resets active workspace when the last browser window closes', async () => {
    const settle = () => new Promise((r) => setTimeout(r, 0));
    await initWorkspace();
    expect(windowClosedHandler).toBeTypeOf('function');
    browserGetAllWindows.mockResolvedValueOnce([{ identity: { name: 'w1' } }]);
    windowClosedHandler!({ name: 'w1' });
    await settle();
    expect(setActiveWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: 'untitled-workspace', title: 'Untitled' }),
    );

    setActiveWorkspace.mockRejectedValueOnce(new Error('reset fail'));
    browserGetAllWindows.mockResolvedValueOnce([]);
    windowClosedHandler!({});
    await settle();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('resetActiveWorkspaceWhenEmpty failed'),
      expect.anything(),
    );
  });

  it('tears down components on provider close-requested', async () => {
    await initWorkspace();
    expect(closeRequestedHandler).toBeTypeOf('function');
    await closeRequestedHandler!();
    expect(Home.deregister).toHaveBeenCalled();
    expect(Storefront.deregister).toHaveBeenCalled();
    expect(shutdownDock).toHaveBeenCalled();
    expect(cm.dispose).toHaveBeenCalled();
    expect(platformQuit).toHaveBeenCalled();
  });


  it('runThemeToggle flips data-theme and coalesces rapid re-entry', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    await initWorkspace();
    expect(capturedCustomActionDeps?.runThemeToggle).toBeTypeOf('function');
    const cont = vi.fn().mockResolvedValue(undefined);
    await Promise.all([
      capturedCustomActionDeps!.runThemeToggle(cont),
      capturedCustomActionDeps!.runThemeToggle(cont),
    ]);
    expect(cont).toHaveBeenCalledTimes(1);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('reads persisted theme from localStorage when data-theme is missing', async () => {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem('starui:theme', 'light');
    await initWorkspace();
    await capturedCustomActionDeps!.runThemeToggle(vi.fn());
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('warns when syncPlatformColorScheme cannot call setSelectedScheme', async () => {
    setSelectedScheme.mockImplementationOnce(() => {
      throw new Error('scheme unavailable');
    });
    await initWorkspace();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('setSelectedScheme failed'),
      expect.anything(),
    );
  });

  it('exports dock and registry rows through exportAllConfig', async () => {
    await initWorkspace();
    cm.getConfig
      .mockResolvedValueOnce({ configId: 'dock-config', payload: { buttons: [] } })
      .mockResolvedValueOnce({ configId: 'component-registry', payload: { entries: [] } });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await capturedCustomActionDeps!.exportAllConfig(cm);
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });

  it('supports selective component registration and excludeTools wiring', async () => {
    await initWorkspace({
      components: { home: false, store: true, dock: true, notifications: false },
      dock: { excludeTools: ['export-config'] },
    });
    expect(registerHome).not.toHaveBeenCalled();
    expect(registerStore).toHaveBeenCalled();
    expect(registerDock).toHaveBeenCalled();
    expect(registerNotifications).not.toHaveBeenCalled();
    expect(setExcludedDockTools).toHaveBeenCalledWith(['export-config']);
  });

  it('does not reset active workspace while browser windows remain open', async () => {
    const settle = () => new Promise((r) => setTimeout(r, 0));
    await initWorkspace();
    browserGetAllWindows.mockResolvedValueOnce([
      { identity: { name: 'w1' } },
      { identity: { name: 'w2' } },
    ]);
    windowClosedHandler!({ name: 'w1' });
    await settle();
    expect(setActiveWorkspace).not.toHaveBeenCalled();
  });

  it('skips active-workspace reset while the platform is quitting', async () => {
    const settle = () => new Promise((r) => setTimeout(r, 0));
    await initWorkspace();
    await closeRequestedHandler!();
    browserGetAllWindows.mockResolvedValueOnce([]);
    windowClosedHandler!({});
    await settle();
    expect(setActiveWorkspace).not.toHaveBeenCalled();
  });

  it('logs when platform-api-ready component registration fails', async () => {
    registerHome.mockRejectedValueOnce(new Error('home fail'));
    await initWorkspace({ components: { home: true, store: false, dock: false, notifications: false } });
    expect(console.error).toHaveBeenCalledWith(
      'Failed to initialize workspace components:',
      expect.anything(),
    );
  });

  it('dock dispatcher covers config-browser uuid fallback and error paths', async () => {
    getPlatformDefaultScope.mockReturnValueOnce({ appId: '', userId: 'dev1' });
    await initWorkspace();
    const dispatcher = (registerDock as unknown as {
      dispatcher: (id: string, data?: unknown) => Promise<void>;
    }).dispatcher;

    await dispatcher(ACTION_OPEN_CONFIG_BROWSER);
    expect(openChildToolWindow).toHaveBeenCalledWith(
      'config-browser',
      '/config-browser',
      1100,
      720,
      expect.objectContaining({ customData: { appId: 'plat-uuid', userId: 'dev1' } }),
    );

    (fin.Application.getCurrentSync as ReturnType<typeof vi.fn>).mockReturnValue({
      getViews: vi.fn().mockResolvedValue([
        { inspectSharedWorker: vi.fn().mockRejectedValue(new Error('no worker')) },
      ]),
    });
    await dispatcher(ACTION_INSPECT_SHARED_WORKER);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('No view has a SharedWorker'),
      expect.anything(),
    );

    (fin.Application.getCurrentSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error('views unavailable');
    });
    await dispatcher(ACTION_INSPECT_SHARED_WORKER);
    expect(console.error).toHaveBeenCalledWith('Failed to inspect shared worker.', expect.anything());

    const providerWindow = fin.Window.getCurrentSync();
    providerWindow.showDeveloperTools.mockRejectedValueOnce(new Error('devtools fail'));
    await dispatcher(ACTION_SHOW_DEVTOOLS);
    expect(console.error).toHaveBeenCalledWith('Failed to open developer tools.', expect.anything());

    providerWindow.isShowing.mockResolvedValueOnce(false);
    await dispatcher(ACTION_TOGGLE_PROVIDER);
    expect(providerWindow.show).toHaveBeenCalled();
  });
});
