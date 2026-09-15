import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import {
  splitAppDataRef,
  todayIsoDate,
  useBlotterToolbarDate,
  type BlotterToolbarDateArgs,
} from './useBlotterToolbarDate.js';
import type { ProviderSelection } from '../../container/markets-grid-container/gridLevelState.js';

afterEach(cleanup);

const YESTERDAY = '2020-01-02';

function harness(over: Partial<BlotterToolbarDateArgs> = {}) {
  const setSelection = vi.fn();
  const setMode = vi.fn();
  const onError = vi.fn();
  const emit = vi.fn();
  const store = { get: vi.fn(() => undefined), set: vi.fn() };
  const selection: ProviderSelection = {
    liveProviderId: 'live', historicalProviderId: null, mode: 'live',
  } as ProviderSelection;
  const args = {
    loaded: true,
    selection,
    setSelection,
    setMode,
    appDataStore: store,
    containerEventBus: { emit } as never,
    onError,
    ...over,
  } as BlotterToolbarDateArgs;
  return { args, setSelection, setMode, onError, emit, store };
}

describe('todayIsoDate', () => {
  it('zero-pads month and day so the string sorts and parses', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2020, 0, 5, 12));
    expect(todayIsoDate()).toBe('2020-01-05');
    vi.setSystemTime(new Date(2020, 10, 30, 12));
    expect(todayIsoDate()).toBe('2020-11-30');
    vi.useRealTimers();
  });
});

/**
 * The ref names an AppData store and a key inside it — `positions.asOfDate`.
 * A malformed ref has to answer null rather than guess, because a wrong split
 * writes the as-of date into a store nothing reads and the historical view
 * silently stops persisting.
 */
describe('splitAppDataRef', () => {
  it('splits on the FIRST dot, leaving the rest as the key', () => {
    expect(splitAppDataRef('positions.asOfDate')).toEqual(['positions', 'asOfDate']);
    expect(splitAppDataRef('a.b.c')).toEqual(['a', 'b.c']);
  });

  it('refuses a ref with no store name or no dot', () => {
    expect(splitAppDataRef(undefined)).toBeNull();
    expect(splitAppDataRef('')).toBeNull();
    expect(splitAppDataRef('noDot')).toBeNull();
    expect(splitAppDataRef('.leadingDot')).toBeNull();
  });
});

describe('useBlotterToolbarDate — restoring a historical date on mount', () => {
  const historical = { liveProviderId: 'l', historicalProviderId: 'h', mode: 'historical' } as ProviderSelection;

  it('reads the persisted as-of date back out of AppData', () => {
    const { args, store } = harness({
      selection: historical,
      historicalDateAppDataRef: 'positions.asOfDate',
    });
    store.get.mockReturnValue(YESTERDAY);

    const { result } = renderHook(() => useBlotterToolbarDate(args));

    expect(store.get).toHaveBeenCalledWith('positions', 'asOfDate');
    expect(result.current.asOfDate).toBe(YESTERDAY);
    expect(result.current.toolbarDate).toBe(YESTERDAY);
  });

  it('ignores a stored value that is not a usable historical date', () => {
    const { args, store } = harness({
      selection: historical,
      historicalDateAppDataRef: 'positions.asOfDate',
    });
    // Today is not "historical", and a non-string is not a date at all.
    store.get.mockReturnValue(todayIsoDate());
    const today = renderHook(() => useBlotterToolbarDate(args));
    expect(today.result.current.asOfDate).toBeNull();

    store.get.mockReturnValue(42);
    const nonString = renderHook(() => useBlotterToolbarDate(args));
    expect(nonString.result.current.asOfDate).toBeNull();
  });

  it('does not read AppData before the grid level has loaded, in live mode, or with no ref', () => {
    for (const over of [
      { loaded: false, selection: historical, historicalDateAppDataRef: 'p.d' },
      { selection: historical },
      {},
    ]) {
      const { args, store } = harness(over);
      renderHook(() => useBlotterToolbarDate(args));
      expect(store.get).not.toHaveBeenCalled();
    }
  });
});

/**
 * Changing the toolbar date is the entry point to historical mode, and the
 * order matters: the reload intent is queued for the data feed to consume
 * AFTER the mode switch lands, because the provider swap remounts the grid.
 */
describe('useBlotterToolbarDate — changing the toolbar date', () => {
  it('enters historical mode, persists the date, and queues the reload', () => {
    const { args, setSelection, emit, store } = harness({
      selection: { liveProviderId: 'l', historicalProviderId: 'h', mode: 'live' } as ProviderSelection,
      historicalDateAppDataRef: 'positions.asOfDate',
    });
    const { result } = renderHook(() => useBlotterToolbarDate(args));

    act(() => { result.current.handleToolbarDateChange(YESTERDAY); });

    expect(result.current.asOfDate).toBe(YESTERDAY);
    expect(store.set).toHaveBeenCalledWith('positions', 'asOfDate', YESTERDAY);
    expect(result.current.pendingReloadRef.current).toEqual({ mode: 'historical', asOfDate: YESTERDAY });
    expect(emit).toHaveBeenCalledWith('toolbar:dateChanged', { date: YESTERDAY, historical: true });
    const apply = setSelection.mock.calls[0][0] as (s: ProviderSelection) => ProviderSelection;
    expect(apply({ historicalProviderId: null } as ProviderSelection))
      .toMatchObject({ mode: 'historical', historicalProviderId: null });
  });

  it('falls back to the default historical provider when none is selected', () => {
    const { args, setSelection } = harness({ defaultHistoricalProviderId: 'hist-default' });
    const { result } = renderHook(() => useBlotterToolbarDate(args));
    expect(result.current.effectiveHistoricalProviderId).toBe('hist-default');

    act(() => { result.current.handleToolbarDateChange(YESTERDAY); });

    const apply = setSelection.mock.calls[0][0] as (s: ProviderSelection) => ProviderSelection;
    expect(apply({ historicalProviderId: null } as ProviderSelection).historicalProviderId)
      .toBe('hist-default');
  });

  it('refuses with an error when nothing can serve history', () => {
    const { args, setSelection, onError, emit } = harness();
    const { result } = renderHook(() => useBlotterToolbarDate(args));
    expect(result.current.toolbarDateHistoryEnabled).toBe(false);

    act(() => { result.current.handleToolbarDateChange(YESTERDAY); });

    expect(onError).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('no historical provider'),
    }));
    // The picker still shows what the user typed, but nothing was switched.
    expect(result.current.toolbarDate).toBe(YESTERDAY);
    expect(setSelection).not.toHaveBeenCalled();
    expect(result.current.pendingReloadRef.current).toBeNull();
    expect(emit).not.toHaveBeenCalled();
  });

  it('returns to live mode and queues a live reload when the date goes back to today', () => {
    const { args, setMode, emit } = harness({
      selection: { liveProviderId: 'l', historicalProviderId: 'h', mode: 'historical' } as ProviderSelection,
    });
    const { result } = renderHook(() => useBlotterToolbarDate(args));
    const today = todayIsoDate();

    act(() => { result.current.handleToolbarDateChange(today); });

    expect(setMode).toHaveBeenCalledWith('live');
    expect(result.current.asOfDate).toBeNull();
    expect(result.current.pendingReloadRef.current).toEqual({ mode: 'live', asOfDate: null });
    expect(emit).toHaveBeenCalledWith('toolbar:dateChanged', { date: today, historical: false });
  });

  it('queues nothing when a live blotter picks today again', () => {
    const { args, setMode, emit } = harness();
    const { result } = renderHook(() => useBlotterToolbarDate(args));
    const today = todayIsoDate();

    act(() => { result.current.handleToolbarDateChange(today); });

    expect(setMode).not.toHaveBeenCalled();
    expect(result.current.pendingReloadRef.current).toBeNull();
    expect(emit).toHaveBeenCalledWith('toolbar:dateChanged', { date: today, historical: false });
  });
});

describe('useBlotterToolbarDate — as-of date persistence', () => {
  it('writes through to AppData and moves the toolbar with it', () => {
    const { args, store } = harness({ historicalDateAppDataRef: 'positions.asOfDate' });
    const { result } = renderHook(() => useBlotterToolbarDate(args));

    act(() => { result.current.setAsOfDateAndPersist(YESTERDAY); });

    expect(result.current.asOfDate).toBe(YESTERDAY);
    expect(result.current.toolbarDate).toBe(YESTERDAY);
    expect(store.set).toHaveBeenCalledWith('positions', 'asOfDate', YESTERDAY);
  });

  it('clears the as-of date without touching the toolbar or AppData', () => {
    const { args, store } = harness({ historicalDateAppDataRef: 'positions.asOfDate' });
    const { result } = renderHook(() => useBlotterToolbarDate(args));
    act(() => { result.current.setAsOfDateAndPersist(YESTERDAY); });
    store.set.mockClear();

    act(() => { result.current.setAsOfDateAndPersist(null); });

    expect(result.current.asOfDate).toBeNull();
    expect(result.current.toolbarDate).toBe(YESTERDAY);
    expect(store.set).not.toHaveBeenCalled();
  });

  it('skips the write when no AppData ref is configured', () => {
    const { args, store } = harness();
    const { result } = renderHook(() => useBlotterToolbarDate(args));
    act(() => { result.current.setAsOfDateAndPersist(YESTERDAY); });
    expect(store.set).not.toHaveBeenCalled();
  });
});

/**
 * The banner is what tells a trader the rows in front of them are not live and
 * that edits are off. It must appear only when BOTH the mode and the date say
 * historical — a stale `asOfDate` left over in live mode would claim the live
 * book is history.
 */
describe('useBlotterToolbarDate — historical banner', () => {
  it('shows the as-of date and the editing notice in historical mode', () => {
    const { args } = harness({
      selection: { liveProviderId: 'l', historicalProviderId: 'h', mode: 'historical' } as ProviderSelection,
    });
    const { result } = renderHook(() => useBlotterToolbarDate(args));

    act(() => { result.current.setAsOfDate(YESTERDAY); });

    expect(result.current.isHistoricalView).toBe(true);
    expect(result.current.historicalViewMessage)
      .toBe(`Viewing historical data as of ${YESTERDAY}. Editing is disabled.`);
  });

  it('stays hidden in live mode, and with no as-of date', () => {
    const { args } = harness();
    const live = renderHook(() => useBlotterToolbarDate(args));
    act(() => { live.result.current.setAsOfDate(YESTERDAY); });
    expect(live.result.current.isHistoricalView).toBe(false);
    expect(live.result.current.historicalViewMessage).toBeUndefined();

    const { args: histArgs } = harness({
      selection: { liveProviderId: 'l', historicalProviderId: 'h', mode: 'historical' } as ProviderSelection,
    });
    const hist = renderHook(() => useBlotterToolbarDate(histArgs));
    expect(hist.result.current.isHistoricalView).toBe(false);
  });
});
