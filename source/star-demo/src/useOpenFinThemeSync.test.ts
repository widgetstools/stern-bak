import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  mockApplyTheme,
  mockGetTheme,
  mockSubscribeThemeBroadcast,
  resetStaruiMocks,
} from './staruiVitestMocks';
import { useOpenFinThemeSync } from './useOpenFinThemeSync';

describe('useOpenFinThemeSync', () => {
  beforeEach(() => {
    resetStaruiMocks();
  });

  it('subscribes to theme broadcast and applies merged theme', () => {
    let listener: ((theme: string) => void) | undefined;
    mockSubscribeThemeBroadcast.mockImplementation((fn) => {
      listener = fn as (theme: string) => void;
      return () => {};
    });
    mockGetTheme.mockReturnValue({ theme: 'dark', cvd: true } as never);

    renderHook(() => useOpenFinThemeSync());

    expect(mockSubscribeThemeBroadcast).toHaveBeenCalledTimes(1);
    listener?.('light');
    expect(mockApplyTheme).toHaveBeenCalledWith({ theme: 'light', cvd: true });
  });

  it('unsubscribes on unmount', () => {
    const unsubscribe = vi.fn();
    mockSubscribeThemeBroadcast.mockReturnValue(unsubscribe);

    const { unmount } = renderHook(() => useOpenFinThemeSync());
    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});
