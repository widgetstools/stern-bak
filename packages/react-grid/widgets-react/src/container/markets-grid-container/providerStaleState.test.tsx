/**
 * MarketsGridContainer — stale-data banner wiring from provider status
 * events (disconnect → banner + dataStale; loading/ready → clear).
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import type { StorageAdapter } from '@wellsfargo-starui/core';
import type { IDataProvider, Unsubscribe } from '@wellsfargo-starui/data';
import type { ProviderStatus } from '@wellsfargo-starui/data/runtime';

const PROVIDER_ID = 'dp-stale-test';

const providerConfig = {
  providerType: 'mock',
  keyColumn: 'id',
  columnDefinitions: [{ field: 'id' }, { field: 'price' }],
};

const providerRow = {
  configId: PROVIDER_ID,
  name: 'Stale Test Provider',
  config: providerConfig,
};

function createMockProvider(): IDataProvider & {
  start: ReturnType<typeof vi.fn>;
  emitStatus: (status: ProviderStatus, error?: string) => void;
  emitSnapshot: (rows: unknown[]) => void;
} {
  const statusHandlers = new Set<(status: ProviderStatus, error?: string) => void>();
  const snapshotHandlers = new Set<(rows: unknown[]) => void>();

  const provider: IDataProvider & {
    start: ReturnType<typeof vi.fn>;
    emitStatus: (status: ProviderStatus, error?: string) => void;
    emitSnapshot: (rows: unknown[]) => void;
  } = {
    id: PROVIDER_ID,
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
    getConfig: () => providerConfig,
    getColumnDefs: () => providerConfig.columnDefinitions,
    onRowsReceived: vi.fn(() => () => undefined),
    onSnapshotData: vi.fn((handler: (rows: unknown[]) => void): Unsubscribe => {
      snapshotHandlers.add(handler);
      return () => snapshotHandlers.delete(handler);
    }),
    onTick: vi.fn(() => () => undefined),
    onError: vi.fn(() => () => undefined),
    onStatus: vi.fn((handler: (status: ProviderStatus, error?: string) => void): Unsubscribe => {
      statusHandlers.add(handler);
      return () => statusHandlers.delete(handler);
    }),
    emitStatus(status: ProviderStatus, error?: string) {
      for (const handler of statusHandlers) handler(status, error);
    },
    emitSnapshot(rows: unknown[]) {
      for (const handler of snapshotHandlers) handler(rows);
    },
  };

  return provider;
}

let latestProvider: ReturnType<typeof createMockProvider> | null = null;
const restartMock = vi.fn().mockResolvedValue(undefined);
const noopOnError = vi.fn();

const { dataHubClientMock } = vi.hoisted(() => {
  const isProviderRunning = vi.fn().mockResolvedValue(false);
  const waitForProviderRunning = vi.fn().mockResolvedValue(false);
  return { dataHubClientMock: { isProviderRunning, waitForProviderRunning } };
});

const lastMarketsGridProps: { current: any } = { current: null };

vi.mock('@wellsfargo-starui/grid/core', () => ({
  MarketsGrid: (props: any) => {
    lastMarketsGridProps.current = props;
    const readySentRef = React.useRef(false);
    React.useEffect(() => {
      if (!props.onReady || readySentRef.current) return;
      const api = {
        setGridOption: vi.fn(),
        getDisplayedRowCount: () => 0,
        flushAsyncTransactions: vi.fn(),
        applyTransactionAsync: vi.fn(),
        getRowNode: () => null,
      };
      const t = setTimeout(() => {
        if (readySentRef.current) return;
        readySentRef.current = true;
        props.onReady({
          gridApi: api,
          platform: {},
          profiles: {},
          saveAll: vi.fn(),
        });
      }, 0);
      return () => clearTimeout(t);
    }, [props.onReady]);
    return (
      <div
        data-testid="markets-grid-stub"
        data-stale={props.dataStale ? 'true' : 'false'}
        data-stale-message={props.dataStaleMessage ?? ''}
      />
    );
  },
  createMarketsGridContainerEventBus: () => ({
    emit: vi.fn(),
    on: vi.fn(() => () => {}),
  }),
  MARKETS_GRID_EVENT_CATALOG: [],
  useMarketsGridEventBridge: vi.fn(),
}));

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  useDataServices: () => ({ client: dataHubClientMock }),
  useDataProvider: (id: string | null | undefined) => {
    if (id !== PROVIDER_ID) {
      latestProvider = null;
      return {
        provider: null,
        status: 'loading' as ProviderStatus,
        error: undefined,
        start: vi.fn(),
        refresh: vi.fn(),
        restart: restartMock,
      };
    }
    latestProvider ??= createMockProvider();
    return {
      provider: latestProvider,
      status: 'loading' as ProviderStatus,
      error: undefined,
      start: vi.fn(),
      refresh: vi.fn(),
      restart: restartMock,
    };
  },
  useDataProviderConfig: (id: string | null | undefined) => ({
    cfg: id === PROVIDER_ID ? providerRow : null,
    loading: false,
  }),
  useResolvedCfg: (cfg: unknown) => cfg,
  useDataProvidersList: () => ({ configs: [providerRow] }),
  useAppDataStore: () => ({
    store: {
      get: vi.fn(),
      list: () => [],
      subscribe: vi.fn(),
    },
  }),
}));

vi.mock('./LoadingOverlay.js', () => ({ MarketsGridLoadingOverlay: () => null }));
vi.mock('./ProviderEditorDialog.js', () => ({ ProviderEditorDialog: () => null }));

import { MarketsGridContainer } from './MarketsGridContainer.js';

function makeAdapter(initial: unknown = null) {
  let current: unknown = initial;
  const adapter: StorageAdapter = {
    loadGridLevelData: vi.fn(async () => current),
    saveGridLevelData: vi.fn(async (_id: string, data: unknown) => {
      current = data;
    }),
  } as StorageAdapter;
  return adapter;
}

const baseProps = {
  gridId: 'g-stale',
  instanceId: 'inst-stale',
  appId: 'app-1',
  userId: 'u1',
} as const;

describe('MarketsGridContainer — provider stale state', () => {
  beforeEach(() => {
    latestProvider = null;
    restartMock.mockClear();
    noopOnError.mockClear();
    lastMarketsGridProps.current = null;
  });

  it('sets dataStale on provider error and clears after loading→ready', async () => {
    const adapter = makeAdapter({
      liveProviderId: PROVIDER_ID,
      historicalProviderId: null,
      mode: 'live',
    });
    const storage = vi.fn(() => adapter);

    render(
      <MarketsGridContainer
        {...baseProps}
        storage={storage as any}
        onError={noopOnError}
      />,
    );

    await waitFor(() => expect(latestProvider?.start).toHaveBeenCalled(), { timeout: 3000 });

    await act(async () => {
      latestProvider!.emitStatus('loading');
      await Promise.resolve();
      latestProvider!.emitStatus('ready');
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(lastMarketsGridProps.current?.dataStale).toBe(false);
    });

    await act(async () => {
      latestProvider!.emitStatus('error', 'Provider disconnected');
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(lastMarketsGridProps.current?.dataStale).toBe(true);
      expect(lastMarketsGridProps.current?.dataStaleMessage).toContain('Provider disconnected');
    });
    expect(noopOnError).toHaveBeenCalled();

    await act(async () => {
      latestProvider!.emitStatus('loading');
      await Promise.resolve();
      latestProvider!.emitStatus('ready');
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(lastMarketsGridProps.current?.dataStale).toBe(false);
    });
  }, 10_000);

  it('auto-refreshes grid data after disconnect then ready', async () => {
    const adapter = makeAdapter({
      liveProviderId: PROVIDER_ID,
      historicalProviderId: null,
      mode: 'live',
    });
    const storage = vi.fn(() => adapter);
    const refreshedRows = [{ id: 'r1', price: 42 }];

    render(
      <MarketsGridContainer
        {...baseProps}
        storage={storage as any}
        onError={noopOnError}
      />,
    );

    await waitFor(() => expect(latestProvider?.start).toHaveBeenCalled(), { timeout: 3000 });

    latestProvider!.refresh = vi.fn().mockImplementation(async () => {
      latestProvider!.emitSnapshot(refreshedRows);
    });

    await act(async () => {
      latestProvider!.emitStatus('error', 'Provider disconnected');
      await Promise.resolve();
      latestProvider!.emitStatus('ready');
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(latestProvider!.refresh).toHaveBeenCalled();
      expect(lastMarketsGridProps.current?.dataStale).toBe(false);
    });
  }, 10_000);
});
