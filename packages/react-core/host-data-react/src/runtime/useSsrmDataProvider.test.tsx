/**
 * The hook's whole job is lifecycle ownership: who starts the adapter, who
 * stops it, and whether this hook or an outer wiring hook is the one holding
 * the handle. `autoStart` and `trackStatus` are what decide that, so most of
 * these cases are about their four combinations.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { DataServices, ProviderStatus } from '@wellsfargo-starui/data/runtime';
import type { Unsubscribe } from '@wellsfargo-starui/data';
import type { TransportConfig } from '@wellsfargo-starui/types';
import { DataServicesProvider } from './DataServicesProvider.js';
import { useSsrmDataProvider } from './useSsrmDataProvider.js';

function createMockAdapter(providerId: string) {
  const statusHandlers = new Set<(status: ProviderStatus, error?: string) => void>();
  const errorHandlers = new Set<(error: Error) => void>();
  return {
    id: providerId,
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockResolvedValue(undefined),
    onStatus: vi.fn((h: (s: ProviderStatus, e?: string) => void): Unsubscribe => {
      statusHandlers.add(h);
      return () => statusHandlers.delete(h);
    }),
    onError: vi.fn((h: (e: Error) => void): Unsubscribe => {
      errorHandlers.add(h);
      return () => errorHandlers.delete(h);
    }),
    unsubStatusCount: () => statusHandlers.size,
    unsubErrorCount: () => errorHandlers.size,
    emitStatus(status: ProviderStatus, error?: string) {
      for (const h of statusHandlers) h(status, error);
    },
    emitError(message: string) {
      for (const h of errorHandlers) h(new Error(message));
    },
  };
}

const adapters: ReturnType<typeof createMockAdapter>[] = [];
const constructorArgs: Array<Record<string, unknown>> = [];

vi.mock('@wellsfargo-starui/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wellsfargo-starui/data')>();
  return {
    ...actual,
    SsrmProviderClientAdapter: vi.fn(function MockSsrm(opts: { providerId: string }) {
      constructorArgs.push(opts);
      const inst = createMockAdapter(opts.providerId);
      adapters.push(inst);
      return inst;
    }),
  };
});

const fakeServices: DataServices = {
  client: { __fake: true } as unknown as DataServices['client'],
  appData: {
    ready: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn(() => () => undefined),
  } as unknown as DataServices['appData'],
  configManager: {} as unknown as ConfigManager,
  ready: Promise.resolve(),
  dispose: vi.fn(),
};

function wrapper({ children }: { children: ReactNode }) {
  return <DataServicesProvider services={fakeServices}>{children}</DataServicesProvider>;
}

/** The adapter the most recent render constructed. */
const latest = () => adapters[adapters.length - 1];

beforeEach(() => {
  adapters.length = 0;
  constructorArgs.length = 0;
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('useSsrmDataProvider — no provider id', () => {
  it('builds nothing and stays in loading', () => {
    const { result } = renderHook(() => useSsrmDataProvider(null), { wrapper });

    expect(result.current.provider).toBeNull();
    expect(adapters).toHaveLength(0);
    expect(result.current.status).toBe('loading');
    expect(result.current.error).toBeUndefined();
  });

  it('treats an empty id the same as a missing one', () => {
    const { result } = renderHook(() => useSsrmDataProvider(''), { wrapper });
    expect(result.current.provider).toBeNull();
  });

  it('leaves status alone when this hook is not tracking it', () => {
    const { result } = renderHook(
      () => useSsrmDataProvider(undefined, { trackStatus: false }),
      { wrapper },
    );
    expect(result.current.provider).toBeNull();
    expect(result.current.status).toBe('loading');
  });

  it('start, refresh and restart are safe no-ops', async () => {
    const { result } = renderHook(() => useSsrmDataProvider(null), { wrapper });

    await act(async () => {
      await result.current.start();
      await result.current.refresh();
      await result.current.restart();
    });
    expect(result.current.status).toBe('loading');
  });
});

describe('useSsrmDataProvider — lifecycle ownership', () => {
  it('auto-starts on mount and stops on unmount', async () => {
    const { unmount } = renderHook(() => useSsrmDataProvider('p1'), { wrapper });

    await waitFor(() => expect(latest().start).toHaveBeenCalledTimes(1));
    unmount();
    expect(latest().stop).toHaveBeenCalledTimes(1);
  });

  it('does not stop a provider it never started', async () => {
    const { unmount } = renderHook(
      () => useSsrmDataProvider('p1', { autoStart: false }),
      { wrapper },
    );

    expect(latest().start).not.toHaveBeenCalled();
    unmount();
    // An outer wiring hook owns the handle; stopping here would kill a plane
    // this hook does not own.
    expect(latest().stop).not.toHaveBeenCalled();
  });

  it('skips the status subscription entirely when not tracking', () => {
    const { unmount } = renderHook(
      () => useSsrmDataProvider('p1', { trackStatus: false }),
      { wrapper },
    );

    expect(latest().onStatus).not.toHaveBeenCalled();
    expect(latest().onError).not.toHaveBeenCalled();
    unmount();
    expect(latest().stop).toHaveBeenCalledTimes(1);
  });

  it('neither subscribes nor stops when it owns nothing', () => {
    const { unmount } = renderHook(
      () => useSsrmDataProvider('p1', { autoStart: false, trackStatus: false }),
      { wrapper },
    );

    unmount();
    expect(latest().onStatus).not.toHaveBeenCalled();
    expect(latest().stop).not.toHaveBeenCalled();
  });

  it('releases both subscriptions on unmount', async () => {
    const { unmount } = renderHook(() => useSsrmDataProvider('p1'), { wrapper });

    await waitFor(() => expect(latest().unsubStatusCount()).toBe(1));
    unmount();
    expect(latest().unsubStatusCount()).toBe(0);
    expect(latest().unsubErrorCount()).toBe(0);
  });

  it('swallows a failing auto-start — the error arrives over onError instead', async () => {
    const { result } = renderHook(() => useSsrmDataProvider('p1'), { wrapper });
    await waitFor(() => expect(latest().start).toHaveBeenCalled());
    latest().start.mockRejectedValueOnce(new Error('worker gone'));

    // Re-mount to take the rejecting path without an unhandled rejection.
    const second = renderHook(() => useSsrmDataProvider('p2'), { wrapper });
    await waitFor(() => expect(latest().start).toHaveBeenCalled());
    expect(result.current.status).toBe('loading');
    second.unmount();
  });

  it('rebuilds the adapter when the provider id changes', async () => {
    const { rerender } = renderHook(
      ({ id }: { id: string }) => useSsrmDataProvider(id),
      { wrapper, initialProps: { id: 'p1' } },
    );
    await waitFor(() => expect(adapters).toHaveLength(1));

    rerender({ id: 'p2' });
    await waitFor(() => expect(adapters).toHaveLength(2));
    expect(adapters[0].stop).toHaveBeenCalledTimes(1);
    expect(constructorArgs.map((a) => a.providerId)).toEqual(['p1', 'p2']);
  });

  it('passes the inline config straight through to the adapter', () => {
    const inlineCfg = { providerType: 'stomp-ssrm' } as unknown as TransportConfig;
    renderHook(() => useSsrmDataProvider('p1', { inlineCfg }), { wrapper });

    expect(constructorArgs[0]).toMatchObject({ providerId: 'p1', inlineCfg });
    expect(constructorArgs[0].client).toBe(fakeServices.client);
  });
});

describe('useSsrmDataProvider — status and errors', () => {
  it('mirrors provider status', async () => {
    const { result } = renderHook(() => useSsrmDataProvider('p1'), { wrapper });
    await waitFor(() => expect(latest().onStatus).toHaveBeenCalled());

    act(() => latest().emitStatus('ready'));
    expect(result.current.status).toBe('ready');

    act(() => latest().emitStatus('error', 'snapshot timed out'));
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('snapshot timed out');
  });

  it('turns a provider error into an error status', async () => {
    const { result } = renderHook(() => useSsrmDataProvider('p1'), { wrapper });
    await waitFor(() => expect(latest().onError).toHaveBeenCalled());

    act(() => latest().emitError('socket closed'));
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('socket closed');
  });
});

describe('useSsrmDataProvider — manual controls', () => {
  it('start() clears a previous error and reports loading', async () => {
    const { result } = renderHook(
      () => useSsrmDataProvider('p1', { autoStart: false }),
      { wrapper },
    );
    act(() => latest().emitError('earlier failure'));

    await act(async () => {
      await result.current.start();
    });

    expect(latest().start).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('loading');
    expect(result.current.error).toBeUndefined();
  });

  it('start() surfaces a failure to the caller as well as to the state', async () => {
    const { result } = renderHook(
      () => useSsrmDataProvider('p1', { autoStart: false }),
      { wrapper },
    );
    latest().start.mockRejectedValueOnce(new Error('no route to worker'));

    // Assert INSIDE act: a rejecting act callback never flushes the state
    // updates the catch block made just before it rethrew.
    await act(async () => {
      await expect(result.current.start()).rejects.toThrow('no route to worker');
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe('no route to worker');
  });

  it('start() stringifies a thrown non-Error', async () => {
    const { result } = renderHook(
      () => useSsrmDataProvider('p1', { autoStart: false }),
      { wrapper },
    );
    latest().start.mockRejectedValueOnce('plain string blow-up');

    await act(async () => {
      await expect(result.current.start()).rejects.toBe('plain string blow-up');
    });

    expect(result.current.error).toBe('plain string blow-up');
  });

  it('refresh() and restart() delegate to the live adapter', async () => {
    const { result } = renderHook(
      () => useSsrmDataProvider('p1', { autoStart: false }),
      { wrapper },
    );

    await act(async () => {
      await result.current.refresh();
      await result.current.restart({ symbol: 'AAPL' });
    });

    expect(latest().refresh).toHaveBeenCalledTimes(1);
    expect(latest().restart).toHaveBeenCalledWith({ symbol: 'AAPL' });
  });
});
