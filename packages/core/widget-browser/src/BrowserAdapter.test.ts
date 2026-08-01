import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserAdapter } from './BrowserAdapter.js';

/**
 * BrowserAdapter is the PlatformAdapter used when a widget runs in a plain
 * browser tab rather than under OpenFin. Everything it does is observable —
 * window.open calls, BroadcastChannel traffic, handler registration — so these
 * assert behaviour rather than implementation.
 */

let adapters: BrowserAdapter[] = [];

/** Track adapters so each test's BroadcastChannel is closed afterwards. */
function makeAdapter(baseUrl = ''): BrowserAdapter {
  const adapter = new BrowserAdapter(baseUrl);
  adapters.push(adapter);
  return adapter;
}

let openSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  // jsdom's window.open is a stub that returns null, which BrowserAdapter
  // treats as "popup blocked" — return a truthy stand-in for the happy path.
  openSpy = vi.fn(() => ({ focus: vi.fn() }) as unknown as Window);
  vi.stubGlobal('open', openSpy);
});

afterEach(() => {
  for (const a of adapters) a.dispose();
  adapters = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('BrowserAdapter', () => {
  it('identifies itself as the non-OpenFin browser adapter', () => {
    const adapter = makeAdapter();
    expect(adapter.name).toBe('browser');
    expect(adapter.isOpenFin).toBe(false);
  });

  it('gives each adapter its own instance id', () => {
    expect(makeAdapter().getInstanceId()).not.toBe(makeAdapter().getInstanceId());
  });

  describe('openWidget', () => {
    it('opens a widget URL carrying the type and a generated id', async () => {
      const id = await makeAdapter('https://host').openWidget('blotter');

      expect(openSpy).toHaveBeenCalledTimes(1);
      const [url, target, features] = openSpy.mock.calls[0];
      const parsed = new URL(url as string);
      expect(parsed.origin + parsed.pathname).toBe('https://host/widget');
      expect(parsed.searchParams.get('type')).toBe('blotter');
      expect(parsed.searchParams.get('id')).toBe(id);
      expect(target).toBe(`star-widget-${id}`);
      expect(features).toContain('width=1200');
    });

    it('base64-encodes launch data into the URL', async () => {
      await makeAdapter().openWidget('grid', { symbol: 'US912810TZ', qty: 5 });

      const url = new URL(openSpy.mock.calls[0][0] as string, 'http://localhost');
      const decoded = JSON.parse(atob(url.searchParams.get('data')!));
      expect(decoded).toEqual({ symbol: 'US912810TZ', qty: 5 });
    });

    it('omits the data param when no launch data is supplied', async () => {
      await makeAdapter().openWidget('grid');
      const url = new URL(openSpy.mock.calls[0][0] as string, 'http://localhost');
      expect(url.searchParams.has('data')).toBe(false);
    });

    it('throws a popup-blocked error when the window cannot be opened', async () => {
      openSpy.mockReturnValue(null);
      await expect(makeAdapter().openWidget('grid')).rejects.toThrow(/popup blocked/i);
    });
  });

  describe('broadcast / subscribe', () => {
    it('delivers a broadcast to a subscriber on another adapter', async () => {
      const sender = makeAdapter();
      const receiver = makeAdapter();
      const seen = vi.fn();
      receiver.subscribe('prices', seen);

      sender.broadcast('prices', { last: 101.5 });
      await vi.waitFor(() => expect(seen).toHaveBeenCalledWith({ last: 101.5 }));
    });

    it('does not deliver a broadcast back to its own sender', async () => {
      const sender = makeAdapter();
      const own = vi.fn();
      sender.subscribe('prices', own);
      const otherSaw = vi.fn();
      makeAdapter().subscribe('prices', otherSaw);

      sender.broadcast('prices', { last: 1 });
      await vi.waitFor(() => expect(otherSaw).toHaveBeenCalled());
      expect(own).not.toHaveBeenCalled();
    });

    it('ignores broadcasts on a different topic', async () => {
      const sender = makeAdapter();
      const receiver = makeAdapter();
      const seen = vi.fn();
      receiver.subscribe('prices', seen);
      const other = vi.fn();
      receiver.subscribe('trades', other);

      sender.broadcast('trades', { id: 1 });
      await vi.waitFor(() => expect(other).toHaveBeenCalled());
      expect(seen).not.toHaveBeenCalled();
    });

    it('stops delivering after unsubscribe', async () => {
      const sender = makeAdapter();
      const receiver = makeAdapter();
      const seen = vi.fn();
      receiver.subscribe('prices', seen)();

      sender.broadcast('prices', { last: 1 });
      await new Promise((r) => setTimeout(r, 20));
      expect(seen).not.toHaveBeenCalled();
    });

    it('closeWidget broadcasts a close for the target instance', async () => {
      const sender = makeAdapter();
      const receiver = makeAdapter();
      const raw = vi.fn();
      // closeWidget uses the broadcast envelope, so subscribe sees the payload.
      receiver.subscribe('widget-close', raw);

      await sender.closeWidget('abc-123');
      await vi.waitFor(() => expect(raw).toHaveBeenCalledWith({ instanceId: 'abc-123' }));
    });
  });

  describe('platform lifecycle handlers', () => {
    it('runs every registered save handler on triggerSave', async () => {
      const adapter = makeAdapter();
      const order: string[] = [];
      adapter.onPlatformSave(async () => { order.push('first'); });
      adapter.onPlatformSave(async () => { order.push('second'); });

      await adapter.triggerSave();
      expect(order).toEqual(['first', 'second']);
    });

    it('does not run a save handler after it is removed', async () => {
      const adapter = makeAdapter();
      const kept = vi.fn(async () => {});
      adapter.onPlatformSave(async () => { throw new Error('should not run'); })();
      adapter.onPlatformSave(kept);

      await adapter.triggerSave();
      expect(kept).toHaveBeenCalledTimes(1);
    });

    it('runs destroy handlers when the page unloads', () => {
      const adapter = makeAdapter();
      const onDestroy = vi.fn();
      adapter.onPlatformDestroy(onDestroy);

      window.dispatchEvent(new Event('beforeunload'));
      expect(onDestroy).toHaveBeenCalledTimes(1);
    });

    it('stops running a destroy handler once removed', () => {
      const adapter = makeAdapter();
      const onDestroy = vi.fn();
      adapter.onPlatformDestroy(onDestroy)();

      window.dispatchEvent(new Event('beforeunload'));
      expect(onDestroy).not.toHaveBeenCalled();
    });

    it('detaches the unload listener on dispose', () => {
      const adapter = makeAdapter();
      const onDestroy = vi.fn();
      adapter.onPlatformDestroy(onDestroy);

      adapter.dispose();
      window.dispatchEvent(new Event('beforeunload'));
      expect(onDestroy).not.toHaveBeenCalled();
    });
  });

  describe('settings screens', () => {
    const parent = { configId: 'cfg-1', instanceId: 'inst-1', viewId: 'view-1' };

    it('opens the settings URL with the parent identity', async () => {
      await makeAdapter('https://host').openSettingsScreen('columns', parent);

      const [url, target] = openSpy.mock.calls[0];
      const parsed = new URL(url as string);
      expect(parsed.pathname).toBe('/settings');
      expect(parsed.searchParams.get('screen')).toBe('columns');
      expect(parsed.searchParams.get('parentConfigId')).toBe('cfg-1');
      expect(parsed.searchParams.get('parentInstanceId')).toBe('inst-1');
      expect(parsed.searchParams.get('parentViewId')).toBe('view-1');
      expect(target).toBe('star-settings-columns');
    });

    it('encodes settings launch data', async () => {
      await makeAdapter().openSettingsScreen('columns', parent, { preset: 'wide' });
      const url = new URL(openSpy.mock.calls[0][0] as string, 'http://localhost');
      expect(JSON.parse(atob(url.searchParams.get('data')!))).toEqual({ preset: 'wide' });
    });

    it('notifies result handlers when a settings-result targets this instance', async () => {
      const adapter = makeAdapter();
      const onResult = vi.fn();
      adapter.onSettingsResult(onResult);

      const channel = new BroadcastChannel('star-widgets');
      channel.postMessage({
        type: 'settings-result',
        targetId: adapter.getInstanceId(),
        result: { applied: true },
      });
      await vi.waitFor(() => expect(onResult).toHaveBeenCalledWith({ applied: true }));
      channel.close();
    });

    it('ignores a settings-result addressed to a different instance', async () => {
      const adapter = makeAdapter();
      const onResult = vi.fn();
      adapter.onSettingsResult(onResult);

      const channel = new BroadcastChannel('star-widgets');
      channel.postMessage({ type: 'settings-result', targetId: 'someone-else', result: {} });
      await new Promise((r) => setTimeout(r, 20));
      expect(onResult).not.toHaveBeenCalled();
      channel.close();
    });

    it('stops notifying a removed result handler', async () => {
      const adapter = makeAdapter();
      const onResult = vi.fn();
      adapter.onSettingsResult(onResult)();

      const channel = new BroadcastChannel('star-widgets');
      channel.postMessage({
        type: 'settings-result',
        targetId: adapter.getInstanceId(),
        result: {},
      });
      await new Promise((r) => setTimeout(r, 20));
      expect(onResult).not.toHaveBeenCalled();
      channel.close();
    });
  });

  describe('getLaunchData', () => {
    afterEach(() => {
      window.history.replaceState({}, '', '/');
    });

    it('decodes the data query param', () => {
      const payload = { symbol: 'T 4.5 02/15/36', rows: 20 };
      window.history.replaceState({}, '', `/?data=${btoa(JSON.stringify(payload))}`);
      expect(makeAdapter().getLaunchData()).toEqual(payload);
    });

    it('returns null when there is no data param', () => {
      expect(makeAdapter().getLaunchData()).toBeNull();
    });

    it('returns null rather than throwing on a corrupt data param', () => {
      window.history.replaceState({}, '', '/?data=not-valid-base64!!');
      expect(makeAdapter().getLaunchData()).toBeNull();
    });
  });
});
