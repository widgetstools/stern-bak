import { afterEach, describe, expect, it, vi } from 'vitest';
import { openFinWindowOpener } from './openFin';

/**
 * Unit tests for the `openFinWindowOpener` factory — specifically
 * its handling of the name-collision retry path. The real symptom
 * we're guarding against: `fin.Window.create` rejects with
 * "Trying to create a Window with name-uuid combination already in
 * use" when the name is already registered (typically from React
 * StrictMode's double-invoke of the open effect).
 *
 * The opener's contract:
 *   1. Look up any existing window under (uuid, name) via
 *      `Window.wrap(...).getInfo()`; if registered, close it.
 *   2. Create the new window.
 *   3. On "already in use" error, back off briefly and retry once.
 *   4. If still failing, return null so the caller can fall back.
 */

type FinMock = {
  Window: {
    wrap: ReturnType<typeof vi.fn>;
    wrapSync?: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  me: { identity: { uuid: string } };
};

function setupFin(custom: Partial<FinMock> = {}): FinMock {
  const fin: FinMock = {
    Window: {
      // `wrap` is ASYNC in @openfin/core v2+ — the factory always
      // resolves to a wrapper, whose `getInfo` rejection indicates
      // "no such window". Tests that want to simulate an existing
      // window override getInfo to resolve instead.
      wrap: vi.fn(async () => ({
        getInfo: vi.fn().mockRejectedValue(new Error('not found')),
        close: vi.fn().mockResolvedValue(undefined),
      })),
      create: vi.fn().mockResolvedValue({
        getWebWindow: () => ({ /* fake Window */ } as unknown as Window),
      }),
    },
    me: { identity: { uuid: 'test-app' } },
    ...custom,
  };
  (window as unknown as { fin: FinMock }).fin = fin;
  return fin;
}

describe('openFinWindowOpener', () => {
  afterEach(() => {
    delete (window as unknown as { fin?: FinMock }).fin;
  });

  it('returns undefined when not running inside OpenFin', () => {
    expect(openFinWindowOpener()).toBeUndefined();
  });

  it('closes any pre-existing window under the same (uuid,name) before creating', async () => {
    // Simulate an existing window: getInfo resolves (→ registered),
    // close is recorded.
    const existingClose = vi.fn().mockResolvedValue(undefined);
    const fin = setupFin({
      Window: {
        wrap: vi.fn(async () => ({
          getInfo: vi.fn().mockResolvedValue({ /* info */ }),
          close: existingClose,
        })),
        create: vi.fn().mockResolvedValue({
          getWebWindow: () => ({} as Window),
        }),
      },
    });

    const opener = openFinWindowOpener();
    await opener!({ name: 'p', width: 100, height: 100 });

    expect(fin.Window.wrap).toHaveBeenCalledWith({ uuid: 'test-app', name: 'p' });
    expect(existingClose).toHaveBeenCalledWith(true);
    expect(fin.Window.create).toHaveBeenCalled();
  });

  it('prefers wrapSync when available (synchronous runtime path)', async () => {
    const syncWrap = vi.fn(() => ({
      getInfo: vi.fn().mockRejectedValue(new Error('not found')),
      close: vi.fn(),
    }));
    const fin = setupFin({
      Window: {
        wrap: vi.fn(async () => { throw new Error('should not be called when wrapSync is present'); }),
        wrapSync: syncWrap,
        create: vi.fn().mockResolvedValue({ getWebWindow: () => ({} as Window) }),
      },
    });

    const opener = openFinWindowOpener();
    await opener!({ name: 'p', width: 100, height: 100 });

    expect(syncWrap).toHaveBeenCalled();
    expect(fin.Window.create).toHaveBeenCalled();
  });

  it('retries once after a name-collision error, then succeeds', async () => {
    let callCount = 0;
    const fin = setupFin({
      Window: {
        wrap: vi.fn(async () => ({
          getInfo: vi.fn().mockRejectedValue(new Error('not found')),
          close: vi.fn(),
        })),
        create: vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            throw new Error('Trying to create a Window with name-uuid combination already in use');
          }
          return { getWebWindow: () => ({} as Window) };
        }),
      },
    });
    // Silence the info log about backoff — not relevant to this assertion.
    vi.spyOn(console, 'info').mockImplementation(() => {});

    const opener = openFinWindowOpener();
    const result = await opener!({ name: 'p', width: 100, height: 100 });

    expect(result).not.toBeNull();
    expect(fin.Window.create).toHaveBeenCalledTimes(2);
  });

  it('returns null after 3 failed create attempts (gives up, caller falls back)', async () => {
    const fin = setupFin({
      Window: {
        wrap: vi.fn(async () => ({
          getInfo: vi.fn().mockRejectedValue(new Error('not found')),
          close: vi.fn(),
        })),
        create: vi.fn().mockRejectedValue(
          new Error('Trying to create a Window with name-uuid combination already in use'),
        ),
      },
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});

    const opener = openFinWindowOpener();
    const result = await opener!({ name: 'p', width: 100, height: 100 });

    expect(result).toBeNull();
    expect(fin.Window.create).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Window.create failed after 3 attempt(s)'),
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });

  it('does NOT retry on non-collision errors (fails fast)', async () => {
    const fin = setupFin({
      Window: {
        wrap: vi.fn(async () => ({
          getInfo: vi.fn().mockRejectedValue(new Error('not found')),
          close: vi.fn(),
        })),
        create: vi.fn().mockRejectedValue(new Error('something totally different')),
      },
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const opener = openFinWindowOpener();
    const result = await opener!({ name: 'p', width: 100, height: 100 });

    expect(result).toBeNull();
    expect(fin.Window.create).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });

  it('passes alwaysOnTop through to Window.create', async () => {
    const fin = setupFin();
    const opener = openFinWindowOpener({ alwaysOnTop: true });
    await opener!({ name: 'p', width: 900, height: 120, alwaysOnTop: true });

    expect(fin.Window.create).toHaveBeenCalledWith(
      expect.objectContaining({ alwaysOnTop: true }),
    );
  });

  it('passes frame through to Window.create (default true, explicit false for frameless)', async () => {
    const fin = setupFin();
    const opener = openFinWindowOpener();

    // Default — no frame passed → defaults to true.
    await opener!({ name: 'p', width: 100, height: 100 });
    expect(fin.Window.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ frame: true }),
    );

    // Explicit false for frameless (custom titlebar case).
    await opener!({ name: 'q', width: 100, height: 100, frame: false });
    expect(fin.Window.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ frame: false }),
    );
  });

  it('does NOT set processAffinity — would move popout into a different process from main', async () => {
    // Regression: an earlier version set `processAffinity: "ds-popout:<uuid>"`
    // thinking it'd "share" the renderer with main, but it actually
    // did the opposite — main has no affinity, so setting one on the
    // popout moved it to a different process group and broke
    // same-origin cross-window DOM access (which is what makes the
    // React-portal pattern work). Per OpenFin docs, windows in the
    // same app share a process by default; leave affinity unset.
    const fin = setupFin();
    const opener = openFinWindowOpener();
    await opener!({ name: 'p', width: 900, height: 120 });

    expect(fin.Window.create).toHaveBeenCalledWith(
      expect.not.objectContaining({ processAffinity: expect.anything() }),
    );
  });
});
