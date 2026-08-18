/**
 * The adapter both containers hand to MarketsGrid as `appData`. Its contract
 * is narrow — five methods over the store — and the part worth pinning is that
 * the identity stays stable across renders, because it is a `useMemo`
 * dependency inside the grid and a new object every render would re-run the
 * cell-editor value resolution on every tick.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAppDataLookup } from './useAppDataLookup.js';

const store = {
  get: vi.fn(),
  list: vi.fn(),
  subscribe: vi.fn(),
  set: vi.fn(),
};
let current = { store };

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  useAppDataStore: () => current,
}));

beforeEach(() => {
  vi.clearAllMocks();
  current = { store };
  store.list.mockReturnValue([
    { name: 'positions', values: { asOfDate: '2026-05-08', desk: 'rates' } },
    { name: 'refdata', values: {} },
  ]);
});

const lookup = () => renderHook(() => useAppDataLookup()).result.current;

describe('useAppDataLookup', () => {
  it('reads a value by provider and key', () => {
    store.get.mockReturnValue('2026-05-08');

    expect(lookup().get('positions', 'asOfDate')).toBe('2026-05-08');
    expect(store.get).toHaveBeenCalledWith('positions', 'asOfDate');
  });

  it('lists the provider names', () => {
    expect(lookup().listProviders()).toEqual(['positions', 'refdata']);
  });

  it('lists the keys a provider carries', () => {
    expect(lookup().keysOf('positions')).toEqual(['asOfDate', 'desk']);
  });

  it('answers an empty key list for a provider with no values', () => {
    expect(lookup().keysOf('refdata')).toEqual([]);
  });

  it('answers an empty key list for a provider that does not exist', () => {
    expect(lookup().keysOf('nope')).toEqual([]);
  });

  it('forwards a subscription and its unsubscribe', () => {
    const off = () => undefined;
    store.subscribe.mockReturnValue(off);
    const fn = () => undefined;

    expect(lookup().subscribe(fn)).toBe(off);
    expect(store.subscribe).toHaveBeenCalledWith(fn);
  });

  it('writes without making the caller await', () => {
    // The store's `set` is async; the lookup's is not, because the grid calls
    // it from a synchronous editor commit.
    store.set.mockResolvedValue(undefined);

    expect(lookup().set('positions', 'asOfDate', '2026-06-01')).toBeUndefined();
    expect(store.set).toHaveBeenCalledWith('positions', 'asOfDate', '2026-06-01');
  });

  it('keeps the same lookup across re-renders', () => {
    const { result, rerender } = renderHook(() => useAppDataLookup());
    const first = result.current;
    rerender();

    expect(result.current).toBe(first);
  });

  it('builds a new lookup when the underlying store is swapped', () => {
    const { result, rerender } = renderHook(() => useAppDataLookup());
    const first = result.current;

    // The user-id swap case: a different store means different data.
    current = { store: { ...store } };
    rerender();

    expect(result.current).not.toBe(first);
  });
});
