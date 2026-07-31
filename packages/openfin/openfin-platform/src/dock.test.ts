import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const classicRegister = vi.fn();
const classicShow = vi.fn();
const classicDeregister = vi.fn();
const classicUpdate = vi.fn();
const dockInit = vi.fn();
const getSelectedScheme = vi.fn();
const setSelectedScheme = vi.fn();
const loadDockConfig = vi.fn();
const saveDockConfig = vi.fn();

vi.mock('@openfin/workspace', () => ({
  Dock: {
    register: (...a: unknown[]) => classicRegister(...a),
    show: (...a: unknown[]) => classicShow(...a),
    deregister: (...a: unknown[]) => classicDeregister(...a),
  },
  DockButtonNames: {
    DropdownButton: 'DropdownButton',
    ActionButton: 'ActionButton',
  },
}));

vi.mock('@openfin/workspace-platform', () => ({
  Dock: { init: (...a: unknown[]) => dockInit(...a) },
  ColorSchemeOptionType: { Dark: 'dark', Light: 'light' },
  getCurrentSync: () => ({
    Theme: { getSelectedScheme, setSelectedScheme },
  }),
}));

vi.mock('./db.js', () => ({
  loadDockConfig: (...a: unknown[]) => loadDockConfig(...a),
  saveDockConfig: (...a: unknown[]) => saveDockConfig(...a),
}));

const {
  __resetDockStateForTests,
  getDefaultEditorConfig,
  registerDock,
  recolorDockIcons,
  reloadDockFromConfig,
  setExcludedDockTools,
  shutdownDock,
  updateDockButtons,
  ACTION_TOGGLE_THEME,
} = await import('./dock.js');

const settings = { id: 'plat', title: 'Platform', icon: 'icon.png' };

describe('dock', () => {
  let iabSubscribe: ReturnType<typeof vi.fn>;
  let iabUnsubscribe: ReturnType<typeof vi.fn>;
  let iabPublish: ReturnType<typeof vi.fn>;
  let dockProvider: {
    updateConfig: ReturnType<typeof vi.fn>;
    shutdown: ReturnType<typeof vi.fn>;
  };
  let capturedOverride: ((Base: unknown) => new () => unknown) | undefined;

  beforeEach(() => {
    __resetDockStateForTests();
    capturedOverride = undefined;
    dockProvider = {
      updateConfig: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
    };
    classicRegister.mockReset().mockResolvedValue({
      updateDockProviderConfig: classicUpdate.mockResolvedValue(undefined),
    });
    classicShow.mockReset().mockResolvedValue(undefined);
    classicDeregister.mockReset().mockResolvedValue(undefined);
    classicUpdate.mockReset().mockResolvedValue(undefined);
    dockInit.mockReset().mockImplementation(async (opts: { override?: typeof capturedOverride }) => {
      capturedOverride = opts.override;
      return dockProvider;
    });
    getSelectedScheme.mockReset().mockResolvedValue('light');
    setSelectedScheme.mockReset();
    loadDockConfig.mockReset().mockResolvedValue(null);
    saveDockConfig.mockReset().mockResolvedValue(undefined);
    iabSubscribe = vi.fn().mockResolvedValue(undefined);
    iabUnsubscribe = vi.fn().mockResolvedValue(undefined);
    iabPublish = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fin', {
      me: { identity: { uuid: 'plat' } },
      InterApplicationBus: {
        subscribe: iabSubscribe,
        unsubscribe: iabUnsubscribe,
        publish: iabPublish,
      },
    });
    document.documentElement.setAttribute('data-theme', 'dark');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    __resetDockStateForTests();
  });

  it('getDefaultEditorConfig delegates to appsToEditorConfig', () => {
    const cfg = getDefaultEditorConfig(
      [{ appId: 'a', title: 'A', icons: [{ src: 'a.svg' }] }] as never,
      'fb.svg',
    );
    expect(cfg.buttons).toHaveLength(1);
    expect(cfg.buttons[0]).toMatchObject({ type: 'ActionButton', tooltip: 'A' });
  });

  it('setExcludedDockTools filters classic Tools options', async () => {
    setExcludedDockTools(['export-config', 'import-config']);
    await registerDock(settings as never, [], undefined, undefined, undefined, undefined, undefined, 'dock2');
    const provider = classicRegister.mock.calls[0][0];
    const tools = provider.buttons.find((b: { tooltip: string }) => b.tooltip === 'Tools');
    const ids = tools.options.map((o: { action: { id: string } }) => o.action.id);
    expect(ids).not.toContain('export-config');
    expect(ids).not.toContain('import-config');
    expect(ids).toContain('reload-dock');
  });

  describe('dock2 (classic)', () => {
    it('registers, shows, and refreshes idempotently', async () => {
      const reg = await registerDock(settings as never, [], undefined, undefined, undefined, undefined, undefined, 'dock2');
      expect(classicRegister).toHaveBeenCalledTimes(1);
      expect(classicShow).toHaveBeenCalled();
      expect(iabSubscribe).toHaveBeenCalled();

      const again = await registerDock(settings as never, [], undefined, undefined, undefined, undefined, undefined, 'dock2');
      expect(again).toBe(reg);
      expect(classicRegister).toHaveBeenCalledTimes(1);
      expect(classicUpdate).toHaveBeenCalled();
    });

    it('returns undefined when ClassicDock.register throws', async () => {
      classicRegister.mockRejectedValueOnce(new Error('classic boom'));
      await expect(
        registerDock(settings as never, [], undefined, undefined, undefined, undefined, undefined, 'dock2'),
      ).resolves.toBeUndefined();
    });

    it('reloads via soft update and shuts down with swallow paths', async () => {
      await registerDock(settings as never, [], undefined, undefined, undefined, undefined, undefined, 'dock2');
      loadDockConfig.mockResolvedValueOnce({
        version: 1,
        updatedAt: '',
        buttons: [],
      });
      await reloadDockFromConfig();
      expect(classicUpdate).toHaveBeenCalled();

      classicDeregister.mockRejectedValueOnce(new Error('dereg'));
      iabUnsubscribe.mockRejectedValueOnce(new Error('unsub'));
      await shutdownDock();
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('dock3', () => {
    it('initializes Dock.init and refreshes idempotently', async () => {
      const provider = await registerDock(
        settings as never,
        [],
        undefined,
        undefined,
        undefined,
        undefined,
        vi.fn(),
        'dock3',
      );
      expect(provider).toBe(dockProvider);
      expect(dockInit).toHaveBeenCalledTimes(1);
      expect(capturedOverride).toBeTypeOf('function');

      await registerDock(settings as never, [], undefined, undefined, undefined, undefined, vi.fn(), 'dock3');
      expect(dockInit).toHaveBeenCalledTimes(1);
      expect(dockProvider.updateConfig).toHaveBeenCalled();
    });

    it('returns undefined when Dock.init fails', async () => {
      dockInit.mockRejectedValueOnce(new Error('init fail'));
      await expect(
        registerDock(settings as never, [], undefined, undefined, undefined, undefined, undefined, 'dock3'),
      ).resolves.toBeUndefined();
    });

    it('hard-reloads on reloadDockFromConfig and continues if shutdown fails', async () => {
      await registerDock(settings as never, [], undefined, undefined, undefined, undefined, vi.fn(), 'dock3');
      dockProvider.shutdown.mockRejectedValueOnce(new Error('shutdown fail'));
      await reloadDockFromConfig();
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('shutdown failed'),
        expect.anything(),
      );
      expect(dockInit).toHaveBeenCalledTimes(2);
    });

    it('updateDockButtons / recolorDockIcons push config', async () => {
      await registerDock(settings as never, [], undefined, undefined, undefined, undefined, vi.fn(), 'dock3');
      await updateDockButtons({ version: 1, updatedAt: '', buttons: [] });
      expect(saveDockConfig).toHaveBeenCalled();
      expect(dockProvider.updateConfig).toHaveBeenCalled();
      await recolorDockIcons(true);
      expect(dockProvider.updateConfig).toHaveBeenCalled();
    });

    it('override launchEntry toggles theme and swallows dispatcher errors', async () => {
      const dispatcher = vi.fn().mockRejectedValue(new Error('action boom'));
      await registerDock(settings as never, [], undefined, undefined, undefined, undefined, dispatcher, 'dock3');
      const Override = capturedOverride!(class {
        config = { favorites: [], contentMenu: [] };
      });
      const instance = new Override() as {
        loadConfig: () => Promise<unknown>;
        saveConfig: (p: { config: unknown }) => Promise<void>;
        launchEntry: (p: { entry: unknown }) => Promise<void>;
        bookmarkContentMenuEntry: (p: { entry: unknown }) => Promise<void>;
        config: unknown;
      };

      loadDockConfig.mockResolvedValueOnce({ version: 1, updatedAt: '', buttons: [] });
      await instance.loadConfig();
      await instance.saveConfig({ config: { favorites: [] } });
      await instance.bookmarkContentMenuEntry({ entry: {} });

      await instance.launchEntry({
        entry: { id: 'theme-toggle', itemData: { actionId: ACTION_TOGGLE_THEME } },
      });
      expect(setSelectedScheme).toHaveBeenCalled();
      expect(iabPublish).toHaveBeenCalled();

      await instance.launchEntry({
        entry: { itemData: { actionId: 'launch-app', customData: { appId: 'x' } } },
      });
      expect(dispatcher).toHaveBeenCalledWith('launch-app', { appId: 'x' });
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('launchEntry handler threw'),
        expect.anything(),
      );

      loadDockConfig.mockRejectedValueOnce(new Error('load fail'));
      await expect(instance.loadConfig()).resolves.toBeDefined();
    });

    it('override launchEntry warns when no dispatcher is registered', async () => {
      await registerDock(settings as never, [], undefined, undefined, undefined, undefined, undefined, 'dock3');
      const Override = capturedOverride!(class {
        config = {};
      });
      const instance = new Override() as {
        launchEntry: (p: { entry: unknown }) => Promise<void>;
      };
      await instance.launchEntry({
        entry: { itemData: { actionId: 'launch-app' } },
      });
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('No action dispatcher'),
      );
    });

    it('swallows IAB subscribe failures during dock3 init', async () => {
      iabSubscribe.mockRejectedValue(new Error('iab'));
      await registerDock(settings as never, [], undefined, undefined, undefined, undefined, vi.fn(), 'dock3');
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('Could not subscribe'),
        expect.anything(),
      );
    });
  });
});
