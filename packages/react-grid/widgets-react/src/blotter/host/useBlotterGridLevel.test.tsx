import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { MarketsGridHandle } from '@wellsfargo-starui/grid';

const { persistence, isOpenFinRuntime } = vi.hoisted(() => ({
  persistence: { value: null as never },
  isOpenFinRuntime: vi.fn(() => false),
}));

vi.mock('../../container/markets-grid-container/useGridLevelPersistence.js', () => ({
  useGridLevelPersistence: (args: unknown) => {
    persistence.lastArgs = args;
    return persistence.value;
  },
}));
vi.mock('../../container/markets-grid-container/openFinRuntime.js', () => ({ isOpenFinRuntime }));

import { useBlotterGridLevel, type BlotterGridLevelArgs } from './useBlotterGridLevel.js';

type Selection = { liveProviderId: string | null; historicalProviderId: string | null; mode: string };

function setupPersistence(overrides: Record<string, unknown> = {}) {
  const setSelection = vi.fn();
  const setPersistedCaption = vi.fn();
  const setEventBindings = vi.fn();
  persistence.value = {
    selection: { liveProviderId: 'live-1', historicalProviderId: null, mode: 'live' } as Selection,
    setSelection,
    persistedCaption: undefined,
    setPersistedCaption,
    eventBindings: {},
    setEventBindings,
    loaded: true,
    ...overrides,
  } as never;
  return { setSelection, setPersistedCaption, setEventBindings };
}

function args(over: Partial<BlotterGridLevelArgs> = {}): BlotterGridLevelArgs {
  return {
    storage: vi.fn((identity) => ({ identity })) as never,
    gridId: 'grid-1',
    instanceId: 'inst-1',
    gridHandle: null,
    gridHandleRef: { current: null },
    propCaption: undefined,
    ...over,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('useBlotterGridLevel — storage adapter', () => {
  beforeEach(() => setupPersistence());

  it('builds one adapter from the identity tuple and keeps it across re-renders', () => {
    const storage = vi.fn((identity) => ({ identity })) as never;
    const { result, rerender } = renderHook(
      (p: BlotterGridLevelArgs) => useBlotterGridLevel(p),
      { initialProps: args({ storage, appId: 'app', userId: 'u1' }) },
    );
    const first = result.current.adapter;
    expect(first).toMatchObject({
      identity: { instanceId: 'inst-1', gridId: 'grid-1', appId: 'app', userId: 'u1' },
    });

    rerender(args({ storage, appId: 'app', userId: 'u1' }));
    // A new adapter per render would re-open the store on every keystroke.
    expect(result.current.adapter).toBe(first);
    expect(storage).toHaveBeenCalledTimes(1);
  });

  it('has no adapter at all when the host supplies no storage factory', () => {
    const { result } = renderHook(() => useBlotterGridLevel(args({ storage: null })));
    expect(result.current.adapter).toBeNull();
  });
});

/**
 * A provider change is part of the grid `key`, so the grid REMOUNTS and
 * re-hydrates the customizer from disk. Anything unsaved in the working set is
 * gone at that point, which is why the flush has to happen before the state
 * update — and why a failing flush must not swallow the switch: the user asked
 * for a different provider and would otherwise see nothing happen.
 */
describe('useBlotterGridLevel — save before a provider switch', () => {
  let setSelection: ReturnType<typeof setupPersistence>['setSelection'];

  beforeEach(() => { ({ setSelection } = setupPersistence()); });

  const handleRef = (saveAll: () => Promise<void>) => ({
    current: { saveAll } as unknown as MarketsGridHandle,
  });

  it('flushes the working set before switching the live provider', async () => {
    const order: string[] = [];
    const saveAll = vi.fn(async () => { order.push('save'); });
    setSelection.mockImplementation(() => { order.push('select'); });
    const { result } = renderHook(() =>
      useBlotterGridLevel(args({ gridHandleRef: handleRef(saveAll) })));

    await act(async () => { result.current.setLiveId('live-2'); });

    expect(order).toEqual(['save', 'select']);
    const apply = setSelection.mock.calls[0][0] as (s: Selection) => Selection;
    expect(apply({ liveProviderId: 'a', historicalProviderId: null, mode: 'live' }))
      .toEqual({ liveProviderId: 'live-2', historicalProviderId: null, mode: 'live' });
  });

  it('switches the historical provider and the mode through the same flush', async () => {
    const saveAll = vi.fn(async () => {});
    const { result } = renderHook(() =>
      useBlotterGridLevel(args({ gridHandleRef: handleRef(saveAll) })));

    await act(async () => { result.current.setHistoricalId('hist-1'); });
    await act(async () => { result.current.setMode('historical'); });

    expect(saveAll).toHaveBeenCalledTimes(2);
    const applyHist = setSelection.mock.calls[0][0] as (s: Selection) => Selection;
    const applyMode = setSelection.mock.calls[1][0] as (s: Selection) => Selection;
    const base = { liveProviderId: 'a', historicalProviderId: null, mode: 'live' };
    expect(applyHist(base).historicalProviderId).toBe('hist-1');
    expect(applyMode(base).mode).toBe('historical');
  });

  it('still switches when the save fails, and says so', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const saveAll = vi.fn(async () => { throw new Error('disk full'); });
    const { result } = renderHook(() =>
      useBlotterGridLevel(args({ gridHandleRef: handleRef(saveAll) })));

    await act(async () => { result.current.setLiveId('live-2'); });

    expect(setSelection).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('save-before-provider-switch failed'),
      expect.any(Error),
    );
  });

  it('switches with no grid mounted yet', async () => {
    const { result } = renderHook(() => useBlotterGridLevel(args()));
    await act(async () => { result.current.setLiveId('live-2'); });
    expect(setSelection).toHaveBeenCalledTimes(1);
  });
});

/**
 * Under OpenFin the caption prop IS the live tab name, so a post-mount change
 * to it means someone renamed the tab externally ("Save Tab As…"). The initial
 * value is deliberately not adopted — doing so would overwrite a caption the
 * user set inside the blotter with whatever the tab happened to be called.
 */
describe('useBlotterGridLevel — caption', () => {
  it('prefers the persisted caption over the prop', () => {
    setupPersistence({ persistedCaption: 'My P&L' });
    const { result } = renderHook(() => useBlotterGridLevel(args({ propCaption: 'Tab 1' })));
    expect(result.current.effectiveCaption).toBe('My P&L');
  });

  it('falls back to the prop when nothing is persisted', () => {
    setupPersistence();
    const { result } = renderHook(() => useBlotterGridLevel(args({ propCaption: 'Tab 1' })));
    expect(result.current.effectiveCaption).toBe('Tab 1');
  });

  it('persists a rename and tells the host about it', () => {
    const { setPersistedCaption } = setupPersistence();
    const onCaptionChange = vi.fn();
    const { result } = renderHook(() => useBlotterGridLevel(args({ onCaptionChange })));

    act(() => { result.current.handleCaptionChange('Rates'); });

    expect(setPersistedCaption).toHaveBeenCalledWith('Rates');
    expect(onCaptionChange).toHaveBeenCalledWith('Rates');
  });

  it('adopts an external rename under OpenFin', () => {
    const { setPersistedCaption } = setupPersistence({ persistedCaption: 'Old' });
    isOpenFinRuntime.mockReturnValue(true);
    const { rerender } = renderHook(
      (p: BlotterGridLevelArgs) => useBlotterGridLevel(p),
      { initialProps: args({ propCaption: 'Old' }) },
    );
    expect(setPersistedCaption).not.toHaveBeenCalled();

    rerender(args({ propCaption: 'Renamed' }));
    expect(setPersistedCaption).toHaveBeenCalledWith('Renamed');
  });

  it('ignores an external rename outside OpenFin', () => {
    const { setPersistedCaption } = setupPersistence({ persistedCaption: 'Old' });
    isOpenFinRuntime.mockReturnValue(false);
    const { rerender } = renderHook(
      (p: BlotterGridLevelArgs) => useBlotterGridLevel(p),
      { initialProps: args({ propCaption: 'Old' }) },
    );
    rerender(args({ propCaption: 'Renamed' }));
    expect(setPersistedCaption).not.toHaveBeenCalled();
  });

  it('ignores a rename to nothing, or to the caption already persisted', () => {
    const { setPersistedCaption } = setupPersistence({ persistedCaption: 'Same' });
    isOpenFinRuntime.mockReturnValue(true);
    const { rerender } = renderHook(
      (p: BlotterGridLevelArgs) => useBlotterGridLevel(p),
      { initialProps: args({ propCaption: 'Old' }) },
    );
    rerender(args({ propCaption: undefined }));
    rerender(args({ propCaption: 'Same' }));
    expect(setPersistedCaption).not.toHaveBeenCalled();
  });
});

describe('useBlotterGridLevel — pass-through', () => {
  it('forwards the persistence layer\'s loaded flag, selection and event bindings', () => {
    const { setEventBindings } = setupPersistence({
      loaded: false,
      eventBindings: { 'row-click': ['broadcast'] },
    });
    const { result } = renderHook(() => useBlotterGridLevel(args()));
    expect(result.current.loaded).toBe(false);
    expect(result.current.selection.liveProviderId).toBe('live-1');
    expect(result.current.eventBindings).toEqual({ 'row-click': ['broadcast'] });
    expect(result.current.setEventBindings).toBe(setEventBindings);
  });
});
