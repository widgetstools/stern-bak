import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CustomActionCallerType = {
  CustomButton: 'CustomButton',
  CustomDropdownItem: 'CustomDropdownItem',
  ViewTabContextMenu: 'ViewTabContextMenu',
};
const ColorSchemeOptionType = { Dark: 'dark', Light: 'light' };
const setSelectedScheme = vi.fn();
const createWindow = vi.fn();
const launchApp = vi.fn();
const launchRegisteredComponent = vi.fn();
const recolorDockIcons = vi.fn();
const reloadDockFromConfig = vi.fn();
const openDataProvidersToolWindow = vi.fn();
const getPlatformDefaultScope = vi.fn(() => ({ appId: 'TestApp', userId: 'dev1' }));

vi.mock('@openfin/workspace-platform', () => ({
  CustomActionCallerType,
  ColorSchemeOptionType,
  ViewTabMenuOptionType: { Custom: 'Custom' },
  getCurrentSync: () => ({
    Theme: { setSelectedScheme },
    createWindow,
  }),
}));

vi.mock('../dock.js', async () => {
  const topics = await import('../iabTopics.js');
  return {
    ...topics,
    recolorDockIcons: (...a: unknown[]) => recolorDockIcons(...a),
    reloadDockFromConfig: (...a: unknown[]) => reloadDockFromConfig(...a),
  };
});

vi.mock('../launch.js', () => ({
  launchApp: (...a: unknown[]) => launchApp(...a),
  launchRegisteredComponent: (...a: unknown[]) => launchRegisteredComponent(...a),
}));

vi.mock('../db.js', () => ({
  getPlatformDefaultScope: () => getPlatformDefaultScope(),
}));

vi.mock('../openChildToolWindow.js', () => ({
  openDataProvidersToolWindow: (...a: unknown[]) => openDataProvidersToolWindow(...a),
}));

vi.mock('../buildPlatformChildUrl.js', () => ({
  buildPlatformChildUrl: (providerUrl: string, path: string) => {
    if (!providerUrl) return null;
    return `http://app.example${path}`;
  },
}));

const { buildCustomActions } = await import('./customActions.js');
const {
  ACTION_EXPORT_CONFIG,
  ACTION_IMPORT_CONFIG,
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
  ACTION_TOGGLE_THEME,
} = await import('../iabTopics.js');

const btn = CustomActionCallerType.CustomButton;
const drop = CustomActionCallerType.CustomDropdownItem;

describe('buildCustomActions', () => {
  const runThemeToggle = vi.fn(async (cont: (isDark: boolean) => Promise<void>) => {
    await cont(true);
  });
  const openChildWindow = vi.fn();
  const exportAllConfig = vi.fn();
  const getConfigManager = vi.fn();

  let actions: ReturnType<typeof buildCustomActions>;
  let existingWindow: { setAsForeground: ReturnType<typeof vi.fn> };
  let providerWindow: {
    showDeveloperTools: ReturnType<typeof vi.fn>;
    isShowing: ReturnType<typeof vi.fn>;
    hide: ReturnType<typeof vi.fn>;
    show: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    for (const fn of [
      setSelectedScheme,
      createWindow,
      launchApp,
      launchRegisteredComponent,
      recolorDockIcons,
      reloadDockFromConfig,
      openDataProvidersToolWindow,
      openChildWindow,
      exportAllConfig,
      getConfigManager,
      runThemeToggle,
    ]) {
      fn.mockReset();
    }
    runThemeToggle.mockImplementation(async (cont) => {
      await cont(true);
    });
    recolorDockIcons.mockResolvedValue(undefined);
    reloadDockFromConfig.mockResolvedValue(undefined);
    openChildWindow.mockResolvedValue(undefined);
    exportAllConfig.mockResolvedValue(undefined);
    getConfigManager.mockReturnValue({ id: 'cm' });
    existingWindow = { setAsForeground: vi.fn().mockResolvedValue(undefined) };
    providerWindow = {
      showDeveloperTools: vi.fn().mockResolvedValue(undefined),
      isShowing: vi.fn().mockResolvedValue(true),
      hide: vi.fn().mockResolvedValue(undefined),
      show: vi.fn().mockResolvedValue(undefined),
    };
    vi.stubGlobal('fin', {
      me: { identity: { uuid: 'plat' } },
      InterApplicationBus: {
        publish: vi.fn().mockResolvedValue(undefined),
      },
      Window: {
        wrapSync: vi.fn(() => {
          throw new Error('missing');
        }),
        getCurrentSync: vi.fn(() => providerWindow),
      },
      Application: {
        getCurrent: vi.fn().mockResolvedValue({
          getManifest: vi.fn().mockResolvedValue({
            platform: { providerUrl: 'http://app.example/provider' },
          }),
        }),
        getCurrentSync: vi.fn(() => ({
          getViews: vi.fn().mockResolvedValue([
            { inspectSharedWorker: vi.fn().mockResolvedValue(undefined) },
          ]),
        })),
      },
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    actions = buildCustomActions({
      runThemeToggle,
      openChildWindow,
      getConfigManager,
      exportAllConfig,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('no-ops launch-app / launch-component for the wrong callerType', async () => {
    await actions[ACTION_LAUNCH_APP]({
      callerType: CustomActionCallerType.ViewTabContextMenu,
      customData: { appId: 'x' },
    } as never);
    await actions[ACTION_LAUNCH_COMPONENT]({
      callerType: CustomActionCallerType.ViewTabContextMenu,
      customData: { registryEntryId: 'e1' },
    } as never);
    expect(launchApp).not.toHaveBeenCalled();
    expect(launchRegisteredComponent).not.toHaveBeenCalled();
  });

  it('launches apps and registered components from dock callers', async () => {
    const app = { appId: 'a' };
    await actions[ACTION_LAUNCH_APP]({ callerType: btn, customData: app } as never);
    expect(launchApp).toHaveBeenCalledWith(app);

    await actions[ACTION_LAUNCH_COMPONENT]({
      callerType: drop,
      customData: { registryEntryId: 'e1', asWindow: true },
    } as never);
    expect(launchRegisteredComponent).toHaveBeenCalledWith('e1', { asWindow: true });

    await actions[ACTION_LAUNCH_COMPONENT]({
      callerType: btn,
      customData: {},
    } as never);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('missing registryEntryId'),
    );
  });

  it('toggles theme via runThemeToggle and swallows IAB publish failures', async () => {
    (fin.InterApplicationBus.publish as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('iab'),
    );
    await actions[ACTION_TOGGLE_THEME]({ callerType: drop } as never);
    expect(runThemeToggle).not.toHaveBeenCalled();

    await actions[ACTION_TOGGLE_THEME]({ callerType: btn } as never);
    expect(setSelectedScheme).toHaveBeenCalledWith(ColorSchemeOptionType.Dark);
    expect(recolorDockIcons).toHaveBeenCalledWith(true);
    expect(console.warn).toHaveBeenCalledWith('IAB publish failed:', expect.anything());
  });

  it('opens child tool windows (create path) with scope customData', async () => {
    await actions[ACTION_OPEN_DOCK_EDITOR]({ callerType: btn } as never);
    expect(createWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'dock-editor',
        url: 'http://app.example/dock-editor',
        customData: { appId: 'TestApp', userId: 'dev1' },
      }),
    );

    await actions[ACTION_OPEN_REGISTRY_EDITOR]({ callerType: drop } as never);
    expect(createWindow).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'registry-editor' }),
    );

    await actions[ACTION_OPEN_CONFIG_BROWSER]({ callerType: btn } as never);
    expect(createWindow).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'config-browser' }),
    );

    await actions[ACTION_OPEN_WORKSPACE_SETUP]({ callerType: btn } as never);
    expect(openChildWindow).toHaveBeenCalledWith(
      'workspace-setup',
      '/workspace-setup',
      1280,
      760,
      expect.objectContaining({ customData: { appId: 'TestApp', userId: 'dev1' } }),
    );

    await actions[ACTION_OPEN_DATA_PROVIDERS]({ callerType: btn } as never);
    expect(openDataProvidersToolWindow).toHaveBeenCalled();
  });

  it('foregrounds an existing dock-editor window', async () => {
    (fin.Window.wrapSync as ReturnType<typeof vi.fn>).mockReturnValue(existingWindow);
    await actions[ACTION_OPEN_DOCK_EDITOR]({ callerType: btn } as never);
    expect(existingWindow.setAsForeground).toHaveBeenCalled();
    expect(createWindow).not.toHaveBeenCalled();
  });

  it('handles reload / devtools / export / import / toggle provider', async () => {
    await actions[ACTION_RELOAD_DOCK]({ callerType: btn } as never);
    expect(reloadDockFromConfig).not.toHaveBeenCalled();
    await actions[ACTION_RELOAD_DOCK]({ callerType: drop } as never);
    expect(reloadDockFromConfig).toHaveBeenCalled();

    reloadDockFromConfig.mockRejectedValueOnce(new Error('reload fail'));
    await actions[ACTION_RELOAD_DOCK]({ callerType: drop } as never);
    expect(console.error).toHaveBeenCalledWith(
      'Failed to reload dock.',
      expect.anything(),
    );

    await actions[ACTION_SHOW_DEVTOOLS]({ callerType: drop } as never);
    expect(providerWindow.showDeveloperTools).toHaveBeenCalled();

    await actions[ACTION_EXPORT_CONFIG]({ callerType: drop } as never);
    expect(exportAllConfig).toHaveBeenCalledWith({ id: 'cm' });

    getConfigManager.mockReturnValueOnce(undefined);
    await actions[ACTION_EXPORT_CONFIG]({ callerType: drop } as never);
    expect(console.error).toHaveBeenCalledWith('ConfigManager not initialized.');

    await actions[ACTION_IMPORT_CONFIG]({ callerType: drop } as never);
    expect(createWindow).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'import-config' }),
    );

    await actions[ACTION_TOGGLE_PROVIDER]({ callerType: drop } as never);
    expect(providerWindow.hide).toHaveBeenCalled();
    providerWindow.isShowing.mockResolvedValueOnce(false);
    await actions[ACTION_TOGGLE_PROVIDER]({ callerType: drop } as never);
    expect(providerWindow.show).toHaveBeenCalled();
  });

  it('inspects the first view that has a SharedWorker', async () => {
    const bad = { inspectSharedWorker: vi.fn().mockRejectedValue(new Error('no')) };
    const good = { inspectSharedWorker: vi.fn().mockResolvedValue(undefined) };
    (fin.Application.getCurrentSync as ReturnType<typeof vi.fn>).mockReturnValue({
      getViews: vi.fn().mockResolvedValue([bad, good]),
    });
    await actions[ACTION_INSPECT_SHARED_WORKER]({ callerType: drop } as never);
    expect(good.inspectSharedWorker).toHaveBeenCalled();

    (fin.Application.getCurrentSync as ReturnType<typeof vi.fn>).mockReturnValue({
      getViews: vi.fn().mockResolvedValue([]),
    });
    await actions[ACTION_INSPECT_SHARED_WORKER]({ callerType: drop } as never);
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('No views are open'),
    );
  });

  it('logs when every view rejects inspectSharedWorker', async () => {
    (fin.Application.getCurrentSync as ReturnType<typeof vi.fn>).mockReturnValue({
      getViews: vi.fn().mockResolvedValue([
        { inspectSharedWorker: vi.fn().mockRejectedValue(new Error('no worker')) },
      ]),
    });
    await actions[ACTION_INSPECT_SHARED_WORKER]({ callerType: drop } as never);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('No view has a SharedWorker'),
      expect.anything(),
    );
  });
});
