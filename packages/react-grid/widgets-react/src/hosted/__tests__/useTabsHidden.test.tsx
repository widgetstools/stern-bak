/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, act, waitFor } from '@testing-library/react';
import { deriveTabsHidden, useTabsHidden } from '../useTabsHidden.js';
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
  try { window.sessionStorage.removeItem('marketsui.tabsHidden'); } catch { /* ignore */ }
  vi.restoreAllMocks();
});

describe('deriveTabsHidden', () => {
  it('returns false when opts is null/undefined/non-object', () => {
    expect(deriveTabsHidden(null)).toBe(false);
    expect(deriveTabsHidden(undefined)).toBe(false);
    expect(deriveTabsHidden(42 as any)).toBe(false);
  });

  it('returns false when workspacePlatform is missing', () => {
    expect(deriveTabsHidden({})).toBe(false);
  });

  it('reads toolbarOptions.visible (negated)', () => {
    expect(
      deriveTabsHidden({ workspacePlatform: { toolbarOptions: { visible: true } } }),
    ).toBe(false);
    expect(
      deriveTabsHidden({ workspacePlatform: { toolbarOptions: { visible: false } } }),
    ).toBe(true);
  });

  it('falls back to viewTabsVisible (negated)', () => {
    expect(
      deriveTabsHidden({ workspacePlatform: { viewTabsVisible: true } }),
    ).toBe(false);
    expect(
      deriveTabsHidden({ workspacePlatform: { viewTabsVisible: false } }),
    ).toBe(true);
  });

  it('prefers toolbarOptions.visible when both shapes present', () => {
    expect(
      deriveTabsHidden({
        workspacePlatform: {
          toolbarOptions: { visible: true },
          viewTabsVisible: false,
        },
      }),
    ).toBe(false);
  });

  it('returns false when neither shape is a boolean', () => {
    expect(
      deriveTabsHidden({ workspacePlatform: { toolbarOptions: {} } }),
    ).toBe(false);
  });

  it('reads layout.settings.hasHeaders from the active page (GoldenLayout shape)', () => {
    const opts = {
      workspacePlatform: {
        pages: [
          { pageId: 'p1', isActive: false, layout: { settings: { hasHeaders: true } } },
          { pageId: 'p2', isActive: true, layout: { settings: { hasHeaders: false } } },
        ],
      },
    };
    expect(deriveTabsHidden(opts)).toBe(true);
  });

  it('reads layout.settings.hasHeaders from the first page when no isActive flag', () => {
    const opts = {
      workspacePlatform: {
        pages: [{ pageId: 'p1', layout: { settings: { hasHeaders: false } } }],
      },
    };
    expect(deriveTabsHidden(opts)).toBe(true);
  });

  it('falls back to layout.dimensions.headerHeight === 0 when hasHeaders is missing', () => {
    const opts = {
      workspacePlatform: {
        pages: [{ pageId: 'p1', isActive: true, layout: { dimensions: { headerHeight: 0 } } }],
      },
    };
    expect(deriveTabsHidden(opts)).toBe(true);
  });

  it('returns false when layout.settings.hasHeaders is true', () => {
    const opts = {
      workspacePlatform: {
        pages: [{ pageId: 'p1', isActive: true, layout: { settings: { hasHeaders: true } } }],
      },
    };
    expect(deriveTabsHidden(opts)).toBe(false);
  });
});

describe('useTabsHidden — OpenFin runtime', () => {
  let win: FakeWindow;

  beforeEach(() => {
    win = installFin({
      workspacePlatform: { toolbarOptions: { visible: true } },
    });
  });

  it('reads initial state from getOptions()', async () => {
    const { result } = renderHook(() => useTabsHidden());
    expect(result.current).toBe(false);
    await waitFor(() => expect(win.getOptions).toHaveBeenCalled());
    // Initial options have tabs visible → tabsHidden stays false.
    expect(result.current).toBe(false);
  });

  it('initial state reflects hidden tabs when toolbar invisible', async () => {
    delete (globalThis as any).fin;
    win = installFin({
      workspacePlatform: { toolbarOptions: { visible: false } },
    });
    const { result } = renderHook(() => useTabsHidden());
    await waitFor(() => expect(result.current).toBe(true));
  });

  it('flips state when options-changed fires with new shape', async () => {
    const { result } = renderHook(() => useTabsHidden());
    await waitFor(() => expect(win._handler).toBeTruthy());
    expect(result.current).toBe(false);

    // User clicks "Hide Tabs" — runtime mutates options + fires event.
    win.getOptions.mockResolvedValueOnce({
      workspacePlatform: { toolbarOptions: { visible: false } },
    });
    await act(async () => {
      await win._handler!({});
    });
    expect(result.current).toBe(true);

    // Toggle back on.
    win.getOptions.mockResolvedValueOnce({
      workspacePlatform: { toolbarOptions: { visible: true } },
    });
    await act(async () => {
      await win._handler!({});
    });
    expect(result.current).toBe(false);
  });

  it('uses options carried on the event payload directly without re-reading getOptions()', async () => {
    const { result } = renderHook(() => useTabsHidden());
    await waitFor(() => expect(win._handler).toBeTruthy());
    expect(result.current).toBe(false);

    // Reset the call counter so we can prove the fast path skips IPC.
    win.getOptions.mockClear();

    // Event payload carries the new options under `event.options`.
    await act(async () => {
      await win._handler!({
        options: {
          workspacePlatform: { toolbarOptions: { visible: false } },
        },
      });
    });
    expect(result.current).toBe(true);
    expect(win.getOptions).not.toHaveBeenCalled();
  });

  it('removes the options-changed listener on unmount', async () => {
    const { unmount } = renderHook(() => useTabsHidden());
    await waitFor(() => expect(win._handler).toBeTruthy());
    unmount();
    expect(win.removeListener).toHaveBeenCalledTimes(1);
    const [event] = win.removeListener.mock.calls[0]!;
    expect(event).toBe('options-changed');
  });
});

describe('useTabsHidden — non-OpenFin runtime', () => {
  it('returns false and attaches no listeners', () => {
    const { result } = renderHook(() => useTabsHidden());
    expect(result.current).toBe(false);
  });
});
