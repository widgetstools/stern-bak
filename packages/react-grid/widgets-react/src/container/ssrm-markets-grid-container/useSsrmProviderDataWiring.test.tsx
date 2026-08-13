import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import { useSsrmProviderDataWiring } from './useSsrmProviderDataWiring.js';

/**
 * The worker streams a large snapshot as hundreds of rows-received batches
 * in the same task. One setState per batch used to trip React's
 * nested-update ceiling ("Maximum update depth exceeded") and could kill
 * the app's root — the hook must coalesce the burst into ~one update per
 * window while still reporting the final count.
 */

function makeProvider() {
  let rowsHandler: ((count: number) => void) | null = null;
  const provider = {
    id: 'p1',
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    onStatus: vi.fn(() => () => undefined),
    onError: vi.fn(() => () => undefined),
    onRowsReceived: vi.fn((h: (count: number) => void) => {
      rowsHandler = h;
      return () => {
        rowsHandler = null;
      };
    }),
  } as unknown as ISsrmDataProvider;
  return { provider, fireRows: (count: number) => rowsHandler?.(count) };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('useSsrmProviderDataWiring', () => {
  it('coalesces a rows-received burst into a single trailing update', async () => {
    const { provider, fireRows } = makeProvider();
    const setLoadRowCount = vi.fn();

    const { unmount } = renderHook(() =>
      useSsrmProviderDataWiring({ provider, setLoadRowCount }),
    );
    await waitFor(() => expect(provider.onRowsReceived).toHaveBeenCalled());

    vi.useFakeTimers();
    for (let i = 1; i <= 500; i += 1) fireRows(i * 40);
    expect(setLoadRowCount).not.toHaveBeenCalled();

    vi.advanceTimersByTime(150);
    expect(setLoadRowCount).toHaveBeenCalledTimes(1);
    expect(setLoadRowCount).toHaveBeenCalledWith(20_000);
    unmount();
  });

  it('drops a pending count update on unmount', async () => {
    const { provider, fireRows } = makeProvider();
    const setLoadRowCount = vi.fn();

    const { unmount } = renderHook(() =>
      useSsrmProviderDataWiring({ provider, setLoadRowCount }),
    );
    await waitFor(() => expect(provider.onRowsReceived).toHaveBeenCalled());

    vi.useFakeTimers();
    fireRows(1_000);
    unmount();
    vi.advanceTimersByTime(500);
    expect(setLoadRowCount).not.toHaveBeenCalled();
  });
});
