import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { MarketsGridHandle } from '../widget/types.js';
import { createMarketsGridContainerEventBus } from './containerEventBus.js';
import { useMarketsGridEventBridge } from './useMarketsGridEventBridge.js';

describe('useMarketsGridEventBridge', () => {
  it('invokes registry handler on profile:saved platform event', () => {
    const profileSavedListeners = new Set<(payload: unknown) => void>();
    const handle = {
      gridApi: {},
      platform: {
        events: {
          on: vi.fn((event: string, fn: (payload: unknown) => void) => {
            if (event === 'profile:saved') profileSavedListeners.add(fn);
            return () => profileSavedListeners.delete(fn);
          }),
        },
        api: { on: vi.fn(() => () => {}) },
      },
    } as unknown as MarketsGridHandle;

    const handler = vi.fn();
    const handlers = { 'log-profile-saved': handler };
    const appData = {
      get: () => undefined,
      listProviders: () => [],
      keysOf: () => [],
      subscribe: () => () => {},
      set: () => {},
    };
    const containerBus = createMarketsGridContainerEventBus();

    const { unmount } = renderHook(() =>
      useMarketsGridEventBridge({
        handle,
        gridId: 'g1',
        appData,
        eventBindings: { 'profile:saved': ['log-profile-saved'] },
        handlers,
        containerBus,
      }),
    );

    act(() => {
      for (const fn of profileSavedListeners) {
        fn({ gridId: 'g1', profileId: 'p1' });
      }
    });

    expect(handler).toHaveBeenCalledWith(
      { gridId: 'g1', profileId: 'p1' },
      expect.objectContaining({ gridId: 'g1', handle }),
    );

    unmount();
  });

  it('invokes registry handler on container bus events', () => {
    const handle = {
      gridApi: {},
      platform: {
        events: { on: vi.fn(() => () => {}) },
        api: { on: vi.fn(() => () => {}) },
      },
    } as unknown as MarketsGridHandle;

    const handler = vi.fn();
    const handlers = { 'on-date-change': handler };
    const appData = {
      get: () => undefined,
      listProviders: () => [],
      keysOf: () => [],
      subscribe: () => () => {},
      set: () => {},
    };
    const containerBus = createMarketsGridContainerEventBus();

    renderHook(() =>
      useMarketsGridEventBridge({
        handle,
        gridId: 'g1',
        appData,
        eventBindings: { 'toolbar:dateChanged': ['on-date-change'] },
        handlers,
        containerBus,
      }),
    );

    act(() => {
      containerBus.emit('toolbar:dateChanged', { date: '2026-05-27', historical: true });
    });

    expect(handler).toHaveBeenCalledWith(
      { date: '2026-05-27', historical: true },
      expect.objectContaining({ gridId: 'g1' }),
    );
  });
});
