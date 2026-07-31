import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ConfigManager } from '@wellsfargo-starui/host-config';
import type { DataServices } from '@wellsfargo-starui/host-data/runtime';
import type { IDataProvider, ProviderCapabilities, Unsubscribe } from '@wellsfargo-starui/host-data';
import type { ProviderConfig } from '@wellsfargo-starui/types';
import type { ProviderStatus } from '@wellsfargo-starui/host-data/runtime';
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

vi.mock('@wellsfargo-starui/host-data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@wellsfargo-starui/host-data')>();
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
});
