import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { THEME_BROADCAST_CHANNEL, THEME_STORAGE_KEY } from '@wellsfargo-starui/types';
import { BrowserRuntime } from './BrowserRuntime.js';

/**
 * BrowserRuntime is the RuntimePort used outside OpenFin. Theme resolution has
 * a defined precedence (data-theme attribute > localStorage > prefers-color-scheme)
 * and is synchronised across tabs via BroadcastChannel — getting that wrong
 * makes windows disagree about light/dark, which is user-visible.
 */

let runtimes: BrowserRuntime[] = [];
function make(opts?: ConstructorParameters<typeof BrowserRuntime>[0]): BrowserRuntime {
  const rt = new BrowserRuntime(opts);
  runtimes.push(rt);
  return rt;
}

/** jsdom has no matchMedia; install one that reports the requested preference. */
function stubMatchMedia(prefersDark: boolean) {
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: prefersDark,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
}

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-ag-theme-mode');
  localStorage.clear();
  stubMatchMedia(false);
});

afterEach(() => {
  for (const rt of runtimes) rt.dispose();
  runtimes = [];
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('identity', () => {
  it('names itself browser', () => {
    expect(make().name).toBe('browser');
  });

  it('applies identity overrides', () => {
    const id = make({ identity: { appId: 'Star-Demo', componentType: 'MarketsGrid' } })
      .resolveIdentity();
    expect(id.appId).toBe('Star-Demo');
    expect(id.componentType).toBe('MarketsGrid');
  });

  it('reads identity from the supplied url query string', () => {
    const id = make({ url: 'https://host/app?appId=FromUrl&componentType=Grid' }).resolveIdentity();
    expect(id.appId).toBe('FromUrl');
    expect(id.componentType).toBe('Grid');
  });

  it('lets a url param win over an override', () => {
    const id = make({ url: 'https://host/a?appId=FromUrl', identity: { appId: 'FromOpts' } })
      .resolveIdentity();
    expect(id.appId).toBe('FromUrl');
  });

  /**
   * `userId` scopes profile persistence through `buildGridHostContext`, so a
   * host that passes a real signed-in user must get their own scope rather
   * than the shared `dev1` every user used to land in.
   */
  it('reads userId from the url, and lets it beat an override', () => {
    const id = make({
      url: 'https://host/app?userId=fromUrl',
      identity: { userId: 'fromOverrides' },
    }).resolveIdentity();
    expect(id.userId).toBe('fromUrl');
  });

  it('reads userId from an override when the url carries none', () => {
    const id = make({ identity: { userId: 'k151344' } }).resolveIdentity();
    expect(id.userId).toBe('k151344');
  });

  // The fallback is what makes this change carry no migration: every caller in
  // this repo and its apps supplies no userId, so they all still resolve here.
  it('falls back to the logged-in default when nobody supplies one', () => {
    expect(make().resolveIdentity().userId).toBe('dev1');
  });

  it('caches identity so repeated calls are stable', () => {
    const rt = make();
    expect(rt.resolveIdentity()).toBe(rt.resolveIdentity());
  });

  it('handles a url with no query string', () => {
    expect(() => make({ url: 'https://host/app' }).resolveIdentity()).not.toThrow();
  });
});

describe('theme detection precedence', () => {
  it('prefers the data-theme attribute', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    expect(make().getTheme()).toBe('dark');
  });

  it('falls back to localStorage when no attribute is set', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(make().getTheme()).toBe('dark');
  });

  it('falls back to prefers-color-scheme when neither is set', () => {
    stubMatchMedia(true);
    expect(make().getTheme()).toBe('dark');
  });

  it('defaults to light when the media query reports no preference', () => {
    stubMatchMedia(false);
    expect(make().getTheme()).toBe('light');
  });

  it('ignores an unrecognised attribute value', () => {
    document.documentElement.setAttribute('data-theme', 'chartreuse');
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(make().getTheme()).toBe('dark');
  });

  it('ignores an unrecognised stored value', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    stubMatchMedia(false);
    expect(make().getTheme()).toBe('light');
  });
});

describe('setTheme', () => {
  it('writes the attribute, the AG Grid mode and localStorage', () => {
    make().setTheme('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    // AG Grid v33+ reads its own attribute — both must move together.
    expect(document.documentElement.getAttribute('data-ag-theme-mode')).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('notifies theme listeners', () => {
    const rt = make();
    const seen = vi.fn();
    rt.onThemeChanged(seen);
    rt.setTheme('dark');
    expect(seen).toHaveBeenCalledWith('dark');
  });

  it('is a no-op when the theme is unchanged', () => {
    const rt = make();
    const seen = vi.fn();
    rt.onThemeChanged(seen);
    rt.setTheme(rt.getTheme());
    expect(seen).not.toHaveBeenCalled();
  });

  it('stops notifying after unsubscribe', () => {
    const rt = make();
    const seen = vi.fn();
    rt.onThemeChanged(seen)();
    rt.setTheme('dark');
    expect(seen).not.toHaveBeenCalled();
  });

  it('keeps notifying other listeners when one throws', () => {
    const rt = make();
    const good = vi.fn();
    rt.onThemeChanged(() => { throw new Error('listener blew up'); });
    rt.onThemeChanged(good);
    expect(() => rt.setTheme('dark')).not.toThrow();
    expect(good).toHaveBeenCalledWith('dark');
  });

  it('does nothing once disposed', () => {
    const rt = make();
    const seen = vi.fn();
    rt.onThemeChanged(seen);
    rt.dispose();
    rt.setTheme('dark');
    expect(seen).not.toHaveBeenCalled();
  });

  it('adopts a theme broadcast from another window', async () => {
    const rt = make();
    const seen = vi.fn();
    rt.onThemeChanged(seen);

    const channel = new BroadcastChannel(THEME_BROADCAST_CHANNEL);
    channel.postMessage('dark');
    await vi.waitFor(() => expect(seen).toHaveBeenCalledWith('dark'));
    expect(rt.getTheme()).toBe('dark');
    channel.close();
  });

  it('ignores a malformed broadcast value', async () => {
    const rt = make();
    const seen = vi.fn();
    rt.onThemeChanged(seen);

    const channel = new BroadcastChannel(THEME_BROADCAST_CHANNEL);
    channel.postMessage('banana');
    await new Promise((r) => setTimeout(r, 20));
    expect(seen).not.toHaveBeenCalled();
    channel.close();
  });
});

describe('window lifecycle listeners', () => {
  it('fires onWindowShown immediately when the document is already visible', async () => {
    const shown = vi.fn();
    make().onWindowShown(shown);
    await vi.waitFor(() => expect(shown).toHaveBeenCalledTimes(1));
  });

  it('does not fire an onWindowShown handler removed before the microtask runs', async () => {
    const shown = vi.fn();
    make().onWindowShown(shown)();
    await new Promise((r) => setTimeout(r, 20));
    expect(shown).not.toHaveBeenCalled();
  });

  it('fires onWindowShown on a visibilitychange back to visible', async () => {
    const rt = make();
    const shown = vi.fn();
    rt.onWindowShown(shown);
    await vi.waitFor(() => expect(shown).toHaveBeenCalledTimes(1));

    document.dispatchEvent(new Event('visibilitychange'));
    expect(shown).toHaveBeenCalledTimes(2);
  });

  it('fires onWindowClosing on beforeunload', () => {
    const closing = vi.fn();
    make().onWindowClosing(closing);
    window.dispatchEvent(new Event('beforeunload'));
    expect(closing).toHaveBeenCalledTimes(1);
  });

  it('stops firing onWindowClosing after unsubscribe', () => {
    const closing = vi.fn();
    make().onWindowClosing(closing)();
    window.dispatchEvent(new Event('beforeunload'));
    expect(closing).not.toHaveBeenCalled();
  });

  it('returns inert unsubscribers for the unsupported hooks', () => {
    const rt = make();
    expect(() => rt.onCustomDataChanged(vi.fn())()).not.toThrow();
    expect(() => rt.onWorkspaceSave(vi.fn())()).not.toThrow();
  });
});

describe('dispose', () => {
  it('detaches window listeners', () => {
    const rt = make();
    const closing = vi.fn();
    rt.onWindowClosing(closing);
    rt.dispose();
    window.dispatchEvent(new Event('beforeunload'));
    expect(closing).not.toHaveBeenCalled();
  });

  it('is idempotent', () => {
    const rt = make();
    rt.dispose();
    expect(() => rt.dispose()).not.toThrow();
  });
});

describe('openSurface', () => {
  it('delegates in-page surfaces to the supplied handler', async () => {
    const handle = { kind: 'inpage', id: 'x' };
    const openInPage = vi.fn(() => handle as never);
    const rt = make({ openInPage });

    await expect(rt.openSurface({ kind: 'inpage', url: '/x' } as never)).resolves.toBe(handle);
    expect(openInPage).toHaveBeenCalled();
  });

  it('throws when an in-page surface is requested with no handler', async () => {
    await expect(make().openSurface({ kind: 'inpage', url: '/x' } as never))
      .rejects.toThrow(/openInPage/);
  });

  it('opens a window and returns a handle', async () => {
    const win = { closed: false, focus: vi.fn(), close: vi.fn() };
    vi.stubGlobal('open', vi.fn(() => win));

    const handle = await make().openSurface({
      kind: 'window', url: 'https://host/v', width: 800, height: 600, windowName: 'w1',
    } as never);

    expect(handle.id).toBe('w1');
    const [, name, features] = (window.open as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(name).toBe('w1');
    expect(features).toBe('width=800,height=600');
  });

  it('encodes customData into the url', async () => {
    const win = { closed: false, focus: vi.fn(), close: vi.fn() };
    vi.stubGlobal('open', vi.fn(() => win));

    await make().openSurface({
      kind: 'window', url: 'https://host/v?a=1', customData: { k: 'v' },
    } as never);

    const url = (window.open as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('&data=');
    expect(JSON.parse(atob(decodeURIComponent(url.split('data=')[1])))).toEqual({ k: 'v' });
  });

  it('leaves the url untouched when customData is empty', async () => {
    const win = { closed: false, focus: vi.fn(), close: vi.fn() };
    vi.stubGlobal('open', vi.fn(() => win));

    await make().openSurface({ kind: 'window', url: 'https://host/v', customData: {} } as never);
    expect((window.open as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe('https://host/v');
  });

  it('throws when the popup is blocked', async () => {
    vi.stubGlobal('open', vi.fn(() => null));
    await expect(make().openSurface({ kind: 'window', url: '/v' } as never))
      .rejects.toThrow(/popup blocked/i);
  });

  it('surface handle close() closes the window and fires onClosed once', async () => {
    const win = { closed: false, focus: vi.fn(), close: vi.fn() };
    vi.stubGlobal('open', vi.fn(() => win));

    const handle = await make().openSurface({ kind: 'window', url: '/v' } as never);
    const onClosed = vi.fn();
    handle.onClosed(onClosed);

    handle.close();
    expect(win.close).toHaveBeenCalled();
    expect(onClosed).toHaveBeenCalledTimes(1);

    handle.close();
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it('surface handle focus() focuses the window', async () => {
    const win = { closed: false, focus: vi.fn(), close: vi.fn() };
    vi.stubGlobal('open', vi.fn(() => win));

    const handle = await make().openSurface({ kind: 'window', url: '/v' } as never);
    handle.focus();
    expect(win.focus).toHaveBeenCalled();
  });

  it('an onClosed listener removed before close is not called', async () => {
    const win = { closed: false, focus: vi.fn(), close: vi.fn() };
    vi.stubGlobal('open', vi.fn(() => win));

    const handle = await make().openSurface({ kind: 'window', url: '/v' } as never);
    const onClosed = vi.fn();
    handle.onClosed(onClosed)();
    handle.close();
    expect(onClosed).not.toHaveBeenCalled();
  });

  it('detects a window closed by the user via polling', async () => {
    vi.useFakeTimers();
    const win = { closed: false, focus: vi.fn(), close: vi.fn() };
    vi.stubGlobal('open', vi.fn(() => win));

    const handle = await make().openSurface({ kind: 'window', url: '/v' } as never);
    const onClosed = vi.fn();
    handle.onClosed(onClosed);

    win.closed = true;
    vi.advanceTimersByTime(300);
    expect(onClosed).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
