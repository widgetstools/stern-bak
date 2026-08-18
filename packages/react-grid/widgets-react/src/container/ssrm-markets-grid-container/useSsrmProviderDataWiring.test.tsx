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
  let statusHandler: ((status: string, error?: string) => void) | null = null;
  let errorHandler: ((err: Error) => void) | null = null;
  const offStatus = vi.fn();
  const offError = vi.fn();
  const offRows = vi.fn();
  const provider = {
    id: 'p1',
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    configureExpressions: vi.fn().mockResolvedValue(undefined),
    onStatus: vi.fn((h: (status: string, error?: string) => void) => {
      statusHandler = h;
      return offStatus;
    }),
    onError: vi.fn((h: (err: Error) => void) => {
      errorHandler = h;
      return offError;
    }),
    onRowsReceived: vi.fn((h: (count: number) => void) => {
      rowsHandler = h;
      return () => {
        rowsHandler = null;
        offRows();
      };
    }),
  } as unknown as ISsrmDataProvider;
  return {
    provider,
    offStatus,
    offError,
    offRows,
    fireRows: (count: number) => rowsHandler?.(count),
    fireStatus: (status: string, error?: string) => statusHandler?.(status, error),
    fireError: (err: Error) => errorHandler?.(err),
  };
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

  it('reports ready once the provider has started', async () => {
    const { provider } = makeProvider();
    const onStatus = vi.fn();
    const { result } = renderHook(() => useSsrmProviderDataWiring({ provider, onStatus }));

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(provider.start).toHaveBeenCalledTimes(1);
    // 'Live', not 'Ready' — the same word the status stream uses, so the
    // strip does not flip between two names for one state.
    expect(onStatus.mock.calls.map((c) => c[0])).toEqual(['Connecting…', 'Live']);
  });

  it('is not ready without a provider', () => {
    const { result } = renderHook(() => useSsrmProviderDataWiring({ provider: null }));
    expect(result.current.ready).toBe(false);
  });

  it("prefers a caller-supplied start over the provider's own", async () => {
    const { provider } = makeProvider();
    const startProvider = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useSsrmProviderDataWiring({ provider, startProvider }));

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(startProvider).toHaveBeenCalledWith(provider);
    expect(provider.start).not.toHaveBeenCalled();
  });

  it('pushes the rules it was given before declaring itself ready', async () => {
    const { provider } = makeProvider();
    const rules = [{ id: 'r1' }] as never;
    const { result } = renderHook(() =>
      useSsrmProviderDataWiring({ provider, expressionRules: rules }),
    );

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(provider.configureExpressions).toHaveBeenCalledWith([{ id: 'r1' }]);
  });

  it('does not delay the start on an empty rule list', async () => {
    const { provider } = makeProvider();
    const { result } = renderHook(() =>
      useSsrmProviderDataWiring({ provider, expressionRules: [] }),
    );

    await waitFor(() => expect(result.current.ready).toBe(true));
    // Nothing to push before ready; the post-ready sync still sends the empty
    // list, which is how a cleared rule set reaches the worker.
    expect(provider.configureExpressions).toHaveBeenCalledTimes(1);
    expect(provider.configureExpressions).toHaveBeenCalledWith([]);
  });

  it('sends nothing at all when no rules were supplied', async () => {
    const { provider } = makeProvider();
    const { result } = renderHook(() => useSsrmProviderDataWiring({ provider }));

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(provider.configureExpressions).not.toHaveBeenCalled();
  });

  it('re-pushes the rules when they change after start', async () => {
    const { provider } = makeProvider();
    const { result, rerender } = renderHook(
      ({ rules }: { rules: readonly unknown[] }) =>
        useSsrmProviderDataWiring({ provider, expressionRules: rules as never }),
      { initialProps: { rules: [{ id: 'r1' }] as readonly unknown[] } },
    );
    await waitFor(() => expect(result.current.ready).toBe(true));

    rerender({ rules: [{ id: 'r1' }, { id: 'r2' }] });
    await waitFor(() =>
      expect(provider.configureExpressions).toHaveBeenLastCalledWith([{ id: 'r1' }, { id: 'r2' }]),
    );
  });

  it('translates the provider status stream into strip copy', async () => {
    const { provider, fireStatus } = makeProvider();
    const onStatus = vi.fn();
    const { result } = renderHook(() => useSsrmProviderDataWiring({ provider, onStatus }));
    await waitFor(() => expect(result.current.ready).toBe(true));
    onStatus.mockClear();

    fireStatus('ready');
    fireStatus('loading');
    fireStatus('error', 'socket closed');
    fireStatus('error');
    fireStatus('something-else');

    expect(onStatus.mock.calls.map((c) => c[0])).toEqual([
      'Live',
      'Loading…',
      'socket closed',
      'Error',
    ]);
  });

  it('forwards a provider error', async () => {
    const { provider, fireError } = makeProvider();
    const onError = vi.fn();
    const { result } = renderHook(() => useSsrmProviderDataWiring({ provider, onError }));
    await waitFor(() => expect(result.current.ready).toBe(true));

    const err = new Error('stream died');
    fireError(err);
    expect(onError).toHaveBeenCalledWith(err);
  });

  it('reports a failed start as an error and stays unready', async () => {
    const { provider } = makeProvider();
    (provider.start as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('no route'));
    const onStatus = vi.fn();
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useSsrmProviderDataWiring({ provider, onStatus, onError }),
    );

    await waitFor(() => expect(onError).toHaveBeenCalled());
    expect(result.current.ready).toBe(false);
    expect(onStatus).toHaveBeenCalledWith('no route');
  });

  it('stringifies a non-Error start failure', async () => {
    const { provider } = makeProvider();
    (provider.start as ReturnType<typeof vi.fn>).mockRejectedValue('plain blow-up');
    const onError = vi.fn();
    renderHook(() => useSsrmProviderDataWiring({ provider, onError }));

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'plain blow-up' })),
    );
  });

  it('says nothing when the start was cancelled by a teardown', async () => {
    const { provider } = makeProvider();
    (provider.start as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Subscription cancelled'),
    );
    const onStatus = vi.fn();
    const onError = vi.fn();
    renderHook(() => useSsrmProviderDataWiring({ provider, onStatus, onError }));

    await new Promise((r) => setTimeout(r, 0));
    // A cancelled subscription is a teardown, not a failure to report.
    expect(onError).not.toHaveBeenCalled();
    expect(onStatus).not.toHaveBeenCalledWith('Subscription cancelled');
  });

  it('releases every subscription on unmount', async () => {
    const { provider, offStatus, offError, offRows } = makeProvider();
    const { result, unmount } = renderHook(() => useSsrmProviderDataWiring({ provider }));
    await waitFor(() => expect(result.current.ready).toBe(true));

    unmount();
    expect(offStatus).toHaveBeenCalled();
    expect(offError).toHaveBeenCalled();
    expect(offRows).toHaveBeenCalled();
  });

  it('stops the provider a macrotask after unmount', async () => {
    const { provider } = makeProvider();
    const { result, unmount } = renderHook(() => useSsrmProviderDataWiring({ provider }));
    await waitFor(() => expect(result.current.ready).toBe(true));

    unmount();
    expect(provider.stop).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(provider.stop).toHaveBeenCalledTimes(1);
  });

  it('reuses an in-flight snapshot across a StrictMode remount', async () => {
    const { provider } = makeProvider();
    const first = renderHook(() => useSsrmProviderDataWiring({ provider }));
    await waitFor(() => expect(first.result.current.ready).toBe(true));

    // Unmount + immediate remount on the SAME provider, which is what
    // StrictMode does — the scheduled stop must be cancelled.
    first.unmount();
    const second = renderHook(() => useSsrmProviderDataWiring({ provider }));
    await new Promise((r) => setTimeout(r, 0));

    expect(provider.stop).not.toHaveBeenCalled();
    second.unmount();
  });

  it('drops readiness when the provider goes away', async () => {
    const { provider } = makeProvider();
    const { result, rerender } = renderHook(
      ({ p }: { p: ISsrmDataProvider | null }) => useSsrmProviderDataWiring({ provider: p }),
      { initialProps: { p: provider as ISsrmDataProvider | null } },
    );
    await waitFor(() => expect(result.current.ready).toBe(true));

    rerender({ p: null });
    expect(result.current.ready).toBe(false);
  });
});
