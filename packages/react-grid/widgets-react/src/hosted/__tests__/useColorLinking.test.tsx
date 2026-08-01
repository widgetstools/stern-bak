/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, act, waitFor } from '@testing-library/react';
import { deriveColorLinking, useColorLinking } from '../useColorLinking.js';
import { __resetWindowOptionsSubscriptionForTests } from '../windowOptionsSubscription.js';

interface FakeWindow {
  getOptions: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  _handler: ((evt: unknown) => void) | null;
}

function installFin(initialOpts: unknown): FakeWindow {
  const win: FakeWindow = {
    _handler: null,
    getOptions: vi.fn().mockResolvedValue(initialOpts),
    on: vi.fn((event: string, cb: (e: unknown) => void) => {
      if (event === 'options-changed') win._handler = cb;
    }),
    removeListener: vi.fn((event: string) => {
      if (event === 'options-changed') win._handler = null;
    }),
  };
  (globalThis as any).fin = {
    me: { getCurrentWindow: vi.fn().mockResolvedValue(win) },
  };
  return win;
}

afterEach(() => {
  cleanup();
  __resetWindowOptionsSubscriptionForTests();
  delete (globalThis as any).fin;
  vi.restoreAllMocks();
});

describe('deriveColorLinking', () => {
  it('returns unlinked default when opts is missing or non-object', () => {
    expect(deriveColorLinking(null)).toEqual({ color: null, linked: false });
    expect(deriveColorLinking(undefined)).toEqual({ color: null, linked: false });
    expect(deriveColorLinking(7 as any)).toEqual({ color: null, linked: false });
    expect(deriveColorLinking({})).toEqual({ color: null, linked: false });
  });

  it('reads workspacePlatform.colorLinking { color, enabled }', () => {
    expect(
      deriveColorLinking({
        workspacePlatform: { colorLinking: { color: '#FF0000', enabled: true } },
      }),
    ).toEqual({ color: '#FF0000', linked: true });

    expect(
      deriveColorLinking({
        workspacePlatform: { colorLinking: { color: '#00FF00', enabled: false } },
      }),
    ).toEqual({ color: '#00FF00', linked: false });
  });

  it('infers linked when colorLinking.enabled is missing but color is present', () => {
    expect(
      deriveColorLinking({
        workspacePlatform: { colorLinking: { color: '#0000FF' } },
      }),
    ).toEqual({ color: '#0000FF', linked: true });
  });

  it('falls back to workspacePlatform.windowOptions { color, linked }', () => {
    expect(
      deriveColorLinking({
        workspacePlatform: { windowOptions: { color: '#ABCDEF', linked: true } },
      }),
    ).toEqual({ color: '#ABCDEF', linked: true });
  });

  it('prefers colorLinking shape over windowOptions when both present', () => {
    expect(
      deriveColorLinking({
        workspacePlatform: {
          colorLinking: { color: '#111111', enabled: true },
          windowOptions: { color: '#222222', linked: false },
        },
      }),
    ).toEqual({ color: '#111111', linked: true });
  });
});

describe('useColorLinking — OpenFin runtime', () => {
  let win: FakeWindow;

  beforeEach(() => {
    win = installFin({
      workspacePlatform: { colorLinking: { color: '#FF6E1B', enabled: true } },
    });
  });

  it('reads initial state from getOptions()', async () => {
    const { result } = renderHook(() => useColorLinking());
    await waitFor(() => expect(result.current.linked).toBe(true));
    expect(result.current).toEqual({ color: '#FF6E1B', linked: true });
  });

  it('flips state when options-changed fires with new shape', async () => {
    const { result } = renderHook(() => useColorLinking());
    await waitFor(() => expect(win._handler).toBeTruthy());
    await waitFor(() => expect(result.current.linked).toBe(true));

    win.getOptions.mockResolvedValueOnce({
      workspacePlatform: { colorLinking: { color: null, enabled: false } },
    });
    await act(async () => {
      await win._handler!({});
    });
    expect(result.current).toEqual({ color: null, linked: false });
  });

  it('removes the options-changed listener on unmount', async () => {
    const { unmount } = renderHook(() => useColorLinking());
    await waitFor(() => expect(win._handler).toBeTruthy());
    unmount();
    expect(win.removeListener).toHaveBeenCalledTimes(1);
    expect(win.removeListener.mock.calls[0]![0]).toBe('options-changed');
  });
});

describe('useColorLinking — non-OpenFin runtime', () => {
  it('returns unlinked default and attaches no listeners', () => {
    const { result } = renderHook(() => useColorLinking());
    expect(result.current).toEqual({ color: null, linked: false });
  });
});
