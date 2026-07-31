import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { OpenFinRuntime } from './OpenFinRuntime.js';
import { THEME_STORAGE_KEY, type Theme } from '@wellsfargo-starui/types';

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
    document.documentElement.removeAttribute('data-ag-theme-mode');
    delete document.body.dataset['agThemeMode'];
    window.localStorage.clear();
    vi.useRealTimers();
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

    it('falls back to the persisted localStorage choice when [data-theme] is absent', async () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
      rt = await OpenFinRuntime.create({ allowMissingFin: true });
      expect(rt.getTheme()).toBe('dark');
    });

    it('falls back to light when storage holds an unrecognised value', async () => {
      window.localStorage.setItem(THEME_STORAGE_KEY, 'solarized');
      rt = await OpenFinRuntime.create({ allowMissingFin: true });
      expect(rt.getTheme()).toBe('light');
    });

    it('unsubscribing stops delivery to that listener only', async () => {
      document.documentElement.setAttribute('data-theme', 'light');
      rt = await OpenFinRuntime.create({ allowMissingFin: true });
      const kept: Theme[] = [];
      const dropped: Theme[] = [];
      rt.onThemeChanged((t) => kept.push(t));
      const unsub = rt.onThemeChanged((t) => dropped.push(t));
      unsub();
      rt.setTheme('dark');
      expect(kept).toEqual(['dark']);
      expect(dropped).toEqual([]);
    });
  });

  describe('setTheme', () => {
    it('writes DOM attributes, storage, and notifies listeners', async () => {
      document.documentElement.setAttribute('data-theme', 'light');
      rt = await OpenFinRuntime.create({ allowMissingFin: true });
      const observed: Theme[] = [];
      rt.onThemeChanged((t) => observed.push(t));

      rt.setTheme('dark');

      expect(rt.getTheme()).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      // AG-Grid reads its theme mode from both the root attribute and,
      // in some integrations, body.dataset — the runtime writes both.
      expect(document.documentElement.getAttribute('data-ag-theme-mode')).toBe('dark');
      expect(document.body.dataset['agThemeMode']).toBe('dark');
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
      expect(observed).toEqual(['dark']);
    });

    it('is idempotent — setting the current theme does no work', async () => {
      document.documentElement.setAttribute('data-theme', 'light');
      rt = await OpenFinRuntime.create({ allowMissingFin: true });
      const observed: Theme[] = [];
      rt.onThemeChanged((t) => observed.push(t));

      rt.setTheme('light');

      expect(observed).toEqual([]);
      // No write happened at all, so storage stays untouched.
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    });

    it('is a no-op after dispose', async () => {
      document.documentElement.setAttribute('data-theme', 'light');
      rt = await OpenFinRuntime.create({ allowMissingFin: true });
      rt.dispose();
      rt.setTheme('dark');
      expect(rt.getTheme()).toBe('light');
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
      rt = null; // already disposed
    });

    it('publishes the change on the OpenFin IAB theme-changed topic', async () => {
      const published: Array<[string, unknown]> = [];
      const fakeView = { identity: { name: 'v' }, getOptions: async () => ({}) };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fin = {
        me: { identity: { uuid: 'app1' } },
        View: { getCurrentSync: () => fakeView },
        InterApplicationBus: {
          publish: (topic: string, payload: unknown) => { published.push([topic, payload]); },
          subscribe: () => {},
          unsubscribe: () => {},
        },
      };
      rt = await OpenFinRuntime.create();

      rt.setTheme('dark');

      expect(published).toEqual([['theme-changed', { theme: 'dark', isDark: true }]]);
    });

    it('swallows a throwing IAB publish — a broadcast failure must not break the local flip', async () => {
      const fakeView = { identity: { name: 'v' }, getOptions: async () => ({}) };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fin = {
        me: { identity: { uuid: 'app1' } },
        View: { getCurrentSync: () => fakeView },
        InterApplicationBus: {
          publish: () => { throw new Error('bus down'); },
          subscribe: () => {},
          unsubscribe: () => {},
        },
      };
      rt = await OpenFinRuntime.create();

      expect(() => rt!.setTheme('dark')).not.toThrow();
      expect(rt.getTheme()).toBe('dark');
    });

    it('skips the broadcast entirely when the IAB is unavailable', async () => {
      const fakeView = { identity: { name: 'v' }, getOptions: async () => ({}) };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fin = { View: { getCurrentSync: () => fakeView } };
      rt = await OpenFinRuntime.create();
      expect(() => rt!.setTheme('dark')).not.toThrow();
      expect(rt.getTheme()).toBe('dark');
    });
  });

  describe('IAB theme-changed subscription', () => {
    function installIab() {
      const handlers: Array<(msg: unknown) => void> = [];
      const unsubscribed: Array<(msg: unknown) => void> = [];
      const fakeView = { identity: { name: 'v' }, getOptions: async () => ({}) };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fin = {
        me: { identity: { uuid: 'app1' } },
        View: { getCurrentSync: () => fakeView },
        InterApplicationBus: {
          publish: () => {},
          subscribe: (_src: unknown, _topic: string, fn: (msg: unknown) => void) => { handlers.push(fn); },
          unsubscribe: (_src: unknown, _topic: string, fn: (msg: unknown) => void) => { unsubscribed.push(fn); },
        },
      };
      return { handlers, unsubscribed };
    }

    it('applies a peer window\'s theme locally without re-publishing', async () => {
      const { handlers } = installIab();
      document.documentElement.setAttribute('data-theme', 'light');
      rt = await OpenFinRuntime.create();
      const observed: Theme[] = [];
      rt.onThemeChanged((t) => observed.push(t));

      expect(handlers).toHaveLength(1);
      handlers[0]({ theme: 'dark', isDark: true });

      expect(rt.getTheme()).toBe('dark');
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
      expect(observed).toEqual(['dark']);
    });

    it('accepts the legacy { isDark } payload the dock publishes', async () => {
      const { handlers } = installIab();
      document.documentElement.setAttribute('data-theme', 'light');
      rt = await OpenFinRuntime.create();
      handlers[0]({ isDark: true });
      expect(rt.getTheme()).toBe('dark');
    });

    it('ignores an unreadable payload', async () => {
      const { handlers } = installIab();
      document.documentElement.setAttribute('data-theme', 'light');
      rt = await OpenFinRuntime.create();
      handlers[0]({ nothing: 'useful' });
      handlers[0](null);
      expect(rt.getTheme()).toBe('light');
    });

    it('unsubscribes on dispose', async () => {
      const { handlers, unsubscribed } = installIab();
      rt = await OpenFinRuntime.create();
      rt.dispose();
      expect(unsubscribed).toEqual([handlers[0]]);
      rt = null; // already disposed
    });

    it('degrades silently when subscribe throws', async () => {
      const fakeView = { identity: { name: 'v' }, getOptions: async () => ({}) };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fin = {
        me: { identity: { uuid: 'app1' } },
        View: { getCurrentSync: () => fakeView },
        InterApplicationBus: { subscribe: () => { throw new Error('no bus'); } },
      };
      rt = await OpenFinRuntime.create();
      expect(rt.getTheme()).toBe('light');
      // Dispose must still be clean even though nothing was registered.
      expect(() => rt!.dispose()).not.toThrow();
      rt = null; // already disposed
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

    it('inpage rejects when no openInPage handler was registered', async () => {
      const fakeView = { identity: { name: 'v' }, getOptions: async () => ({}) };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fin = { View: { getCurrentSync: () => fakeView } };
      rt = await OpenFinRuntime.create();
      await expect(rt.openSurface({ kind: 'inpage', url: '/x' })).rejects.toThrow(
        /no `openInPage` handler was registered/,
      );
    });

    it('popout rejects in degraded (no-fin) mode instead of silently doing nothing', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fin = undefined;
      rt = await OpenFinRuntime.create({ allowMissingFin: true });
      await expect(rt.openSurface({ kind: 'popout', url: '/x' })).rejects.toThrow(
        /`fin` is not available/,
      );
    });

    it('modal is aliased to popout and defaults name + size', async () => {
      const createCalls: Array<Record<string, unknown>> = [];
      const fakeWin = {
        on: () => {}, removeListener: () => {}, close: () => {}, setAsForeground: () => {},
      };
      const fakeView = { identity: { name: 'v' }, getOptions: async () => ({}) };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fin = {
        me: { identity: { uuid: 'app1' } },
        View: { getCurrentSync: () => fakeView },
        Window: { wrapSync: () => { throw new Error('not-found'); } },
        Platform: {
          getCurrentSync: () => ({
            createWindow: async (opts: Record<string, unknown>) => { createCalls.push(opts); return fakeWin; },
          }),
        },
      };
      rt = await OpenFinRuntime.create();

      const handle = await rt.openSurface({ kind: 'modal', url: 'https://example/m' });

      // No windowName / title given → '_blank'; no size given → the
      // platform tool-window defaults.
      expect(createCalls[0]).toMatchObject({
        name: '_blank',
        defaultWidth: 1180,
        defaultHeight: 760,
      });
      expect(handle.kind).toBe('modal');
    });

    it('popout falls back to the spec title for the window name', async () => {
      const createCalls: Array<Record<string, unknown>> = [];
      const fakeWin = {
        on: () => {}, removeListener: () => {}, close: () => {}, setAsForeground: () => {},
      };
      const fakeView = { identity: { name: 'v' }, getOptions: async () => ({}) };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fin = {
        me: { identity: { uuid: 'app1' } },
        View: { getCurrentSync: () => fakeView },
        Window: { wrapSync: () => { throw new Error('not-found'); } },
        Platform: {
          getCurrentSync: () => ({
            createWindow: async (opts: Record<string, unknown>) => { createCalls.push(opts); return fakeWin; },
          }),
        },
      };
      rt = await OpenFinRuntime.create();

      await rt.openSurface({ kind: 'popout', url: 'https://example/t', title: 'Providers' });

      expect(createCalls[0]).toMatchObject({ name: 'Providers' });
    });
  });

  describe('customData polling', () => {
    /** Build a view whose `getOptions()` returns whatever `current` holds. */
    function installPollingView(initial: Record<string, unknown>) {
      const state = { customData: initial as unknown, fail: false };
      const fakeView = {
        identity: { name: 'v' },
        getOptions: async () => {
          if (state.fail) throw new Error('view gone');
          return { customData: state.customData };
        },
        on: () => {},
        removeListener: () => {},
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fin = { View: { getCurrentSync: () => fakeView } };
      return state;
    }

    it('emits only when customData actually changes', async () => {
      vi.useFakeTimers();
      const state = installPollingView({ activeProfileId: 'p1' });
      rt = await OpenFinRuntime.create();
      const seen: Array<Record<string, unknown>> = [];
      rt.onCustomDataChanged((cd) => seen.push({ ...cd }));

      // Same payload by value → the shallow compare suppresses it.
      state.customData = { activeProfileId: 'p1' };
      await vi.advanceTimersByTimeAsync(500);
      expect(seen).toEqual([]);

      state.customData = { activeProfileId: 'p2' };
      await vi.advanceTimersByTimeAsync(500);
      expect(seen).toEqual([{ activeProfileId: 'p2' }]);

      // A new key is a change even though the old ones are untouched.
      state.customData = { activeProfileId: 'p2', extra: 1 };
      await vi.advanceTimersByTimeAsync(500);
      expect(seen).toHaveLength(2);
    });

    it('does not poll while nobody is listening', async () => {
      vi.useFakeTimers();
      const state = installPollingView({ a: 1 });
      rt = await OpenFinRuntime.create();

      state.customData = { a: 2 };
      await vi.advanceTimersByTimeAsync(1500);

      // Subscribing now still sees the NEXT change, proving the earlier
      // ticks were skipped rather than consumed silently.
      const seen: Array<Record<string, unknown>> = [];
      rt.onCustomDataChanged((cd) => seen.push({ ...cd }));
      await vi.advanceTimersByTimeAsync(500);
      expect(seen).toEqual([{ a: 2 }]);
    });

    it('ignores non-object customData payloads', async () => {
      vi.useFakeTimers();
      const state = installPollingView({ a: 1 });
      rt = await OpenFinRuntime.create();
      const seen: unknown[] = [];
      rt.onCustomDataChanged((cd) => seen.push(cd));

      for (const bad of [null, 'nope', ['a'], undefined]) {
        state.customData = bad;
        await vi.advanceTimersByTimeAsync(500);
      }
      expect(seen).toEqual([]);
    });

    it('keeps polling after getOptions() rejects — the view may come back', async () => {
      vi.useFakeTimers();
      const state = installPollingView({ a: 1 });
      rt = await OpenFinRuntime.create();
      const seen: unknown[] = [];
      rt.onCustomDataChanged((cd) => seen.push(cd));

      state.fail = true;
      await vi.advanceTimersByTimeAsync(500);
      expect(seen).toEqual([]);

      state.fail = false;
      state.customData = { a: 2 };
      await vi.advanceTimersByTimeAsync(500);
      expect(seen).toHaveLength(1);
    });

    it('stops polling once disposed', async () => {
      vi.useFakeTimers();
      const state = installPollingView({ a: 1 });
      rt = await OpenFinRuntime.create();
      const seen: unknown[] = [];
      rt.onCustomDataChanged((cd) => seen.push(cd));
      rt.dispose();

      state.customData = { a: 2 };
      await vi.advanceTimersByTimeAsync(2000);
      expect(seen).toEqual([]);
      rt = null; // already disposed
    });

    it('unsubscribing removes just that listener', async () => {
      vi.useFakeTimers();
      const state = installPollingView({ a: 1 });
      rt = await OpenFinRuntime.create();
      const kept: unknown[] = [];
      rt.onCustomDataChanged((cd) => kept.push(cd));
      const unsub = rt.onCustomDataChanged(() => { throw new Error('should not fire'); });
      unsub();

      state.customData = { a: 2 };
      await vi.advanceTimersByTimeAsync(500);
      expect(kept).toHaveLength(1);
    });
  });

  describe('saved view title', () => {
    function installTitleView(customData: Record<string, unknown>) {
      const state = { customData: customData as unknown };
      const fakeView = {
        identity: { name: 'v' },
        getOptions: async () => ({ customData: state.customData }),
        on: () => {},
        removeListener: () => {},
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fin = { View: { getCurrentSync: () => fakeView } };
      return state;
    }

    beforeEach(() => {
      // The default jsdom document has no <title>; the pin observer
      // needs a real element to observe.
      if (!document.querySelector('title')) {
        document.head.appendChild(document.createElement('title'));
      }
      document.title = 'boot';
    });

    it('restores the workspace-persisted title on construct', async () => {
      installTitleView({ savedTitle: 'Trader View' });
      rt = await OpenFinRuntime.create();
      expect(document.title).toBe('Trader View');
    });

    it('re-pins the title when the page clobbers it during the boot window', async () => {
      installTitleView({ savedTitle: 'Trader View' });
      rt = await OpenFinRuntime.create();

      // Simulates a route view's mount useEffect setting document.title.
      document.title = 'Data Providers';
      await Promise.resolve();
      await Promise.resolve();

      expect(document.title).toBe('Trader View');
    });

    it('stops pinning once the boot window expires, so dynamic titles win', async () => {
      vi.useFakeTimers();
      installTitleView({ savedTitle: 'Trader View' });
      rt = await OpenFinRuntime.create();

      await vi.advanceTimersByTimeAsync(3000);
      document.title = 'Inbox (3)';
      await Promise.resolve();
      await Promise.resolve();

      expect(document.title).toBe('Inbox (3)');
    });

    it('ignores a missing / non-string / empty savedTitle', async () => {
      for (const savedTitle of [undefined, 42, '']) {
        installTitleView(savedTitle === undefined ? {} : { savedTitle });
        document.title = 'boot';
        const runtime = await OpenFinRuntime.create();
        expect(document.title).toBe('boot');
        runtime.dispose();
      }
    });

    it('follows a live rename pushed through customData', async () => {
      vi.useFakeTimers();
      const state = installTitleView({ savedTitle: 'Trader View' });
      rt = await OpenFinRuntime.create();
      rt.onCustomDataChanged(() => {});
      expect(document.title).toBe('Trader View');

      state.customData = { savedTitle: 'Renamed' };
      await vi.advanceTimersByTimeAsync(500);
      expect(document.title).toBe('Renamed');
    });

    it('does not re-apply the same savedTitle when an unrelated key changes', async () => {
      vi.useFakeTimers();
      const state = installTitleView({ savedTitle: 'Trader View' });
      rt = await OpenFinRuntime.create();
      rt.onCustomDataChanged(() => {});

      // Let the pin observer's window expire so the page owns the title.
      await vi.advanceTimersByTimeAsync(3000);
      document.title = 'Trader View (2 unread)';

      state.customData = { savedTitle: 'Trader View', activeProfileId: 'p9' };
      await vi.advanceTimersByTimeAsync(500);

      // savedTitle is unchanged, so the runtime leaves the page's
      // dynamic title alone.
      expect(document.title).toBe('Trader View (2 unread)');
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

    it('degrades silently when Platform.getCurrentSync() throws', async () => {
      const fakeView = {
        identity: { name: 'v' },
        getOptions: async () => ({}),
        on: () => {},
        removeListener: () => {},
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fin = {
        View: { getCurrentSync: () => fakeView },
        Platform: { getCurrentSync: () => { throw new Error('platform not up yet'); } },
      };
      rt = await OpenFinRuntime.create();
      expect(rt.name).toBe('openfin');
    });

    it('degrades silently when the platform handle has no event API', async () => {
      const fakeView = {
        identity: { name: 'v' },
        getOptions: async () => ({}),
        on: () => {},
        removeListener: () => {},
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fin = {
        View: { getCurrentSync: () => fakeView },
        Platform: { getCurrentSync: () => ({}) },
      };
      rt = await OpenFinRuntime.create();
      expect(rt.name).toBe('openfin');
    });

    it('degrades silently when platform.on() rejects the workspace-saved event', async () => {
      const fakeView = {
        identity: { name: 'v' },
        getOptions: async () => ({}),
        on: () => {},
        removeListener: () => {},
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fin = {
        View: { getCurrentSync: () => fakeView },
        Platform: {
          getCurrentSync: () => ({
            on: () => { throw new Error('unknown event'); },
            removeListener: () => {},
          }),
        },
      };
      rt = await OpenFinRuntime.create();
      expect(rt.name).toBe('openfin');
    });

    it('a throwing workspace-save listener does not stop the others', async () => {
      let fire: (() => void) | undefined;
      const fakeView = {
        identity: { name: 'v' },
        getOptions: async () => ({}),
        on: () => {},
        removeListener: () => {},
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fin = {
        View: { getCurrentSync: () => fakeView },
        Platform: {
          getCurrentSync: () => ({
            on: (event: string, fn: () => void) => { if (event === 'workspace-saved') fire = fn; },
            removeListener: () => {},
          }),
        },
      };
      rt = await OpenFinRuntime.create();
      let good = 0;
      rt.onWorkspaceSave(() => { throw new Error('bad listener'); });
      rt.onWorkspaceSave(() => { good++; });

      expect(() => fire?.()).not.toThrow();
      expect(good).toBe(1);
    });

    it('unsubscribing a shown/closing listener stops delivery', async () => {
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
      let shown = 0, closing = 0;
      const unsubShown = rt.onWindowShown(() => shown++);
      const unsubClosing = rt.onWindowClosing(() => closing++);
      unsubShown();
      unsubClosing();
      shownHandler?.();
      destroyedHandler?.();
      expect(shown).toBe(0);
      expect(closing).toBe(0);
    });

    it('a throwing shown listener does not stop the others', async () => {
      let shownHandler: (() => void) | undefined;
      const fakeView = {
        identity: { name: 'v' },
        getOptions: async () => ({}),
        on: (event: string, fn: () => void) => { if (event === 'shown') shownHandler = fn; },
        removeListener: () => {},
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fin = { View: { getCurrentSync: () => fakeView } };
      rt = await OpenFinRuntime.create();
      let good = 0;
      rt.onWindowShown(() => { throw new Error('bad'); });
      rt.onWindowShown(() => { good++; });
      expect(() => shownHandler?.()).not.toThrow();
      expect(good).toBe(1);
    });

    it('degrades silently when the view has no event API at all', async () => {
      const fakeView = { identity: { name: 'v' }, getOptions: async () => ({}) };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (globalThis as any).fin = { View: { getCurrentSync: () => fakeView } };
      rt = await OpenFinRuntime.create();
      expect(() => rt!.dispose()).not.toThrow();
      rt = null; // already disposed
    });

    it('dispose() is idempotent', async () => {
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
      rt.dispose();
      expect(removeCalls.sort()).toEqual(['destroyed', 'shown']);
      rt = null; // already disposed
    });
  });
});
