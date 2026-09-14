/**
 * BlotterHost — no throwaway grid while the provider config is pending
 * (WORKLOG 20), and stomp-ssrm auto-pick. Moved from MarketsGridContainer.
 */
import { useEffect } from 'react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { ProviderStatus } from '@wellsfargo-starui/data/runtime';
import type { StorageAdapter } from '@wellsfargo-starui/core';

const PROVIDER_ID = 'dp-ssrm';

interface StubMarketsGridProps {
  ssrm?: { provider: { id: string }; cacheBlockSize?: number; blockLoadDebounceMillis?: number; maxConcurrentDatasourceRequests?: number };
  adminActions?: { id: string; onClick: () => void }[];
}

const lastMarketsGridProps: { current: StubMarketsGridProps | null } = { current: null };
let statusListener: ((status: ProviderStatus, error?: string) => void) | null = null;

const RESOLVED_CFG = {
  providerType: 'stomp-ssrm',
  keyColumn: 'positionId',
  blockSize: 175,
  blockLoadDebounceMillis: 120,
  maxConcurrentDatasourceRequests: 4,
  columnDefinitions: [{ field: 'positionId' }, { field: 'desk' }],
};

const ssrmProvider = {
  id: PROVIDER_ID,
  capabilities: { providerType: 'stomp-ssrm', streaming: true, realtime: true, supportsRefresh: true, supportsRestart: true },
  start: vi.fn(), stop: vi.fn(),
  refresh: vi.fn().mockResolvedValue(undefined), restart: vi.fn().mockResolvedValue(undefined),
  getRows: vi.fn(),
  getColumnValues: vi.fn(() => Promise.resolve({ column: 'c', values: [], truncated: false })),
  getRowCount: vi.fn(() => Promise.resolve({ rowCount: 0 })),
  getAggregates: vi.fn(() => Promise.resolve({ values: {} })),
  watchGroups: vi.fn(),
  onSsrmTick: vi.fn(() => () => undefined),
  onRefresh: vi.fn(() => () => undefined),
  onRowsReceived: vi.fn(() => () => undefined),
  onStatus: vi.fn((h: (status: ProviderStatus, error?: string) => void) => { statusListener = h; return () => { statusListener = null; }; }),
  onError: vi.fn(() => () => undefined),
};

const ssrmHookResult = {
  provider: ssrmProvider, status: 'ready' as ProviderStatus, error: undefined,
  start: vi.fn().mockResolvedValue(undefined), refresh: vi.fn().mockResolvedValue(undefined), restart: vi.fn().mockResolvedValue(undefined),
};

const hoisted = vi.hoisted(() => ({
  mounts: { count: 0 },
  configHookResult: {
    cfg: { providerType: 'stomp-ssrm', keyColumn: 'positionId', blockSize: 175, columnDefinitions: [{ field: 'positionId' }, { field: 'desk' }] } as unknown,
    loading: false,
    error: undefined as string | undefined,
  },
}));

vi.mock('@wellsfargo-starui/grid', () => ({
  MarketsGrid: (props: StubMarketsGridProps) => {
    lastMarketsGridProps.current = props;
    // One increment per mount: the host must never build a throwaway grid.
    useEffect(() => { hoisted.mounts.count += 1; }, []);
    return <div data-testid="markets-grid-stub" data-key={String((props as { rowIdField?: unknown }).rowIdField)} />;
  },
  createMarketsGridContainerEventBus: () => ({ emit: vi.fn(), on: vi.fn(() => () => {}) }),
  MARKETS_GRID_EVENT_CATALOG: [],
  useMarketsGridEventBridge: vi.fn(),
}));

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  DataHubProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DataServicesProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePlatformIdentityOrNull: () => null,
  useDataServices: () => ({ client: { isProviderRunning: vi.fn().mockResolvedValue(true), waitForProviderRunning: vi.fn().mockResolvedValue(true) } }),
  useDataProvider: () => ({ provider: null, status: 'loading' as ProviderStatus, error: undefined, start: vi.fn(), refresh: vi.fn(), restart: vi.fn() }),
  useSsrmDataProvider: () => ssrmHookResult,
  useAppDataStore: () => ({ store: { set: vi.fn(), get: vi.fn(), list: () => [], subscribe: vi.fn() } }),
  useDataProviderConfig: () => hoisted.configHookResult,
  useResolvedCfg: () => RESOLVED_CFG,
  useDataProvidersList: () => ({ configs: [{ providerId: PROVIDER_ID, name: 'SSRM', providerType: 'stomp-ssrm', config: { providerType: 'stomp-ssrm' } }], loading: false, refresh: vi.fn() }),
}));

vi.mock('../container/markets-grid-container/LoadingOverlay.js', () => ({ MarketsGridLoadingOverlay: () => null }));
vi.mock('../container/markets-grid-container/ProviderEditorDialog.js', () => ({ ProviderEditorDialog: () => null }));

import { BlotterHost } from './BlotterHost.js';

const fakeConfigManager = { deleteConfig: vi.fn().mockResolvedValue(undefined) } as never;

function makeStorage() {
  const adapter: StorageAdapter = {
    loadGridLevelData: vi.fn(async () => ({ liveProviderId: PROVIDER_ID, historicalProviderId: null, mode: 'live' })),
    saveGridLevelData: vi.fn(async () => {}),
  } as StorageAdapter;
  return vi.fn(() => adapter);
}

const hostProps = {
  componentName: 'SSRM',
  gridId: 'g-ssrm',
  defaultInstanceId: 'inst-ssrm',
  defaultAppId: 'app-1',
  defaultUserId: 'u1',
  configManager: fakeConfigManager,
  defaultLiveProviderId: PROVIDER_ID,
};

function renderHost() {
  return render(<BlotterHost {...hostProps} storage={makeStorage() as never} />);
}

function adminAction(id: string) {
  return lastMarketsGridProps.current?.adminActions?.find((a) => a.id === id);
}

describe('BlotterHost — no throwaway grid while the provider config is pending', () => {
  const loadedCfg = hoisted.configHookResult.cfg;
  const restore = () => {
    lastMarketsGridProps.current = null;
    hoisted.mounts.count = 0;
    hoisted.configHookResult.cfg = loadedCfg;
    hoisted.configHookResult.loading = false;
    hoisted.configHookResult.error = undefined;
  };
  beforeEach(restore);
  afterEach(restore);

  it('shows the loading note, not the no-provider grid, when a chosen provider has no cfg yet even with loading:false', async () => {
    hoisted.configHookResult.cfg = null;
    hoisted.configHookResult.loading = false;
    const view = renderHost();
    await waitFor(() => expect(view.getByText(/Loading/)).toBeInTheDocument());
    expect(view.queryByTestId('markets-grid-stub')).toBeNull();
    expect(hoisted.mounts.count).toBe(0);
    hoisted.configHookResult.cfg = loadedCfg;
    view.rerender(<BlotterHost {...hostProps} storage={makeStorage() as never} />);
    await waitFor(() => expect(view.getByTestId('markets-grid-stub')).toBeInTheDocument());
    expect(hoisted.mounts.count).toBe(1);
    expect(lastMarketsGridProps.current?.ssrm?.provider.id).toBe(PROVIDER_ID);
  });

  it('still offers the no-provider grid when the config fetch failed (error set)', async () => {
    hoisted.configHookResult.cfg = null;
    hoisted.configHookResult.loading = false;
    hoisted.configHookResult.error = 'get-config failed';
    const view = renderHost();
    await waitFor(() => expect(view.getByTestId('markets-grid-stub')).toBeInTheDocument());
    expect(view.getByTestId('markets-grid-stub').getAttribute('data-key')).toBe('__none__');
  });
});

describe('BlotterHost — stomp-ssrm auto-pick', () => {
  beforeEach(() => {
    lastMarketsGridProps.current = null;
    statusListener = null;
    ssrmHookResult.refresh.mockClear();
    ssrmHookResult.restart.mockClear();
  });

  it('passes MarketsGrid.ssrm and never a CSRM provider', async () => {
    renderHost();
    await waitFor(() => expect(lastMarketsGridProps.current?.ssrm?.provider.id).toBe(PROVIDER_ID));
    expect(lastMarketsGridProps.current?.ssrm?.cacheBlockSize).toBe(175);
    expect(lastMarketsGridProps.current?.ssrm?.blockLoadDebounceMillis).toBe(120);
    expect(lastMarketsGridProps.current?.ssrm?.maxConcurrentDatasourceRequests).toBe(4);
  });

  it('keeps the ssrm config referentially stable across re-renders', async () => {
    const { rerender } = renderHost();
    await waitFor(() => expect(lastMarketsGridProps.current?.ssrm).toBeDefined());
    const first = lastMarketsGridProps.current?.ssrm;
    statusListener?.('ready');
    rerender(<BlotterHost {...hostProps} storage={makeStorage() as never} />);
    expect(lastMarketsGridProps.current?.ssrm).toBe(first);
  });

  it('routes Refresh view and Reload from source at the SSRM provider', async () => {
    renderHost();
    await waitFor(() => expect(adminAction('refresh-view')).toBeDefined());
    adminAction('refresh-view')!.onClick();
    expect(ssrmHookResult.refresh).toHaveBeenCalledTimes(1);
    adminAction('reload-from-source')!.onClick();
    await waitFor(() => expect(ssrmHookResult.restart).toHaveBeenCalledTimes(1));
  });
});
