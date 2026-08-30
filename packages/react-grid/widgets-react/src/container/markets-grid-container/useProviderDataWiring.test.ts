/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { GridApi } from 'ag-grid-community';

vi.mock('@wellsfargo-starui/grid/customizer', () => ({
  isHistoricalToolbarDate: vi.fn(() => false),
}));

import { isHistoricalToolbarDate } from '@wellsfargo-starui/grid/customizer';
import { useProviderDataWiring } from './useProviderDataWiring.js';

function makeProvider() {
  const rowsHandlers = new Set<(n: number) => void>();
  const snapshotHandlers = new Set<(rows: unknown[]) => void>();
  const tickHandlers = new Set<(rows: unknown[]) => void>();
  const statusHandlers = new Set<(s: string, err?: string) => void>();
  const errorHandlers = new Set<(err: Error) => void>();
  return {
    onRowsReceived: (fn: (n: number) => void) => { rowsHandlers.add(fn); return () => rowsHandlers.delete(fn); },
    onSnapshotData: (fn: (rows: unknown[]) => void) => { snapshotHandlers.add(fn); return () => snapshotHandlers.delete(fn); },
    onTick: (fn: (rows: unknown[]) => void) => { tickHandlers.add(fn); return () => tickHandlers.delete(fn); },
    onStatus: (fn: (s: string, err?: string) => void) => { statusHandlers.add(fn); return () => statusHandlers.delete(fn); },
    onError: (fn: (err: Error) => void) => { errorHandlers.add(fn); return () => errorHandlers.delete(fn); },
    start: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    __emitSnapshot: (rows: unknown[]) => snapshotHandlers.forEach((h) => h(rows)),
    __emitStatus: (s: string, err?: string) => statusHandlers.forEach((h) => h(s, err)),
    __emitTick: (rows: unknown[]) => tickHandlers.forEach((h) => h(rows)),
    __emitError: (err: Error) => errorHandlers.forEach((h) => h(err)),
    __emitRows: (count: number) => rowsHandlers.forEach((h) => h(count)),
  };
}

function makeGridApi(): GridApi {
  return {
    flushAsyncTransactions: vi.fn(),
    setGridOption: vi.fn(),
    getDisplayedRowCount: vi.fn().mockReturnValue(0),
    getRowNode: vi.fn().mockReturnValue(null),
    applyTransactionAsync: vi.fn(),
  } as unknown as GridApi;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useProviderDataWiring', () => {
  it('skips wiring when api or provider is missing', () => {
    const setLoadRowCount = vi.fn();
    renderHook(() =>
      useProviderDataWiring({
        liveApi: null,
        provider: makeProvider() as any,
        activeId: 'p1',
        subscriptionKey: null,
        rowIdField: 'id',
        rowIdFieldKey: 'id',
        mode: 'live',
        asOfDate: null,
        toolbarDate: 'live',
        dataHubClient: { isProviderRunning: vi.fn(), waitForProviderRunning: vi.fn() } as any,
        restartProvider: vi.fn(),
        containerEventBus: { emit: vi.fn() } as any,
        setLoadRowCount,
        setProviderDisconnected: vi.fn(),
        setDisconnectDetail: vi.fn(),
        setResolvedSubKey: vi.fn(),
        setIsRefetching: vi.fn(),
      }),
    );
    expect(setLoadRowCount).not.toHaveBeenCalled();
  });

  it('commits snapshot rows and clears disconnect on ready', async () => {
    const provider = makeProvider();
    const liveApi = makeGridApi();
    const setLoadRowCount = vi.fn();
    const setResolvedSubKey = vi.fn();
    const setIsRefetching = vi.fn();
    const dataHubClient = {
      isProviderRunning: vi.fn().mockResolvedValue(true),
      waitForProviderRunning: vi.fn(),
    };

    renderHook(() =>
      useProviderDataWiring({
        liveApi,
        provider: provider as any,
        activeId: 'p1',
        subscriptionKey: 'sub',
        rowIdField: 'id',
        rowIdFieldKey: 'id',
        mode: 'live',
        asOfDate: null,
        toolbarDate: 'live',
        dataHubClient: dataHubClient as any,
        restartProvider: vi.fn(),
        containerEventBus: { emit: vi.fn() } as any,
        setLoadRowCount,
        setProviderDisconnected: vi.fn(),
        setDisconnectDetail: vi.fn(),
        setResolvedSubKey,
        setIsRefetching,
      }),
    );

    await waitFor(() => expect(provider.start).toHaveBeenCalled());
    act(() => {
      provider.__emitSnapshot([{ id: '1' }, { id: '2' }]);
    });
    await waitFor(() => expect(setLoadRowCount).toHaveBeenCalledWith(2));
    expect(liveApi.setGridOption).toHaveBeenCalledWith('rowData', [{ id: '1' }, { id: '2' }]);
    expect(setResolvedSubKey).toHaveBeenCalledWith('sub');
    expect(setIsRefetching).toHaveBeenCalledWith(false);
  });

  it('marks disconnected and forwards status errors', async () => {
    const provider = makeProvider();
    const setProviderDisconnected = vi.fn();
    const setDisconnectDetail = vi.fn();
    const onError = vi.fn();
    renderHook(() =>
      useProviderDataWiring({
        liveApi: makeGridApi(),
        provider: provider as any,
        activeId: 'p1',
        subscriptionKey: null,
        rowIdField: 'id',
        rowIdFieldKey: 'id',
        mode: 'live',
        asOfDate: null,
        toolbarDate: 'live',
        dataHubClient: { isProviderRunning: vi.fn().mockResolvedValue(true), waitForProviderRunning: vi.fn() } as any,
        restartProvider: vi.fn(),
        onError,
        containerEventBus: { emit: vi.fn() } as any,
        setLoadRowCount: vi.fn(),
        setProviderDisconnected,
        setDisconnectDetail,
        setResolvedSubKey: vi.fn(),
        setIsRefetching: vi.fn(),
      }),
    );
    await waitFor(() => expect(provider.start).toHaveBeenCalled());
    act(() => {
      provider.__emitStatus('error', 'socket closed');
    });
    expect(setProviderDisconnected).toHaveBeenCalledWith(true);
    expect(setDisconnectDetail).toHaveBeenCalledWith('socket closed');
    expect(onError).toHaveBeenCalled();
  });

  it('forwards provider.onError to the host callback', async () => {
    const provider = makeProvider();
    const onError = vi.fn();
    renderHook(() =>
      useProviderDataWiring({
        liveApi: makeGridApi(),
        provider: provider as any,
        activeId: 'p1',
        subscriptionKey: null,
        rowIdField: 'id',
        rowIdFieldKey: 'id',
        mode: 'live',
        asOfDate: null,
        toolbarDate: 'live',
        dataHubClient: { isProviderRunning: vi.fn().mockResolvedValue(true), waitForProviderRunning: vi.fn() } as any,
        restartProvider: vi.fn(),
        onError,
        containerEventBus: { emit: vi.fn() } as any,
        setLoadRowCount: vi.fn(),
        setProviderDisconnected: vi.fn(),
        setDisconnectDetail: vi.fn(),
        setResolvedSubKey: vi.fn(),
        setIsRefetching: vi.fn(),
      }),
    );
    await waitFor(() => expect(provider.start).toHaveBeenCalled());
    act(() => {
      provider.__emitError(new Error('hub down'));
    });
    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('applies live ticks when rowIdField is absent', async () => {
    const provider = makeProvider();
    const liveApi = makeGridApi();
    renderHook(() =>
      useProviderDataWiring({
        liveApi,
        provider: provider as any,
        activeId: 'p1',
        subscriptionKey: null,
        rowIdField: null,
        rowIdFieldKey: null,
        mode: 'live',
        asOfDate: null,
        toolbarDate: 'live',
        dataHubClient: { isProviderRunning: vi.fn().mockResolvedValue(true), waitForProviderRunning: vi.fn() } as any,
        restartProvider: vi.fn(),
        containerEventBus: { emit: vi.fn() } as any,
        setLoadRowCount: vi.fn(),
        setProviderDisconnected: vi.fn(),
        setDisconnectDetail: vi.fn(),
        setResolvedSubKey: vi.fn(),
        setIsRefetching: vi.fn(),
      }),
    );
    await waitFor(() => expect(provider.start).toHaveBeenCalled());
    act(() => {
      provider.__emitSnapshot([{ id: '1' }]);
    });
    await waitFor(() => expect(liveApi.setGridOption).toHaveBeenCalled());
    act(() => {
      provider.__emitTick([{ id: '2' }]);
    });
    expect(liveApi.applyTransactionAsync).toHaveBeenCalled();
  });

  it('drains the async-transaction queue on every tick while the document is hidden', async () => {
    // Chromium background-throttles AG Grid's flush timer in hidden
    // windows while MessagePort delivery keeps arriving — without an
    // arrival-driven drain the queued row batches accumulate until the
    // renderer OOMs. The guard flushes synchronously per tick when hidden.
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const provider = makeProvider();
    const liveApi = makeGridApi();
    renderHook(() =>
      useProviderDataWiring({
        liveApi,
        provider: provider as any,
        activeId: 'p1',
        subscriptionKey: null,
        rowIdField: 'id',
        rowIdFieldKey: 'id',
        mode: 'live',
        asOfDate: null,
        toolbarDate: 'live',
        dataHubClient: { isProviderRunning: vi.fn().mockResolvedValue(true), waitForProviderRunning: vi.fn() } as any,
        restartProvider: vi.fn(),
        containerEventBus: { emit: vi.fn() } as any,
        setLoadRowCount: vi.fn(),
        setProviderDisconnected: vi.fn(),
        setDisconnectDetail: vi.fn(),
        setResolvedSubKey: vi.fn(),
        setIsRefetching: vi.fn(),
      }),
    );
    await waitFor(() => expect(provider.start).toHaveBeenCalled());
    act(() => {
      provider.__emitTick([{ id: '2' }]);
    });
    expect(liveApi.applyTransactionAsync).toHaveBeenCalled();
    expect(liveApi.flushAsyncTransactions).toHaveBeenCalled();
  });

  it('leaves flushing to AG Grid timer batching while the document is visible', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const provider = makeProvider();
    const liveApi = makeGridApi();
    renderHook(() =>
      useProviderDataWiring({
        liveApi,
        provider: provider as any,
        activeId: 'p1',
        subscriptionKey: null,
        rowIdField: 'id',
        rowIdFieldKey: 'id',
        mode: 'live',
        asOfDate: null,
        toolbarDate: 'live',
        dataHubClient: { isProviderRunning: vi.fn().mockResolvedValue(true), waitForProviderRunning: vi.fn() } as any,
        restartProvider: vi.fn(),
        containerEventBus: { emit: vi.fn() } as any,
        setLoadRowCount: vi.fn(),
        setProviderDisconnected: vi.fn(),
        setDisconnectDetail: vi.fn(),
        setResolvedSubKey: vi.fn(),
        setIsRefetching: vi.fn(),
      }),
    );
    await waitFor(() => expect(provider.start).toHaveBeenCalled());
    act(() => {
      provider.__emitTick([{ id: '2' }]);
    });
    expect(liveApi.applyTransactionAsync).toHaveBeenCalled();
    expect(liveApi.flushAsyncTransactions).not.toHaveBeenCalled();
  });

  it('restarts historical providers when the hub slot is cold', async () => {
    vi.mocked(isHistoricalToolbarDate).mockReturnValue(true);
    const provider = makeProvider();
    const restartProvider = vi.fn().mockResolvedValue(undefined);
    const dataHubClient = {
      isProviderRunning: vi.fn().mockResolvedValue(false),
      waitForProviderRunning: vi.fn().mockResolvedValue(false),
    };

    renderHook(() =>
      useProviderDataWiring({
        liveApi: makeGridApi(),
        provider: provider as any,
        activeId: 'p1',
        subscriptionKey: null,
        rowIdField: 'id',
        rowIdFieldKey: 'id',
        mode: 'historical',
        asOfDate: '2026-01-01',
        toolbarDate: '2026-01-01',
        dataHubClient: dataHubClient as any,
        restartProvider,
        containerEventBus: { emit: vi.fn() } as any,
        setLoadRowCount: vi.fn(),
        setProviderDisconnected: vi.fn(),
        setDisconnectDetail: vi.fn(),
        setResolvedSubKey: vi.fn(),
        setIsRefetching: vi.fn(),
      }),
    );

    await waitFor(() => expect(restartProvider).toHaveBeenCalledWith({ asOfDate: '2026-01-01' }));
  });

  it('sets refetching on loading status and refreshes after reconnect', async () => {
    const provider = makeProvider();
    const setIsRefetching = vi.fn();
    renderHook(() =>
      useProviderDataWiring({
        liveApi: makeGridApi(),
        provider: provider as any,
        activeId: 'p1',
        subscriptionKey: null,
        rowIdField: 'id',
        rowIdFieldKey: 'id',
        mode: 'live',
        asOfDate: null,
        toolbarDate: 'live',
        dataHubClient: { isProviderRunning: vi.fn().mockResolvedValue(true), waitForProviderRunning: vi.fn() } as any,
        restartProvider: vi.fn(),
        containerEventBus: { emit: vi.fn() } as any,
        setLoadRowCount: vi.fn(),
        setProviderDisconnected: vi.fn(),
        setDisconnectDetail: vi.fn(),
        setResolvedSubKey: vi.fn(),
        setIsRefetching,
      }),
    );
    await waitFor(() => expect(provider.start).toHaveBeenCalled());
    act(() => {
      provider.__emitStatus('ready');
      provider.__emitStatus('loading');
      provider.__emitStatus('error', 'down');
      provider.__emitStatus('ready');
    });
    expect(setIsRefetching).toHaveBeenCalledWith(true);
    await waitFor(() => expect(provider.refresh).toHaveBeenCalled());
  });

  it('coalesces row-count updates via requestAnimationFrame', async () => {
    const provider = makeProvider();
    const setLoadRowCount = vi.fn();
    vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 1;
    });
    renderHook(() =>
      useProviderDataWiring({
        liveApi: makeGridApi(),
        provider: provider as any,
        activeId: 'p1',
        subscriptionKey: null,
        rowIdField: 'id',
        rowIdFieldKey: 'id',
        mode: 'live',
        asOfDate: null,
        toolbarDate: 'live',
        dataHubClient: { isProviderRunning: vi.fn().mockResolvedValue(true), waitForProviderRunning: vi.fn() } as any,
        restartProvider: vi.fn(),
        containerEventBus: { emit: vi.fn() } as any,
        setLoadRowCount,
        setProviderDisconnected: vi.fn(),
        setDisconnectDetail: vi.fn(),
        setResolvedSubKey: vi.fn(),
        setIsRefetching: vi.fn(),
      }),
    );
    await waitFor(() => expect(provider.start).toHaveBeenCalled());
    act(() => {
      provider.__emitRows(10);
    });
    await waitFor(() => expect(setLoadRowCount).toHaveBeenCalledWith(10));
  });

  it('uses defaultOnError when no callback is supplied', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const provider = makeProvider();
    renderHook(() =>
      useProviderDataWiring({
        liveApi: makeGridApi(),
        provider: provider as any,
        activeId: 'p1',
        subscriptionKey: null,
        rowIdField: 'id',
        rowIdFieldKey: 'id',
        mode: 'live',
        asOfDate: null,
        toolbarDate: 'live',
        dataHubClient: { isProviderRunning: vi.fn().mockResolvedValue(true), waitForProviderRunning: vi.fn() } as any,
        restartProvider: vi.fn(),
        containerEventBus: { emit: vi.fn() } as any,
        setLoadRowCount: vi.fn(),
        setProviderDisconnected: vi.fn(),
        setDisconnectDetail: vi.fn(),
        setResolvedSubKey: vi.fn(),
        setIsRefetching: vi.fn(),
      }),
    );
    await waitFor(() => expect(provider.start).toHaveBeenCalled());
    act(() => provider.__emitError(new Error('hub')));
    expect(errorLog).toHaveBeenCalled();
    errorLog.mockRestore();
  });

  it('starts immediately when a peer warms the historical hub slot', async () => {
    vi.mocked(isHistoricalToolbarDate).mockReturnValue(true);
    const provider = makeProvider();
    const dataHubClient = {
      isProviderRunning: vi.fn().mockResolvedValue(false),
      waitForProviderRunning: vi.fn().mockResolvedValue(true),
    };
    renderHook(() =>
      useProviderDataWiring({
        liveApi: makeGridApi(),
        provider: provider as any,
        activeId: 'p1',
        subscriptionKey: null,
        rowIdField: 'id',
        rowIdFieldKey: 'id',
        mode: 'historical',
        asOfDate: '2026-02-01',
        toolbarDate: '2026-02-01',
        dataHubClient: dataHubClient as any,
        restartProvider: vi.fn(),
        containerEventBus: { emit: vi.fn() } as any,
        setLoadRowCount: vi.fn(),
        setProviderDisconnected: vi.fn(),
        setDisconnectDetail: vi.fn(),
        setResolvedSubKey: vi.fn(),
        setIsRefetching: vi.fn(),
      }),
    );
    await waitFor(() => expect(provider.start).toHaveBeenCalled());
  });

  it('swallows flush errors and reports async start failures', async () => {
    const onError = vi.fn();
    const liveApi = makeGridApi();
    liveApi.flushAsyncTransactions.mockImplementation(() => {
      throw new Error('flush failed');
    });
    const provider = makeProvider();
    provider.start.mockRejectedValueOnce(new Error('start failed'));
    renderHook(() =>
      useProviderDataWiring({
        liveApi,
        provider: provider as any,
        activeId: 'p1',
        subscriptionKey: null,
        rowIdField: 'id',
        rowIdFieldKey: 'id',
        mode: 'live',
        asOfDate: null,
        toolbarDate: 'live',
        dataHubClient: { isProviderRunning: vi.fn().mockResolvedValue(true), waitForProviderRunning: vi.fn() } as any,
        restartProvider: vi.fn(),
        onError,
        containerEventBus: { emit: vi.fn() } as any,
        setLoadRowCount: vi.fn(),
        setProviderDisconnected: vi.fn(),
        setDisconnectDetail: vi.fn(),
        setResolvedSubKey: vi.fn(),
        setIsRefetching: vi.fn(),
      }),
    );
    await waitFor(() => expect(onError).toHaveBeenCalled());
    act(() => {
      provider.__emitSnapshot([{ id: '1' }]);
    });
    await waitFor(() => expect(liveApi.setGridOption).toHaveBeenCalled());
  });

  it('falls back to a computed subscription key', async () => {
    const provider = makeProvider();
    const setResolvedSubKey = vi.fn();
    renderHook(() =>
      useProviderDataWiring({
        liveApi: makeGridApi(),
        provider: provider as any,
        activeId: 'p1',
        subscriptionKey: null,
        rowIdField: 'id',
        rowIdFieldKey: 'id',
        mode: 'live',
        asOfDate: null,
        toolbarDate: 'live',
        dataHubClient: { isProviderRunning: vi.fn().mockResolvedValue(true), waitForProviderRunning: vi.fn() } as any,
        restartProvider: vi.fn(),
        containerEventBus: { emit: vi.fn() } as any,
        setLoadRowCount: vi.fn(),
        setProviderDisconnected: vi.fn(),
        setDisconnectDetail: vi.fn(),
        setResolvedSubKey,
        setIsRefetching: vi.fn(),
      }),
    );
    await waitFor(() => expect(provider.start).toHaveBeenCalled());
    act(() => provider.__emitSnapshot([{ id: '1' }]));
    await waitFor(() => expect(setResolvedSubKey).toHaveBeenCalledWith('p1::id'));
  });

  it('uses toolbar date for historical restart when asOfDate is unset', async () => {
    vi.mocked(isHistoricalToolbarDate).mockReturnValue(true);
    const restartProvider = vi.fn().mockResolvedValue(undefined);
    renderHook(() =>
      useProviderDataWiring({
        liveApi: makeGridApi(),
        provider: makeProvider() as any,
        activeId: 'p1',
        subscriptionKey: null,
        rowIdField: 'id',
        rowIdFieldKey: 'id',
        mode: 'historical',
        asOfDate: null,
        toolbarDate: '2026-03-01',
        dataHubClient: {
          isProviderRunning: vi.fn().mockResolvedValue(false),
          waitForProviderRunning: vi.fn().mockResolvedValue(false),
        } as any,
        restartProvider,
        containerEventBus: { emit: vi.fn() } as any,
        setLoadRowCount: vi.fn(),
        setProviderDisconnected: vi.fn(),
        setDisconnectDetail: vi.fn(),
        setResolvedSubKey: vi.fn(),
        setIsRefetching: vi.fn(),
      }),
    );
    await waitFor(() => expect(restartProvider).toHaveBeenCalledWith({ asOfDate: '2026-03-01' }));
  });

  it('emits container status events and cancels row-count rAF on cleanup', async () => {
    const provider = makeProvider();
    const bus = { emit: vi.fn() };
    const caf = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {});
    vi.spyOn(globalThis, 'requestAnimationFrame').mockReturnValue(42 as unknown as number);
    const { unmount } = renderHook(() =>
      useProviderDataWiring({
        liveApi: makeGridApi(),
        provider: provider as any,
        activeId: 'p1',
        subscriptionKey: 'sub',
        rowIdField: 'id',
        rowIdFieldKey: 'id',
        mode: 'live',
        asOfDate: null,
        toolbarDate: 'live',
        dataHubClient: { isProviderRunning: vi.fn().mockResolvedValue(true), waitForProviderRunning: vi.fn() } as any,
        restartProvider: vi.fn(),
        containerEventBus: bus as any,
        setLoadRowCount: vi.fn(),
        setProviderDisconnected: vi.fn(),
        setDisconnectDetail: vi.fn(),
        setResolvedSubKey: vi.fn(),
        setIsRefetching: vi.fn(),
      }),
    );
    await waitFor(() => expect(provider.start).toHaveBeenCalled());
    act(() => {
      provider.__emitRows(3);
      provider.__emitStatus('stopped' as never);
    });
    expect(bus.emit).toHaveBeenCalledWith('provider:status', expect.objectContaining({ providerId: 'p1' }));
    unmount();
    expect(caf).toHaveBeenCalledWith(42);
    caf.mockRestore();
  });

  it('skips wiring when activeId is missing', () => {
    const setLoadRowCount = vi.fn();
    renderHook(() =>
      useProviderDataWiring({
        liveApi: makeGridApi(),
        provider: makeProvider() as any,
        activeId: null,
        subscriptionKey: null,
        rowIdField: 'id',
        rowIdFieldKey: 'id',
        mode: 'live',
        asOfDate: null,
        toolbarDate: 'live',
        dataHubClient: { isProviderRunning: vi.fn(), waitForProviderRunning: vi.fn() } as any,
        restartProvider: vi.fn(),
        containerEventBus: { emit: vi.fn() } as any,
        setLoadRowCount,
        setProviderDisconnected: vi.fn(),
        setDisconnectDetail: vi.fn(),
        setResolvedSubKey: vi.fn(),
        setIsRefetching: vi.fn(),
      }),
    );
    expect(setLoadRowCount).not.toHaveBeenCalled();
  });

  it('schedules row-count updates with setTimeout when rAF is unavailable', async () => {
    vi.stubGlobal('requestAnimationFrame', undefined);
    const provider = makeProvider();
    const setLoadRowCount = vi.fn();
    renderHook(() =>
      useProviderDataWiring({
        liveApi: makeGridApi(),
        provider: provider as any,
        activeId: 'p1',
        subscriptionKey: null,
        rowIdField: 'id',
        rowIdFieldKey: 'id',
        mode: 'live',
        asOfDate: null,
        toolbarDate: 'live',
        dataHubClient: { isProviderRunning: vi.fn().mockResolvedValue(true), waitForProviderRunning: vi.fn() } as any,
        restartProvider: vi.fn(),
        containerEventBus: { emit: vi.fn() } as any,
        setLoadRowCount,
        setProviderDisconnected: vi.fn(),
        setDisconnectDetail: vi.fn(),
        setResolvedSubKey: vi.fn(),
        setIsRefetching: vi.fn(),
      }),
    );
    await waitFor(() => expect(provider.start).toHaveBeenCalled());
    act(() => provider.__emitRows(7));
    await waitFor(() => expect(setLoadRowCount).toHaveBeenCalledWith(7), { timeout: 200 });
    vi.unstubAllGlobals();
  });

  it('reports string start failures and refresh failures after reconnect', async () => {
    const onError = vi.fn();
    const provider = makeProvider();
    provider.start.mockRejectedValueOnce('start blew up');
    renderHook(() =>
      useProviderDataWiring({
        liveApi: makeGridApi(),
        provider: provider as any,
        activeId: 'p1',
        subscriptionKey: null,
        rowIdField: 'id',
        rowIdFieldKey: 'id',
        mode: 'live',
        asOfDate: null,
        toolbarDate: 'live',
        dataHubClient: { isProviderRunning: vi.fn().mockResolvedValue(true), waitForProviderRunning: vi.fn() } as any,
        restartProvider: vi.fn(),
        onError,
        containerEventBus: { emit: vi.fn() } as any,
        setLoadRowCount: vi.fn(),
        setProviderDisconnected: vi.fn(),
        setDisconnectDetail: vi.fn(),
        setResolvedSubKey: vi.fn(),
        setIsRefetching: vi.fn(),
      }),
    );
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(Error)));
    onError.mockClear();
    provider.refresh.mockRejectedValueOnce('refresh blew up');
    act(() => {
      provider.__emitStatus('ready');
      provider.__emitStatus('error', 'down');
      provider.__emitStatus('ready');
    });
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(Error)));
  });
});
