/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useActiveThemeMode } from './useActiveThemeMode.js';

describe('useActiveThemeMode', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme');
  });

  it('reads the active theme from documentElement', () => {
    document.documentElement.dataset.theme = 'light';
    const { result } = renderHook(() => useActiveThemeMode());
    expect(result.current).toBe('light');
  });

  it('updates when data-theme attribute changes', async () => {
    document.documentElement.dataset.theme = 'dark';
    const { result } = renderHook(() => useActiveThemeMode());
    expect(result.current).toBe('dark');

    act(() => {
      document.documentElement.dataset.theme = 'light';
    });
    await waitFor(() => {
      expect(result.current).toBe('light');
    });
  });

  it('updates when data-theme attribute changes via setAttribute', async () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    const { result } = renderHook(() => useActiveThemeMode());
    expect(result.current).toBe('dark');

    act(() => {
      document.documentElement.setAttribute('data-theme', 'light');
    });
    await waitFor(() => {
      expect(result.current).toBe('light');
    });
  });

  it('defaults when data-theme is absent', () => {
    document.documentElement.removeAttribute('data-theme');
    const { result } = renderHook(() => useActiveThemeMode());
    expect(result.current).toBe('dark');
  });

  it('handles MutationObserver callback explicitly', async () => {
    let callback: MutationCallback | undefined;
    vi.stubGlobal(
      'MutationObserver',
      class MockMutationObserver {
        constructor(cb: MutationCallback) {
          callback = cb;
        }
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );

    document.documentElement.dataset.theme = 'dark';
    const { result } = renderHook(() => useActiveThemeMode());
    act(() => {
      document.documentElement.dataset.theme = 'light';
      callback?.([], {} as MutationObserver);
    });
    await waitFor(() => {
      expect(result.current).toBe('light');
    });
    vi.unstubAllGlobals();
  });

  it('disconnects MutationObserver on unmount', () => {
    const disconnect = vi.fn();
    const observe = vi.fn();
    vi.stubGlobal(
      'MutationObserver',
      class MockMutationObserver {
        observe = observe;
        disconnect = disconnect;
      },
    );

    const { unmount } = renderHook(() => useActiveThemeMode());
    expect(observe).toHaveBeenCalled();
    unmount();
    expect(disconnect).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
