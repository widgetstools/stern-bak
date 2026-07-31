import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { debugOpenFin, isOpenFin, openFinWindowOpener } from './popoutWindow.js';

/**
 * The popout opener has to survive OpenFin's window registry rejecting
 * `Window.create` with "name-uuid combination already in use" — which happens
 * routinely under React StrictMode's double-invoke and on rapid re-opens. The
 * retry/backoff loop and the pre-emptive close are the behaviour worth pinning;
 * getting them wrong means a popout that silently never opens.
 */

type Wrapped = {
  getInfo: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

let webWindow: object;
let created: ReturnType<typeof vi.fn>;
let wrapped: Wrapped;

function installFin(over: Record<string, unknown> = {}) {
  webWindow = { document: {} };
  wrapped = { getInfo: vi.fn(async () => ({})), close: vi.fn(async () => {}) };
  created = vi.fn(async () => ({ getWebWindow: () => webWindow }));
  const fin = {
    Window: {
      create: created,
      wrapSync: vi.fn(() => wrapped),
      wrap: vi.fn(async () => wrapped),
    },
    me: { identity: { uuid: 'star-demo' } },
    ...over,
  };
  (window as unknown as { fin?: unknown }).fin = fin;
  return fin;
}

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  delete (window as unknown as { fin?: unknown }).fin;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('isOpenFin', () => {
  it('is false with no fin global', () => {
    expect(isOpenFin()).toBe(false);
  });

  it('is true when fin.Window.create exists', () => {
    installFin();
    expect(isOpenFin()).toBe(true);
  });

  it('is false when fin exists but Window.create does not', () => {
    (window as unknown as { fin?: unknown }).fin = { Window: {} };
    expect(isOpenFin()).toBe(false);
  });
});

describe('debugOpenFin', () => {
  it('reports absence of fin', () => {
    const info = debugOpenFin();
    expect(info.hasFin).toBe(false);
    expect(info.hasWindow).toBe(false);
  });

  it('reports the fin namespace shape and identity when present', () => {
    installFin();
    const info = debugOpenFin();
    expect(info.hasFin).toBe(true);
    expect(info.hasWindowCreate).toBe('function');
    expect(info.meIdentityUuid).toBe('star-demo');
    expect(info.locationHref).toBeDefined();
  });

  it('is installed on window for console debugging', () => {
    expect(typeof (window as unknown as { __debugOpenFin?: unknown }).__debugOpenFin)
      .toBe('function');
  });
});

describe('openFinWindowOpener', () => {
  it('returns undefined outside OpenFin so the caller falls back to window.open', () => {
    expect(openFinWindowOpener()).toBeUndefined();
  });

  it('returns an opener inside OpenFin', () => {
    installFin();
    expect(typeof openFinWindowOpener()).toBe('function');
  });

  it('creates a window and returns its web window', async () => {
    installFin();
    const open = openFinWindowOpener()!;
    await expect(open({ name: 'pop', width: 400, height: 300 })).resolves.toBe(webWindow);
  });

  it('passes the requested geometry and defaults frame to true', async () => {
    installFin();
    await openFinWindowOpener()!({ name: 'pop', width: 400, height: 300 });

    expect(created.mock.calls[0][0]).toMatchObject({
      name: 'pop',
      url: 'about:blank',
      defaultWidth: 400,
      defaultHeight: 300,
      autoShow: true,
      frame: true,
      resizable: true,
    });
  });

  it('honours frame: false for a frameless popout', async () => {
    installFin();
    await openFinWindowOpener()!({ name: 'pop', width: 1, height: 1, frame: false });
    expect(created.mock.calls[0][0].frame).toBe(false);
  });

  it('never sets processAffinity — it would break same-origin DOM access', async () => {
    installFin();
    await openFinWindowOpener()!({ name: 'pop', width: 1, height: 1 });
    expect(created.mock.calls[0][0]).not.toHaveProperty('processAffinity');
  });

  it('lets the call-site alwaysOnTop win over the constructor option', async () => {
    installFin();
    await openFinWindowOpener({ alwaysOnTop: false })!(
      { name: 'pop', width: 1, height: 1, alwaysOnTop: true },
    );
    expect(created.mock.calls[0][0].alwaysOnTop).toBe(true);
  });

  it('falls back to the constructor alwaysOnTop when the call omits it', async () => {
    installFin();
    await openFinWindowOpener({ alwaysOnTop: true })!({ name: 'pop', width: 1, height: 1 });
    expect(created.mock.calls[0][0].alwaysOnTop).toBe(true);
  });

  describe('pre-existing window cleanup', () => {
    it('closes a window already registered under the same name', async () => {
      installFin();
      await openFinWindowOpener()!({ name: 'pop', width: 1, height: 1 });
      expect(wrapped.close).toHaveBeenCalledWith(true);
    });

    it('skips the close when the name is not registered', async () => {
      installFin();
      wrapped.getInfo.mockRejectedValue(new Error('not found'));
      await openFinWindowOpener()!({ name: 'pop', width: 1, height: 1 });
      expect(wrapped.close).not.toHaveBeenCalled();
      expect(created).toHaveBeenCalled();
    });

    it('falls back to the async wrap when wrapSync is unavailable', async () => {
      const fin = installFin();
      (fin.Window as Record<string, unknown>).wrapSync = undefined;
      await openFinWindowOpener()!({ name: 'pop', width: 1, height: 1 });
      expect(fin.Window.wrap).toHaveBeenCalled();
    });

    it('bails out of the probe when the wrapper has no getInfo', async () => {
      const fin = installFin();
      (fin.Window as Record<string, unknown>).wrapSync = vi.fn(() => ({}));
      await openFinWindowOpener()!({ name: 'pop', width: 1, height: 1 });
      // Must still attempt creation rather than giving up.
      expect(created).toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalled();
    });

    it('tolerates a close that rejects because the window already went away', async () => {
      installFin();
      wrapped.close.mockRejectedValue(new Error('already gone'));
      await expect(openFinWindowOpener()!({ name: 'pop', width: 1, height: 1 }))
        .resolves.toBe(webWindow);
    });
  });

  describe('name-collision retry', () => {
    it('retries on "already in use" and succeeds on a later attempt', async () => {
      installFin();
      created
        .mockRejectedValueOnce(new Error('name-uuid combination already in use'))
        .mockResolvedValueOnce({ getWebWindow: () => webWindow });

      await expect(openFinWindowOpener()!({ name: 'pop', width: 1, height: 1 }))
        .resolves.toBe(webWindow);
      expect(created).toHaveBeenCalledTimes(2);
    });

    it('gives up after three attempts and returns null for the caller to fall back', async () => {
      installFin();
      created.mockRejectedValue(new Error('name-uuid combination already in use'));

      await expect(openFinWindowOpener()!({ name: 'pop', width: 1, height: 1 }))
        .resolves.toBeNull();
      expect(created).toHaveBeenCalledTimes(3);
    });

    it('does not retry a non-collision failure', async () => {
      installFin();
      created.mockRejectedValue(new Error('some other runtime failure'));

      await expect(openFinWindowOpener()!({ name: 'pop', width: 1, height: 1 }))
        .resolves.toBeNull();
      expect(created).toHaveBeenCalledTimes(1);
      expect(console.warn).toHaveBeenCalled();
    });

    it('handles a non-Error rejection', async () => {
      installFin();
      created.mockRejectedValue('plain string failure');
      await expect(openFinWindowOpener()!({ name: 'pop', width: 1, height: 1 }))
        .resolves.toBeNull();
    });
  });

  it('falls back to a default uuid when identity is missing', async () => {
    const fin = installFin();
    (fin as Record<string, unknown>).me = undefined;
    await openFinWindowOpener()!({ name: 'pop', width: 1, height: 1 });
    expect(created).toHaveBeenCalled();
  });
});
