import { act, render, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { GridPlatform, type Module } from '@wellsfargo-starui/core';
import { GridProvider } from './GridProvider';
import { useDirty, useDirtyCount } from './useDirty';

const NOOP_MODULE: Module<{ v: number }> = {
  id: 'noop',
  name: 'Noop',
  schemaVersion: 1,
  priority: 0,
  getInitialState: () => ({ v: 0 }),
  serialize: (s) => s,
  deserialize: () => ({ v: 0 }),
};

function makePlatform(): GridPlatform {
  return new GridPlatform({ gridId: 'test-grid', modules: [NOOP_MODULE] });
}

function wrapWith(platform: GridPlatform) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <GridProvider platform={platform}>{children}</GridProvider>;
  };
}

describe('useDirty', () => {
  let platform: GridPlatform;

  beforeEach(() => {
    platform = makePlatform();
  });

  it('aggregate form returns false on empty bus', () => {
    const { result } = renderHook(() => useDirty(), { wrapper: wrapWith(platform) });
    expect(result.current).toBe(false);
  });

  it('aggregate form flips to true when any key is dirty', () => {
    const { result } = renderHook(() => useDirty(), { wrapper: wrapWith(platform) });
    expect(result.current).toBe(false);
    act(() => platform.resources.dirty().set('some-key', true));
    expect(result.current).toBe(true);
    act(() => platform.resources.dirty().set('some-key', false));
    expect(result.current).toBe(false);
  });

  it('per-key form returns { isDirty, set }', () => {
    const { result } = renderHook(() => useDirty('k1'), { wrapper: wrapWith(platform) });
    expect(result.current.isDirty).toBe(false);

    act(() => result.current.set(true));
    expect(result.current.isDirty).toBe(true);
    expect(platform.resources.dirty().isDirty('k1')).toBe(true);

    act(() => result.current.set(false));
    expect(result.current.isDirty).toBe(false);
  });

  it('per-key reads do NOT flip when a DIFFERENT key changes', () => {
    const { result } = renderHook(() => useDirty('watched'), { wrapper: wrapWith(platform) });
    const renderCountBefore = result.current;

    act(() => platform.resources.dirty().set('other', true));
    expect(result.current.isDirty).toBe(false);
    // Hook should have received the bus-notify (we subscribe to the whole
    // bus) but the snapshot value for `watched` is unchanged, so React's
    // useSyncExternalStore short-circuits the re-render.
    expect(result.current).toBe(renderCountBefore);
  });

  it('useDirtyCount returns the live count of dirty keys', () => {
    const { result } = renderHook(() => useDirtyCount(), { wrapper: wrapWith(platform) });
    expect(result.current).toBe(0);

    act(() => platform.resources.dirty().set('k1', true));
    expect(result.current).toBe(1);

    act(() => platform.resources.dirty().set('k2', true));
    expect(result.current).toBe(2);

    act(() => platform.resources.dirty().set('k1', false));
    expect(result.current).toBe(1);

    // No-op set (same value) does NOT bump; the DirtyBus coalesces.
    act(() => platform.resources.dirty().set('k2', true));
    expect(result.current).toBe(1);

    act(() => platform.resources.dirty().reset());
    expect(result.current).toBe(0);
  });

  it('dirty state does not bleed between two platforms (two grids on one page)', () => {
    const platformA = makePlatform();
    const platformB = makePlatform();

    const hookA = renderHook(() => useDirty(), { wrapper: wrapWith(platformA) });
    const hookB = renderHook(() => useDirty(), { wrapper: wrapWith(platformB) });

    act(() => platformA.resources.dirty().set('k', true));

    expect(hookA.result.current).toBe(true);
    expect(hookB.result.current).toBe(false);  // ← the v2 window-event bug
  });
});
