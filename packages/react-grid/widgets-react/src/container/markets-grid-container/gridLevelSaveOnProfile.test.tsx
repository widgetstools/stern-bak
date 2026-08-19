/**
 * `useGridLevelPersistence` co-persists grid-level data on every profile save.
 *
 * Regression guard for the registered/ConfigService bug where the provider
 * selection lived only in a separate `gridLevelData` write that could be
 * dropped — leaving the profile saved but `gridLevelData.provider.liveProviderId`
 * absent, so the grid booted empty. The hook now flushes the current grid-level
 * data whenever the grid's ProfileManager emits `profile:saved`.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import type { StorageAdapter } from '@wellsfargo-starui/core';
import type { MarketsGridHandle } from '@wellsfargo-starui/grid/core';
import { useGridLevelPersistence } from './useGridLevelPersistence.js';

/** Minimal sync pub-sub matching the platform EventBus surface the hook uses. */
function makeEvents() {
  const handlers = new Map<string, Set<(p: unknown) => void>>();
  return {
    emit(name: string, payload: unknown) {
      handlers.get(name)?.forEach((fn) => fn(payload));
    },
    on(name: string, fn: (p: unknown) => void) {
      let set = handlers.get(name);
      if (!set) handlers.set(name, (set = new Set()));
      set.add(fn);
      return () => set!.delete(fn);
    },
  };
}

function makeAdapter(initial: unknown) {
  let current = initial;
  return {
    loadGridLevelData: vi.fn(async () => current),
    saveGridLevelData: vi.fn(async (_id: string, data: unknown) => {
      current = data;
    }),
    __getSaved: () => current,
  } as unknown as StorageAdapter & { __getSaved: () => any };
}

describe('useGridLevelPersistence — co-save on profile:saved', () => {
  it('writes the current provider selection to gridLevelData when a profile is saved', async () => {
    const events = makeEvents();
    const adapter = makeAdapter({ liveProviderId: 'dp-1', historicalProviderId: null, mode: 'live' });
    const gridHandle = { platform: { events } } as unknown as MarketsGridHandle;

    const { result } = renderHook(() =>
      useGridLevelPersistence({ adapter, gridId: 'g1', gridHandle }),
    );

    // Wait for the initial load to hydrate the selection.
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.selection.liveProviderId).toBe('dp-1');

    (adapter.saveGridLevelData as any).mockClear();

    // ProfileManager fired profile:saved — the hook must co-persist gridLevelData.
    act(() => {
      events.emit('profile:saved', { gridId: 'g1', profileId: '__default__' });
    });

    await waitFor(() => expect(adapter.saveGridLevelData).toHaveBeenCalled());
    const saved = (adapter as any).__getSaved() as { provider?: { liveProviderId?: string } };
    expect(saved.provider?.liveProviderId).toBe('dp-1');
  });

  it('does not write before the initial load resolves', async () => {
    const events = makeEvents();
    const adapter = makeAdapter({ liveProviderId: 'dp-1', historicalProviderId: null, mode: 'live' });
    const gridHandle = { platform: { events } } as unknown as MarketsGridHandle;

    renderHook(() => useGridLevelPersistence({ adapter, gridId: 'g1', gridHandle }));

    // Fire before load resolves — flush must be a no-op (no partial write).
    act(() => {
      events.emit('profile:saved', { gridId: 'g1', profileId: '__default__' });
    });
    expect(adapter.saveGridLevelData).not.toHaveBeenCalled();
  });
});
