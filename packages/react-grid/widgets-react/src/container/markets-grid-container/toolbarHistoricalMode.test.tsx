/**
 * MarketsGridContainer — primary toolbar date → historical provider mode,
 * restart payload, and historical-view banner wiring.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import type { StorageAdapter } from '@wellsfargo-starui/core';
import type { IDataProvider, Unsubscribe } from '@wellsfargo-starui/data';
import type { ProviderStatus } from '@wellsfargo-starui/data/runtime';

const LIVE_PROVIDER_ID = 'dp-live';
const HIST_PROVIDER_ID = 'dp-hist';

const liveProviderRow = {
  configId: LIVE_PROVIDER_ID,
  name: 'Live Provider',
  config: {
    providerType: 'mock',
    keyColumn: 'id',
    columnDefinitions: [{ field: 'id' }, { field: 'price' }],
  },
};

const histProviderRow = {
  configId: HIST_PROVIDER_ID,
  name: 'Historical Provider',
  config: {
    providerType: 'mock',
    keyColumn: 'id',
    columnDefinitions: [{ field: 'id' }, { field: 'price' }],
  },
};

function createMockProvider(id: string): IDataProvider & {
  start: ReturnType<typeof vi.fn>;
  emitStatus: (status: ProviderStatus, error?: string) => void;
} {
  const statusHandlers = new Set<(status: ProviderStatus, error?: string) => void>();

  const provider: IDataProvider & {
    start: ReturnType<typeof vi.fn>;
    emitStatus: (status: ProviderStatus, error?: string) => void;
  } = {
    id,
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
    getConfig: () => (id === HIST_PROVIDER_ID ? histProviderRow.config : liveProviderRow.config),
    getColumnDefs: () => liveProviderRow.config.columnDefinitions,
    onRowsReceived: vi.fn(() => () => undefined),
    onSnapshotData: vi.fn(() => () => undefined),
    onTick: vi.fn(() => () => undefined),
    onError: vi.fn(() => () => undefined),
    onStatus: vi.fn((handler: (status: ProviderStatus, error?: string) => void): Unsubscribe => {
      statusHandlers.add(handler);
      return () => statusHandlers.delete(handler);
    }),
    emitStatus(status: ProviderStatus, error?: string) {
      for (const handler of statusHandlers) handler(status, error);
    },
  };

  return provider;
}

const providers = new Map<string, ReturnType<typeof createMockProvider>>();
const { dataHubClientMock } = vi.hoisted(() => {
  const isProviderRunning = vi.fn().mockResolvedValue(false);
  const waitForProviderRunning = vi.fn().mockResolvedValue(false);
  return { dataHubClientMock: { isProviderRunning, waitForProviderRunning } };
});
const restartMock = vi.fn().mockResolvedValue(undefined);
const appDataSet = vi.fn().mockResolvedValue(undefined);
const saveAllMock = vi.fn().mockResolvedValue(undefined);
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
          saveAll: saveAllMock,
        });
      }, 0);
      return () => clearTimeout(t);
    }, [props.onReady]);
    return (
      <div
        data-testid="markets-grid-stub"
        data-toolbar-date={props.toolbarDate ?? ''}
        data-historical-view={props.historicalViewMode ? 'true' : 'false'}
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
    if (!id) {
      return {
        provider: null,
        status: 'loading' as ProviderStatus,
        error: undefined,
        start: vi.fn(),
        refresh: vi.fn(),
        restart: restartMock,
      };
    }
    if (!providers.has(id)) {
      providers.set(id, createMockProvider(id));
    }
    return {
      provider: providers.get(id)!,
      status: 'loading' as ProviderStatus,
      error: undefined,
      start: vi.fn(),
      refresh: vi.fn(),
      restart: restartMock,
    };
  },
  useDataProviderConfig: (id: string | null | undefined) => ({
    cfg: id === LIVE_PROVIDER_ID
      ? liveProviderRow
      : id === HIST_PROVIDER_ID
        ? histProviderRow
        : null,
    loading: false,
  }),
  useResolvedCfg: (cfg: unknown) => cfg,
  useDataProvidersList: () => ({ configs: [liveProviderRow, histProviderRow] }),
  useAppDataStore: () => ({
    store: {
      get: vi.fn(),
      set: appDataSet,
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
  gridId: 'g-hist',
  instanceId: 'inst-hist',
  appId: 'app-1',
  userId: 'u1',
} as const;

describe('MarketsGridContainer — toolbar historical mode', () => {
  beforeEach(() => {
    providers.clear();
    restartMock.mockClear();
    appDataSet.mockClear();
    saveAllMock.mockClear();
    lastMarketsGridProps.current = null;
  });

  it('switches to historical provider and restarts when a past toolbar date is selected', async () => {
    const adapter = makeAdapter({
      liveProviderId: LIVE_PROVIDER_ID,
      historicalProviderId: HIST_PROVIDER_ID,
      mode: 'live',
    });
    const storage = vi.fn(() => adapter);

    render(
      <MarketsGridContainer
        {...baseProps}
        storage={storage as any}
        defaultLiveProviderId={LIVE_PROVIDER_ID}
        defaultHistoricalProviderId={HIST_PROVIDER_ID}
        historicalDateAppDataRef="positions.asOfDate"
      />,
    );

    await waitFor(() => expect(lastMarketsGridProps.current).not.toBeNull());

    restartMock.mockClear();

    await act(async () => {
      lastMarketsGridProps.current.onToolbarDateChange('2026-04-01');
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(
      () => {
        expect(lastMarketsGridProps.current?.historicalViewMode).toBe(true);
        expect(lastMarketsGridProps.current?.historicalViewMessage).toContain('2026-04-01');
      },
      { timeout: 10_000 },
    );

    await waitFor(
      () => {
        expect(restartMock).toHaveBeenCalled();
        expect(
          restartMock.mock.calls.some(([extra]) => extra?.asOfDate === '2026-04-01'),
        ).toBe(true);
      },
      { timeout: 10_000 },
    );

    expect(appDataSet).toHaveBeenCalledWith('positions', 'asOfDate', '2026-04-01');
  }, 15_000);

  it('save-and-switch: flushes pending edits via saveAll() before applying a provider change', async () => {
    // Changing the live provider changes `activeId`, which is part of the
    // <MarketsGrid> key — so the grid remounts and re-hydrates the
    // customizer from disk. Without a flush, other tabs' in-memory per-card
    // "Save"s (e.g. a Grid Options status-bar edit) would be discarded by
    // that remount. The container must call the grid handle's saveAll()
    // FIRST so the working set is persisted and survives the remount.
    const adapter = makeAdapter({
      liveProviderId: LIVE_PROVIDER_ID,
      historicalProviderId: HIST_PROVIDER_ID,
      mode: 'live',
    });
    const storage = vi.fn(() => adapter);

    render(
      <MarketsGridContainer
        {...baseProps}
        storage={storage as any}
        defaultLiveProviderId={LIVE_PROVIDER_ID}
        defaultHistoricalProviderId={HIST_PROVIDER_ID}
      />,
    );

    await waitFor(() => expect(lastMarketsGridProps.current).not.toBeNull());
    // Let the mock grid's onReady (setTimeout 0) fire so the container
    // captures the grid handle (and its saveAll).
    await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    expect(lastMarketsGridProps.current?.providerGridHost).toBeTruthy();
    saveAllMock.mockClear();

    await act(async () => {
      lastMarketsGridProps.current.providerGridHost.onLiveChange(HIST_PROVIDER_ID);
      await Promise.resolve();
    });

    expect(saveAllMock).toHaveBeenCalledTimes(1);
  }, 15_000);
});
