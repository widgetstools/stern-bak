import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { GridApi } from 'ag-grid-community';
import type { IDataProvider } from '@wellsfargo-starui/host-data';
import type { ProviderStatus } from '@wellsfargo-starui/host-data/runtime';
import { useBlotterDataConnection } from './useBlotterDataConnection.js';

function createMockProvider(): IDataProvider & {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  emitSnapshot: (rows: Record<string, unknown>[]) => void;
  emitTick: (rows: Record<string, unknown>[]) => void;
} {
  const snapshotHandlers = new Set<(rows: readonly Record<string, unknown>[]) => void>();
  const tickHandlers = new Set<(rows: readonly Record<string, unknown>[]) => void>();

  return {
    id: 'p1',
    capabilities: {
      providerType: 'mock',
      streaming: true,
      realtime: true,
      supportsRefresh: true,
      supportsRestart: true,
    },
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    restart: vi.fn().mockResolvedValue(undefined),
    getData: () => [],
    getConfig: () => ({ providerType: 'mock' }),
    getColumnDefs: () => [],
    onRowsReceived: vi.fn(() => () => undefined),
    onSnapshotData: vi.fn((handler) => {
      snapshotHandlers.add(handler);
      return () => snapshotHandlers.delete(handler);
    }),
    onTick: vi.fn((handler) => {
      tickHandlers.add(handler);
      return () => tickHandlers.delete(handler);
    }),
    onError: vi.fn(() => () => undefined),
    onStatus: vi.fn(() => () => undefined),
    emitSnapshot(rows) {
      for (const handler of snapshotHandlers) handler(rows);
    },
    emitTick(rows) {
      for (const handler of tickHandlers) handler(rows);
    },
  };
}

function makeGridApi(): GridApi & {
  setGridOption: ReturnType<typeof vi.fn>;
  applyTransactionAsync: ReturnType<typeof vi.fn>;
  flushAsyncTransactions: ReturnType<typeof vi.fn>;
  getRowNode: ReturnType<typeof vi.fn>;
  getDisplayedRowCount: ReturnType<typeof vi.fn>;
} {
  return {
    setGridOption: vi.fn(),
    applyTransactionAsync: vi.fn(),
    flushAsyncTransactions: vi.fn(),
    getRowNode: vi.fn(() => null),
    getDisplayedRowCount: vi.fn(() => 2),
  } as unknown as GridApi & {
    setGridOption: ReturnType<typeof vi.fn>;
    applyTransactionAsync: ReturnType<typeof vi.fn>;
    flushAsyncTransactions: ReturnType<typeof vi.fn>;
    getRowNode: ReturnType<typeof vi.fn>;
    getDisplayedRowCount: ReturnType<typeof vi.fn>;
  };
}

vi.mock('@wellsfargo-starui/host-data-react/runtime', () => ({
  useDataProvider: () => ({
    provider: null,
    status: 'loading' as ProviderStatus,
    error: undefined,
    start: vi.fn(),
    refresh: vi.fn(),
    restart: vi.fn(),
  }),
}));

describe('useBlotterDataConnection', () => {
  let provider: ReturnType<typeof createMockProvider>;
  let gridApi: ReturnType<typeof makeGridApi>;

  beforeEach(() => {
    provider = createMockProvider();
    gridApi = makeGridApi();
  });

  it('starts provider and applies snapshot rowData', async () => {
    const { result, unmount } = renderHook(() =>
      useBlotterDataConnection({ gridApi, provider, providerId: 'p1' }),
    );

    await waitFor(() => expect(provider.start).toHaveBeenCalledTimes(1));
    expect(result.current.isConnected).toBe(true);

    await act(async () => {
      provider.emitSnapshot([{ id: 'r1' }, { id: 'r2' }]);
      await Promise.resolve();
    });

    expect(gridApi.flushAsyncTransactions).toHaveBeenCalled();
    expect(gridApi.setGridOption).toHaveBeenCalledWith('rowData', [{ id: 'r1' }, { id: 'r2' }]);

    unmount();
    await waitFor(() => expect(provider.stop).toHaveBeenCalledTimes(1));
  });

  it('sets rowCount on snapshot but not on update-only ticks', async () => {
    gridApi.getRowNode.mockImplementation((id: string) => (id === 'r1' ? { id } : null));

    const { result } = renderHook(() =>
      useBlotterDataConnection({ gridApi, provider, getRowId: (row) => String(row.id) }),
    );

    await waitFor(() => expect(provider.start).toHaveBeenCalled());

    await act(async () => {
      provider.emitSnapshot([{ id: 'r1' }, { id: 'r2' }]);
      await Promise.resolve();
    });
    expect(result.current.rowCount).toBe(2);

    gridApi.getDisplayedRowCount.mockClear();
    provider.emitTick([{ id: 'r1', x: 99 }]);
    expect(gridApi.getDisplayedRowCount).not.toHaveBeenCalled();
    expect(result.current.rowCount).toBe(2);
  });

  it('updates rowCount when live ticks add rows', async () => {
    gridApi.getRowNode.mockImplementation((id: string) => (id === 'r1' ? { id } : null));
    gridApi.getDisplayedRowCount.mockReturnValue(3);

    const { result } = renderHook(() =>
      useBlotterDataConnection({
        gridApi,
        provider,
        getRowId: (row) => String(row.id),
      }),
    );

    await waitFor(() => expect(provider.start).toHaveBeenCalled());

    await act(async () => {
      provider.emitSnapshot([{ id: 'r1' }, { id: 'r2' }]);
      await Promise.resolve();
    });

    await act(async () => {
      provider.emitTick([{ id: 'r1', x: 2 }, { id: 'r3', x: 1 }]);
    });
    expect(result.current.rowCount).toBe(3);
  });

  it('applies live ticks via applyTransactionAsync when getRowId is set', async () => {
    gridApi.getRowNode.mockImplementation((id: string) => (id === 'r1' ? { id } : null));

    renderHook(() =>
      useBlotterDataConnection({
        gridApi,
        provider,
        getRowId: (row) => String(row.id),
      }),
    );

    await waitFor(() => expect(provider.start).toHaveBeenCalled());

    provider.emitTick([{ id: 'r1', x: 2 }, { id: 'r2', x: 1 }]);
    expect(gridApi.applyTransactionAsync).toHaveBeenCalledWith({
      add: [{ id: 'r2', x: 1 }],
      update: [{ id: 'r1', x: 2 }],
    }, expect.any(Function));
  });
});
