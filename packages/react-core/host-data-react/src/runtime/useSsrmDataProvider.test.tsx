import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { DataServices } from '@wellsfargo-starui/data/runtime';
import type { ISsrmDataProvider, Unsubscribe } from '@wellsfargo-starui/data';
import type { ProviderStatus } from '@wellsfargo-starui/data/runtime';
import { DataServicesProvider } from './DataServicesProvider.js';
import { useSsrmDataProvider } from './useSsrmDataProvider.js';

let nextStart: (() => Promise<void>) | null = null;

function createMockProvider(providerId: string): ISsrmDataProvider & {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  restart: ReturnType<typeof vi.fn>;
  emitStatus: (status: ProviderStatus, error?: string) => void;
  emitError: (message: string) => void;
} {
  const statusHandlers = new Set<(status: ProviderStatus, error?: string) => void>();
  const errorHandlers = new Set<(error: Error) => void>();

  return {
    id: providerId,
    capabilities: {
      providerType: 'stomp-ssrm',
      streaming: true,
      realtime: true,
      supportsRefresh: true,
      supportsRestart: true,
    },
    start: vi.fn().mockImplementation(() => (nextStart ? nextStart() : Promise.resolve())),
    stop: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockResolvedValue(undefined),
    getConfig: vi.fn(),
    getColumnDefs: vi.fn(() => []),
    getRows: vi.fn(),
    getColumnValues: vi.fn(() => Promise.resolve({ column: 'c', values: [], truncated: false })),
  getRowCount: vi.fn(() => Promise.resolve({ rowCount: 0 })),
  getAggregates: vi.fn(() => Promise.resolve({ values: {} })),
    watchGroups: vi.fn(),
    onSsrmTick: vi.fn(() => () => undefined),
    onRefresh: vi.fn(() => () => undefined),
    onRowsReceived: vi.fn(() => () => undefined),
    onError: vi.fn((handler: (error: Error) => void): Unsubscribe => {
      errorHandlers.add(handler);
      return () => { errorHandlers.delete(handler); };
    }),
    onStatus: vi.fn((handler: (status: ProviderStatus, error?: string) => void): Unsubscribe => {
      statusHandlers.add(handler);
      return () => { statusHandlers.delete(handler); };
    }),
    emitStatus(status: ProviderStatus, error?: string) {
      for (const handler of statusHandlers) handler(status, error);
    },
    emitError(message: string) {
      for (const handler of errorHandlers) handler(new Error(message));
    },
  };
}

const mockInstances: ReturnType<typeof createMockProvider>[] = [];

vi.mock('@wellsfargo-starui/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wellsfargo-starui/data')>();
  return {
    ...actual,
    SsrmProviderClientAdapter: vi.fn(function MockSsrmAdapter(opts: { providerId: string }) {
      const inst = createMockProvider(opts.providerId);
      mockInstances.push(inst);
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
  configManager: {
    deleteConfig: vi.fn().mockResolvedValue(undefined),
  } as unknown as ConfigManager,
  ready: Promise.resolve(),
  dispose: vi.fn(),
};

function wrapper({ children }: { children: ReactNode }) {
  return (
    <DataServicesProvider services={fakeServices}>
      {children}
    </DataServicesProvider>
  );
}

describe('useSsrmDataProvider', () => {
  beforeEach(() => {
    mockInstances.length = 0;
    nextStart = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('auto-starts on mount and stops on unmount', async () => {
    const { unmount } = renderHook(() => useSsrmDataProvider('p1'), { wrapper });
    await waitFor(() => expect(mockInstances[0]?.start).toHaveBeenCalledTimes(1));
    unmount();
    await waitFor(() => expect(mockInstances[0]?.stop).toHaveBeenCalledTimes(1));
  });

  it('mirrors status and error events', async () => {
    const { result } = renderHook(() => useSsrmDataProvider('p1'), { wrapper });
    await waitFor(() => expect(mockInstances[0]).toBeDefined());
    act(() => { mockInstances[0]!.emitStatus('ready'); });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    act(() => { mockInstances[0]!.emitError('wasm down'); });
    await waitFor(() => {
      expect(result.current.status).toBe('error');
      expect(result.current.error).toBe('wasm down');
    });
  });

  it('returns null when providerId is omitted', () => {
    const { result } = renderHook(() => useSsrmDataProvider(null), { wrapper });
    expect(result.current.provider).toBeNull();
    expect(mockInstances).toHaveLength(0);
  });

  it('skips auto-start until start() is called', async () => {
    const { result } = renderHook(
      () => useSsrmDataProvider('p1', { autoStart: false }),
      { wrapper },
    );
    expect(mockInstances[0]?.start).not.toHaveBeenCalled();
    await result.current.start();
    expect(mockInstances[0]?.start).toHaveBeenCalledTimes(1);
  });

  it('does not track status when trackStatus is false', async () => {
    const { result, unmount } = renderHook(
      () => useSsrmDataProvider('p1', { trackStatus: false }),
      { wrapper },
    );
    await waitFor(() => expect(mockInstances[0]?.start).toHaveBeenCalled());
    mockInstances[0]!.emitStatus('ready');
    expect(result.current.status).toBe('loading');
    unmount();
    await waitFor(() => expect(mockInstances[0]?.stop).toHaveBeenCalled());
  });

  it('surfaces auto-start Error failures', async () => {
    nextStart = () => Promise.reject(new Error('boot failed'));
    const { result } = renderHook(() => useSsrmDataProvider('p1'), { wrapper });
    await waitFor(() => {
      expect(result.current.status).toBe('error');
      expect(result.current.error).toBe('boot failed');
    });
  });

  it('surfaces non-Error auto-start failures as strings', async () => {
    nextStart = () => Promise.reject('string fail');
    const { result } = renderHook(() => useSsrmDataProvider('p1'), { wrapper });
    await waitFor(() => {
      expect(result.current.status).toBe('error');
      expect(result.current.error).toBe('string fail');
    });
  });

  it('restarts through the adapter', async () => {
    const { result } = renderHook(
      () => useSsrmDataProvider('p1', { autoStart: false }),
      { wrapper },
    );
    await result.current.start();
    await result.current.restart({ asOfDate: '2026-01-01' });
    expect(mockInstances[0]!.restart).toHaveBeenCalledWith({ asOfDate: '2026-01-01' });
  });

  it('refreshes through the adapter', async () => {
    const { result } = renderHook(
      () => useSsrmDataProvider('p1', { autoStart: false }),
      { wrapper },
    );
    await result.current.start();
    await result.current.refresh();
    expect(mockInstances[0]!.refresh).toHaveBeenCalled();
  });

  it('reports a failed restart as an error status and rethrows', async () => {
    const { result } = renderHook(
      () => useSsrmDataProvider('p1', { autoStart: false }),
      { wrapper },
    );
    await result.current.start();
    mockInstances[0]!.restart.mockRejectedValueOnce(new Error('reconnect failed'));
    await expect(result.current.restart()).rejects.toThrow('reconnect failed');
    await waitFor(() => {
      expect(result.current.status).toBe('error');
      expect(result.current.error).toBe('reconnect failed');
    });
  });

  it('start and refresh are no-ops when there is no provider', async () => {
    const { result } = renderHook(() => useSsrmDataProvider(null, { autoStart: false }), { wrapper });
    await expect(result.current.start()).resolves.toBeUndefined();
    await expect(result.current.refresh()).resolves.toBeUndefined();
    await expect(result.current.restart()).resolves.toBeUndefined();
  });

  it('clears status when providerId becomes null', async () => {
    const { result, rerender } = renderHook(
      ({ providerId }: { providerId: string | null }) => useSsrmDataProvider(providerId),
      { wrapper, initialProps: { providerId: 'p1' as string | null } },
    );
    await waitFor(() => expect(result.current.provider).not.toBeNull());
    rerender({ providerId: null });
    await waitFor(() => {
      expect(result.current.provider).toBeNull();
      expect(result.current.status).toBe('loading');
      expect(result.current.error).toBeUndefined();
    });
  });

  it('ignores auto-start failure after unmount', async () => {
    let resolveStart: (() => void) | undefined;
    nextStart = () => new Promise<void>((resolve, reject) => {
      resolveStart = () => reject(new Error('late'));
    });
    const { unmount } = renderHook(() => useSsrmDataProvider('p1'), { wrapper });
    await waitFor(() => expect(mockInstances[0]?.start).toHaveBeenCalled());
    unmount();
    resolveStart?.();
    await Promise.resolve();
  });
});
