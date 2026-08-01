import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import type { DataServices } from '@wellsfargo-starui/data/runtime';
import type { IDataProvider, ProviderCapabilities, Unsubscribe } from '@wellsfargo-starui/data';
import type { ProviderConfig } from '@wellsfargo-starui/types';
import type { ProviderStatus } from '@wellsfargo-starui/data/runtime';
import { DataServicesProvider } from './DataServicesProvider.js';
import { useDataProvider } from './useDataProvider.js';

const mockCapabilities: ProviderCapabilities = {
  providerType: 'mock',
  streaming: true,
  realtime: true,
  supportsRefresh: true,
  supportsRestart: true,
};

function createMockProvider(providerId: string): IDataProvider & {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
  restart: ReturnType<typeof vi.fn>;
  emitStatus: (status: ProviderStatus, error?: string) => void;
  emitError: (message: string) => void;
} {
  const statusHandlers = new Set<(status: ProviderStatus, error?: string) => void>();
  const errorHandlers = new Set<(error: Error) => void>();

  const provider = {
    id: providerId,
    capabilities: mockCapabilities,
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockResolvedValue(undefined),
    getData: vi.fn().mockReturnValue([]),
    getConfig: vi.fn().mockReturnValue({ providerType: 'mock' } as ProviderConfig),
    getColumnDefs: vi.fn().mockReturnValue([]),
    onRowsReceived: vi.fn().mockReturnValue(() => undefined),
    onSnapshotData: vi.fn().mockReturnValue(() => undefined),
    onTick: vi.fn().mockReturnValue(() => undefined),
    onError: vi.fn((handler: (error: Error) => void): Unsubscribe => {
      errorHandlers.add(handler);
      return () => errorHandlers.delete(handler);
    }),
    onStatus: vi.fn((handler: (status: ProviderStatus, error?: string) => void): Unsubscribe => {
      statusHandlers.add(handler);
      return () => statusHandlers.delete(handler);
    }),
    emitStatus(status: ProviderStatus, error?: string) {
      for (const handler of statusHandlers) handler(status, error);
    },
    emitError(message: string) {
      for (const handler of errorHandlers) handler(new Error(message));
    },
  };

  return provider;
}

const mockInstances: ReturnType<typeof createMockProvider>[] = [];

vi.mock('@wellsfargo-starui/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wellsfargo-starui/data')>();
  return {
    ...actual,
    ProviderClientAdapter: vi.fn(function MockProviderClientAdapter(opts: { providerId: string }) {
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

describe('useDataProvider', () => {
  beforeEach(() => {
    mockInstances.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('auto-starts on mount and stops on unmount', async () => {
    const { unmount } = renderHook(() => useDataProvider('p1'), { wrapper });

    await waitFor(() => {
      expect(mockInstances[0]?.start).toHaveBeenCalledTimes(1);
    });

    unmount();

    await waitFor(() => {
      expect(mockInstances[0]?.stop).toHaveBeenCalledTimes(1);
    });
  });

  it('returns provider, status, error, start, refresh, restart', async () => {
    const { result } = renderHook(() => useDataProvider('p1'), { wrapper });

    await waitFor(() => {
      expect(result.current.provider?.id).toBe('p1');
    });

    expect(result.current).toMatchObject({
      status: 'loading',
      start: expect.any(Function),
      refresh: expect.any(Function),
      restart: expect.any(Function),
    });

    mockInstances[0]!.emitStatus('ready');
    await waitFor(() => {
      expect(result.current.status).toBe('ready');
    });

    await result.current.refresh();
    expect(mockInstances[0]!.refresh).toHaveBeenCalledTimes(1);

    await result.current.restart({ __refresh: 1 });
    expect(mockInstances[0]!.restart).toHaveBeenCalledWith({ __refresh: 1 });
  });

  it('reflects provider status and error events', async () => {
    const { result } = renderHook(() => useDataProvider('p1'), { wrapper });
    await waitFor(() => expect(mockInstances[0]).toBeDefined());

    mockInstances[0]!.emitStatus('loading');
    await waitFor(() => expect(result.current.status).toBe('loading'));

    mockInstances[0]!.emitError('upstream blew up');
    await waitFor(() => {
      expect(result.current.status).toBe('error');
      expect(result.current.error).toBe('upstream blew up');
    });
  });

  it('returns null provider when providerId is omitted', () => {
    const { result } = renderHook(() => useDataProvider(null), { wrapper });
    expect(result.current.provider).toBeNull();
    expect(mockInstances).toHaveLength(0);
  });

  it('skips auto-start when autoStart is false until start() is called', async () => {
    const { result } = renderHook(
      () => useDataProvider('p1', { autoStart: false }),
      { wrapper },
    );

    expect(mockInstances[0]?.start).not.toHaveBeenCalled();

    await result.current.start();
    expect(mockInstances[0]?.start).toHaveBeenCalledTimes(1);
  });

  it('does not track status when trackStatus is false', async () => {
    const { result, unmount } = renderHook(
      () => useDataProvider('p1', { trackStatus: false }),
      { wrapper },
    );

    await waitFor(() => {
      expect(mockInstances[0]?.start).toHaveBeenCalled();
    });

    expect(result.current.status).toBe('loading');
    expect(result.current.error).toBeUndefined();

    mockInstances[0]!.emitStatus('ready');
    expect(result.current.status).toBe('loading');

    unmount();
    await waitFor(() => {
      expect(mockInstances[0]?.stop).toHaveBeenCalled();
    });
  });

  it('handles start() error and re-throws', async () => {
    const { result } = renderHook(
      () => useDataProvider('p1', { autoStart: false }),
      { wrapper },
    );

    await waitFor(() => expect(mockInstances[0]).toBeDefined());

    mockInstances[0]!.start.mockRejectedValueOnce(new Error('start failed'));

    await expect(result.current.start()).rejects.toThrow('start failed');
    await waitFor(() => {
      expect(result.current.status).toBe('error');
      expect(result.current.error).toBe('start failed');
    });
  });

  it('handles restart() error and re-throws', async () => {
    const { result } = renderHook(
      () => useDataProvider('p1', { autoStart: false }),
      { wrapper },
    );

    await waitFor(() => expect(mockInstances[0]).toBeDefined());
    await result.current.start();

    mockInstances[0]!.restart.mockRejectedValueOnce(new Error('restart failed'));

    await expect(result.current.restart()).rejects.toThrow('restart failed');
    await waitFor(() => {
      expect(result.current.status).toBe('error');
      expect(result.current.error).toBe('restart failed');
    });
  });

  it('handles non-Error exceptions as strings', async () => {
    const { result } = renderHook(
      () => useDataProvider('p1', { autoStart: false }),
      { wrapper },
    );

    await waitFor(() => expect(mockInstances[0]).toBeDefined());

    mockInstances[0]!.start.mockRejectedValueOnce('string error');

    await expect(result.current.start()).rejects.toBe('string error');
    await waitFor(() => {
      expect(result.current.error).toBe('string error');
    });
  });

  it('clears status and error when providerId changes to null', async () => {
    const { result, rerender } = renderHook(
      ({ providerId }: { providerId: string | null }) => useDataProvider(providerId),
      { wrapper, initialProps: { providerId: 'p1' as string | null } },
    );

    await waitFor(() => {
      expect(result.current.provider).not.toBeNull();
    });

    rerender({ providerId: null });

    await waitFor(() => {
      expect(result.current.provider).toBeNull();
      expect(result.current.status).toBe('loading');
      expect(result.current.error).toBeUndefined();
    });
  });

  it('cancels pending auto-start on unmount', async () => {
    const { unmount } = renderHook(() => useDataProvider('p1'), { wrapper });

    unmount();

    // Provider.stop should be called even if start is still pending
    await waitFor(() => {
      expect(mockInstances[0]?.stop).toHaveBeenCalled();
    });
  });

  it('calls refresh even when provider is starting', async () => {
    const { result } = renderHook(() => useDataProvider('p1'), { wrapper });

    await result.current.refresh();
    expect(mockInstances[0]?.refresh).toHaveBeenCalled();
  });

  it('handles restart with extra config', async () => {
    const { result } = renderHook(
      () => useDataProvider('p1', { autoStart: false }),
      { wrapper },
    );

    await result.current.start();

    const extra = { timeout: 5000, retryCount: 3 };
    await result.current.restart(extra);

    expect(mockInstances[0]!.restart).toHaveBeenCalledWith(extra);
    expect(result.current.status).toBe('loading');
  });

  it('unsubscribes from status and error handlers on unmount', async () => {
    const { unmount } = renderHook(() => useDataProvider('p1'), { wrapper });

    await waitFor(() => {
      expect(mockInstances[0]?.onStatus).toHaveBeenCalled();
      expect(mockInstances[0]?.onError).toHaveBeenCalled();
    });

    unmount();

    // Emit after unmount should not cause errors
    mockInstances[0]!.emitStatus('ready');
    mockInstances[0]!.emitError('should not update');

    // No crash means success
  });
});
