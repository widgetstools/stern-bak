 
import { describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { StorageAdapter } from '@wellsfargo-starui/core';
import type { MarketsGridHandle } from '@wellsfargo-starui/grid/core';
import { useGridLevelPersistence } from './useGridLevelPersistence.js';

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

function makeAdapter(initial: unknown, opts?: { loadReject?: boolean; saveReject?: boolean }) {
  let current = initial;
  return {
    loadGridLevelData: opts?.loadReject
      ? vi.fn(async () => { throw new Error('load failed'); })
      : vi.fn(async () => current),
    saveGridLevelData: opts?.saveReject
      ? vi.fn(async () => { throw new Error('save failed'); })
      : vi.fn(async (_id: string, data: unknown) => { current = data; }),
    __getSaved: () => current,
  } as unknown as StorageAdapter & { __getSaved: () => unknown };
}

describe('useGridLevelPersistence — edge paths', () => {
  it('falls back to defaults when load rejects', async () => {
    const adapter = makeAdapter(null, { loadReject: true });
    const { result } = renderHook(() =>
      useGridLevelPersistence({ adapter, gridId: 'g1', gridHandle: null }),
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.selection.liveProviderId).toBeNull();
  });

  it('applies host defaults for empty provider slots', async () => {
    const adapter = makeAdapter({ liveProviderId: null, historicalProviderId: null, mode: 'live' });
    const { result } = renderHook(() =>
      useGridLevelPersistence({
        adapter,
        gridId: 'g1',
        defaultLiveProviderId: 'live-default',
        gridHandle: null,
      }),
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.applyDefaults(result.current.selection).liveProviderId).toBe('live-default');
  });

  it('re-hydrates from gridLevelData:imported events', async () => {
    const events = makeEvents();
    const adapter = makeAdapter({ liveProviderId: 'old', historicalProviderId: null, mode: 'live' });
    const gridHandle = { platform: { events } } as unknown as MarketsGridHandle;
    const { result } = renderHook(() =>
      useGridLevelPersistence({ adapter, gridId: 'g1', gridHandle }),
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => {
      events.emit('gridLevelData:imported', {
        data: {
          v: 1,
          provider: { liveProviderId: 'imported', historicalProviderId: null, mode: 'live' },
          caption: 'Imported caption',
        },
      });
    });
    expect(result.current.selection.liveProviderId).toBe('imported');
    expect(result.current.persistedCaption).toBe('Imported caption');
  });

  it('swallows save failures without throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const adapter = makeAdapter(
      { liveProviderId: 'p1', historicalProviderId: null, mode: 'live' },
      { saveReject: true },
    );
    const { result } = renderHook(() =>
      useGridLevelPersistence({ adapter, gridId: 'g1', gridHandle: null }),
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => {
      result.current.setSelection((s) => ({ ...s, mode: 'historical' }));
    });
    await waitFor(() =>
      expect(warn).toHaveBeenCalledWith(
        '[markets-grid-container] gridLevelData save failed:',
        expect.any(Error),
      ),
    );
    warn.mockRestore();
  });

  it('marks loaded immediately when the adapter lacks grid-level persistence', async () => {
    const adapter = {
      loadGridLevelData: undefined,
      saveGridLevelData: vi.fn(),
    } as unknown as StorageAdapter;
    const { result } = renderHook(() =>
      useGridLevelPersistence({
        adapter,
        gridId: 'g1',
        defaultHistoricalProviderId: 'hist-default',
        gridHandle: null,
      }),
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.selection.historicalProviderId).toBe('hist-default');
  });

  it('persists caption and event binding changes', async () => {
    const adapter = makeAdapter({ liveProviderId: 'p1', historicalProviderId: null, mode: 'live' });
    const { result } = renderHook(() =>
      useGridLevelPersistence({ adapter, gridId: 'g1', gridHandle: null }),
    );
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => {
      result.current.setPersistedCaption('My caption');
      result.current.setEventBindings({ 'row:click': ['handler-1'] });
    });
    await waitFor(() =>
      expect(adapter.saveGridLevelData).toHaveBeenCalledWith(
        'g1',
        expect.objectContaining({
          caption: 'My caption',
          eventBindings: { 'row:click': ['handler-1'] },
        }),
      ),
    );
  });
});
