import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { OpenFinRuntime } from './OpenFinRuntime.js';
import type { Theme } from '@wellsfargo-starui/types';

describe('OpenFinRuntime', () => {
  let originalFin: unknown;
  let rt: OpenFinRuntime | null = null;

  beforeEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    originalFin = (globalThis as any).fin;
  });

  afterEach(() => {
    rt?.dispose();
    rt = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fin = originalFin;
    document.documentElement.removeAttribute('data-theme');
  });

  describe('create()', () => {
    it('rejects when fin is missing and allowMissingFin is false', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fin = undefined;
      await expect(OpenFinRuntime.create()).rejects.toThrow(/`fin` is not available/);
    });

    it('succeeds in degraded mode when allowMissingFin is true', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fin = undefined;
      rt = await OpenFinRuntime.create({
        allowMissingFin: true,
        identity: { appId: 'a', userId: 'u' },
      });
      expect(rt.name).toBe('openfin');
      expect(rt.resolveIdentity().appId).toBe('a');
    });
  });

  describe('theme', () => {
    it('reads [data-theme]="dark" at construction', async () => {
      document.documentElement.setAttribute('data-theme', 'dark');
      rt = await OpenFinRuntime.create({ allowMissingFin: true });
      expect(rt.getTheme()).toBe('dark');
    });

    it('emits onThemeChanged when [data-theme] mutates', async () => {
      document.documentElement.setAttribute('data-theme', 'light');
      rt = await OpenFinRuntime.create({ allowMissingFin: true });
      const observed: Theme[] = [];
      rt.onThemeChanged((t) => observed.push(t));
      document.documentElement.setAttribute('data-theme', 'dark');
      await new Promise((r) => setTimeout(r, 0));
      expect(observed).toEqual(['dark']);
    });
  });

  describe('openSurface', () => {
    it('popout creates a named platform window via Platform.createWindow + returns a SurfaceHandle', async () => {
      const createCalls: Array<Record<string, unknown>> = [];
      const closedListeners = new Set<() => void>();
      const fakeWin = {
        on: (event: string, fn: () => void) => {
          if (event === 'closed') closedListeners.add(fn);
        },
        removeListener: () => {},
        close: () => { closedListeners.forEach((fn) => fn()); },
        setAsForeground: () => {},
      };
      const fakeView = { identity: { name: 'v' }, getOptions: async () => ({}) };
      const fakePlatform = {
        createWindow: async (opts: Record<string, unknown>) => {
          createCalls.push(opts);
          return fakeWin;
        },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fin = {
        me: { identity: { uuid: 'app1' } },
        View: { getCurrentSync: () => fakeView },
        Window: {
          // wrapSync throws when window doesn't exist → falls through to Platform.createWindow
          wrapSync: () => { throw new Error('not-found'); },
        },
        Platform: { getCurrentSync: () => fakePlatform },
      };
      rt = await OpenFinRuntime.create();

      const handle = await rt.openSurface({
        kind: 'popout',
        url: 'https://example/x',
        windowName: 'data-providers',
        width: 800,
        height: 600,
        customData: { providerId: 'p1' },
      });

      expect(createCalls).toHaveLength(1);
      expect(createCalls[0]).toMatchObject({
        name: 'data-providers',
        url: 'https://example/x',
        defaultWidth: 800,
        defaultHeight: 600,
        customData: { providerId: 'p1' },
      });
      expect(handle.kind).toBe('popout');
      expect(handle.id).toBe('data-providers');

      // onClosed fires when fin emits 'closed'
      let closed = 0;
      handle.onClosed(() => closed++);
      closedListeners.forEach((fn) => fn());
      expect(closed).toBe(1);
    });

    it('popout focuses + navigates the existing window when one is found', async () => {
      const navigateCalls: string[] = [];
      const fakeExisting = {
        getInfo: async () => ({ url: 'https://example/old' }),
        setAsForeground: async () => {},
        navigate: async (url: string) => { navigateCalls.push(url); },
        on: () => {},
        removeListener: () => {},
        close: () => {},
      };
      const fakeView = { identity: { name: 'v' }, getOptions: async () => ({}) };
      const fakePlatform = {
        createWindow: async () => { throw new Error('should not be called'); },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fin = {
        me: { identity: { uuid: 'app1' } },
        View: { getCurrentSync: () => fakeView },
        Window: {
          wrapSync: () => fakeExisting,
        },
        Platform: { getCurrentSync: () => fakePlatform },
      };
      rt = await OpenFinRuntime.create();

      await rt.openSurface({
        kind: 'popout',
        url: 'https://example/new',
        windowName: 'data-providers',
      });

      expect(navigateCalls).toEqual(['https://example/new']);
    });

    it('inpage delegates to options.openInPage when registered', async () => {
      const fakeView = { identity: { name: 'v' }, getOptions: async () => ({}) };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fin = { View: { getCurrentSync: () => fakeView } };
      const handle = {
        kind: 'inpage' as const,
        id: 'h1',
        close: () => {},
        onClosed: () => () => {},
      };
      rt = await OpenFinRuntime.create({ openInPage: () => handle });
      const got = await rt.openSurface({ kind: 'inpage', url: '/x' });
      expect(got).toBe(handle);
    });
  });

  describe('lifecycle bridging', () => {
    it('view "shown" / "destroyed" events fan out to listeners', async () => {
      let shownHandler: (() => void) | undefined;
      let destroyedHandler: (() => void) | undefined;
      const fakeView = {
        identity: { name: 'v' },
        getOptions: async () => ({}),
        on: (event: string, fn: () => void) => {
          if (event === 'shown') shownHandler = fn;
          if (event === 'destroyed') destroyedHandler = fn;
        },
        removeListener: () => {},
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fin = { View: { getCurrentSync: () => fakeView } };
      rt = await OpenFinRuntime.create();
      let shownCount = 0, closingCount = 0;
      rt.onWindowShown(() => shownCount++);
      rt.onWindowClosing(() => closingCount++);
      shownHandler?.();
      destroyedHandler?.();
      expect(shownCount).toBe(1);
      expect(closingCount).toBe(1);
    });

    it('dispose() detaches the view event listeners and clears state', async () => {
      const removeCalls: string[] = [];
      const fakeView = {
        identity: { name: 'v' },
        getOptions: async () => ({}),
        on: () => {},
        removeListener: (event: string) => { removeCalls.push(event); },
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fin = { View: { getCurrentSync: () => fakeView } };
      rt = await OpenFinRuntime.create();
      rt.dispose();
      expect(removeCalls.sort()).toEqual(['destroyed', 'shown']);
      rt = null; // already disposed
    });

    it('platform "workspace-saved" event fans out to onWorkspaceSave listeners', async () => {
      let workspaceSavedHandler: (() => void) | undefined;
      const fakeView = {
        identity: { name: 'v' },
        getOptions: async () => ({}),
        on: () => {},
        removeListener: () => {},
      };
      const fakePlatform = {
        on: (event: string, fn: () => void) => {
          if (event === 'workspace-saved') workspaceSavedHandler = fn;
        },
        removeListener: () => {},
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fin = {
        View: { getCurrentSync: () => fakeView },
        Platform: { getCurrentSync: () => fakePlatform },
      };
      rt = await OpenFinRuntime.create();
      let saves = 0;
      const unsub = rt.onWorkspaceSave(() => { saves++; });
      workspaceSavedHandler?.();
      workspaceSavedHandler?.();
      unsub();
      workspaceSavedHandler?.();
      expect(saves).toBe(2);
    });

    it('onWorkspaceSave is a no-op when fin.Platform is missing (older runtimes)', async () => {
      const fakeView = {
        identity: { name: 'v' },
        getOptions: async () => ({}),
        on: () => {},
        removeListener: () => {},
      };
      // No fin.Platform — bridge should silently skip without throwing.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fin = { View: { getCurrentSync: () => fakeView } };
      rt = await OpenFinRuntime.create();
      // Subscribing should still work (just never fires) and the
      // returned unsubscribe should be callable without error.
      const unsub = rt.onWorkspaceSave(() => {});
      expect(typeof unsub).toBe('function');
      unsub();
    });
  });
});
