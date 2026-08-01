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

  it('no-ops when handle or handlers are missing', () => {
    const containerBus = createMarketsGridContainerEventBus();
    const appData = {
      get: () => undefined,
      listProviders: () => [],
      keysOf: () => [],
      subscribe: () => () => {},
      set: () => {},
    };
    expect(() =>
      renderHook(() =>
        useMarketsGridEventBridge({
          handle: null,
          gridId: 'g1',
          appData,
          eventBindings: { 'profile:saved': ['x'] },
          handlers: { x: vi.fn() },
          containerBus,
        }),
      ),
    ).not.toThrow();
  });

  it('skips invalid bindings and warns when a handler throws', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const apiListeners = new Map<string, Set<(event?: unknown) => void>>();
    const handle = {
      gridApi: {},
      platform: {
        events: { on: vi.fn(() => () => {}) },
        api: {
          on: vi.fn((evt: string, fn: (event?: unknown) => void) => {
            if (!apiListeners.has(evt)) apiListeners.set(evt, new Set());
            apiListeners.get(evt)!.add(fn);
            return () => apiListeners.get(evt)?.delete(fn);
          }),
        },
      },
    } as unknown as MarketsGridHandle;

    const ok = vi.fn();
    const bad = vi.fn(() => {
      throw new Error('handler failed');
    });
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
        eventBindings: {
          'not-a-real-event': ['ok'],
          'grid:cellClicked': ['missing', 'bad', 'ok'],
        },
        handlers: { ok, bad },
        containerBus,
      }),
    );

    act(() => {
      for (const fn of apiListeners.get('cellClicked') ?? []) fn({});
    });

    expect(ok).toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('handler "bad" failed'),
      expect.any(Error),
    );
    warn.mockRestore();
  });

  it('routes provider container events to handlers', () => {
    const handler = vi.fn();
    const handle = {
      gridApi: {},
      platform: {
        events: { on: vi.fn(() => () => {}) },
        api: { on: vi.fn(() => () => {}) },
      },
    } as unknown as MarketsGridHandle;
    const containerBus = createMarketsGridContainerEventBus();
    const appData = {
      get: () => undefined,
      listProviders: () => [],
      keysOf: () => [],
      subscribe: () => () => {},
      set: () => {},
    };

    renderHook(() =>
      useMarketsGridEventBridge({
        handle,
        gridId: 'g1',
        appData,
        eventBindings: { 'provider:status': ['status'] },
        handlers: { status: handler },
        containerBus,
      }),
    );

    act(() => {
      containerBus.emit('provider:status', { providerId: 'p1', status: 'ready' });
    });
    expect(handler).toHaveBeenCalled();
  });
});
