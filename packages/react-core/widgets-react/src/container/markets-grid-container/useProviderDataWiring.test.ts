/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { GridApi } from 'ag-grid-community';

vi.mock('@wellsfargo-starui/grid/customizer', () => ({
  isHistoricalToolbarDate: vi.fn(() => false),
}));

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
});
