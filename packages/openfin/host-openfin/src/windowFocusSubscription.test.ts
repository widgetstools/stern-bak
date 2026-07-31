import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  subscribeParentWindowFocused,
  focusCurrentOpenFinHost,
  __resetWindowFocusSubscriptionForTests,
} from './windowFocusSubscription.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

function installFakeFin() {
  const fakeWin = { on: vi.fn(), removeListener: vi.fn() };
  (globalThis as any).fin = {
    me: {
      getCurrentWindow: () => Promise.resolve(fakeWin),
      focus: vi.fn(),
    },
  };
  return fakeWin;
}

async function flushListenerInit(fakeWin: { on: ReturnType<typeof vi.fn> }) {
  await vi.waitFor(() => expect(fakeWin.on).toHaveBeenCalledWith('focused', expect.any(Function)));
}

afterEach(() => {
  __resetWindowFocusSubscriptionForTests();
  delete (globalThis as any).fin;
  vi.restoreAllMocks();
});

describe('subscribeParentWindowFocused', () => {
  it('is a noop outside OpenFin', () => {
    const cb = vi.fn();
    const dispose = subscribeParentWindowFocused(cb);
    expect(typeof dispose).toBe('function');
    dispose(); // must not throw
    expect(cb).not.toHaveBeenCalled();
  });

  it('attaches one window listener and fans out the focused event', async () => {
    const fakeWin = installFakeFin();
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    subscribeParentWindowFocused(cb1);
    subscribeParentWindowFocused(cb2);
    await flushListenerInit(fakeWin);

    expect(fakeWin.on).toHaveBeenCalledTimes(1);
    const handler = fakeWin.on.mock.calls[0][1] as () => void;
    handler();

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it('removes the window listener when the last subscriber unsubscribes', async () => {
    const fakeWin = installFakeFin();
    const dispose1 = subscribeParentWindowFocused(vi.fn());
    const dispose2 = subscribeParentWindowFocused(vi.fn());
    await flushListenerInit(fakeWin);

    dispose1();
    expect(fakeWin.removeListener).not.toHaveBeenCalled();

    dispose2();
    expect(fakeWin.removeListener).toHaveBeenCalledWith('focused', expect.any(Function));
  });

  it('a callback that throws does not break the other subscribers', async () => {
    const fakeWin = installFakeFin();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();

    subscribeParentWindowFocused(bad);
    subscribeParentWindowFocused(good);
    await flushListenerInit(fakeWin);

    (fakeWin.on.mock.calls[0][1] as () => void)();

    expect(good).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
  });
});

describe('focusCurrentOpenFinHost', () => {
  it('calls fin.me.focus when available', () => {
    installFakeFin();
    focusCurrentOpenFinHost();
    expect((globalThis as any).fin.me.focus).toHaveBeenCalledTimes(1);
  });

  it('is a noop outside OpenFin', () => {
    expect(() => focusCurrentOpenFinHost()).not.toThrow();
  });
});
