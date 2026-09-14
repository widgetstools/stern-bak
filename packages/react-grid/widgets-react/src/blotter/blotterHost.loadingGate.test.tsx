/**
 * BlotterHost — defer the AG Grid mount while the worker catalog row for
 * the active provider is still loading (moved from MarketsGridContainer,
 * WORKLOG 20).
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { ProviderStatus } from '@wellsfargo-starui/data/runtime';
import type { StorageAdapter } from '@wellsfargo-starui/core';

const LIVE_PROVIDER_ID = 'dp-live';

const liveProviderRow = {
  providerId: LIVE_PROVIDER_ID,
  name: 'Live Provider',
  providerType: 'mock',
  config: { providerType: 'mock', keyColumn: 'id', columnDefinitions: [{ field: 'id' }] },
} as const;

const lastMarketsGridProps: { current: unknown } = { current: null };

vi.mock('@wellsfargo-starui/grid', () => ({
  MarketsGrid: (props: unknown) => {
    lastMarketsGridProps.current = props;
    return <div data-testid="markets-grid-stub" />;
  },
  createMarketsGridContainerEventBus: () => ({ emit: vi.fn(), on: vi.fn(() => () => {}) }),
  MARKETS_GRID_EVENT_CATALOG: [],
  useMarketsGridEventBridge: vi.fn(),
}));

const { dataHubClientMock } = vi.hoisted(() => ({
  dataHubClientMock: { isProviderRunning: vi.fn().mockResolvedValue(false), waitForProviderRunning: vi.fn().mockResolvedValue(false) },
}));

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  DataHubProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DataServicesProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePlatformIdentityOrNull: () => null,
  useDataServices: () => ({ client: dataHubClientMock }),
  useDataProvider: () => ({ provider: null, status: 'loading' as ProviderStatus, error: undefined, start: vi.fn(), refresh: vi.fn(), restart: vi.fn() }),
  useSsrmDataProvider: () => ({ provider: null, status: 'loading' as ProviderStatus, error: undefined, start: vi.fn(), refresh: vi.fn(), restart: vi.fn() }),
  useDataProviderConfig: (id: string | null | undefined) => ({ cfg: null, loading: Boolean(id) }),
  useResolvedCfg: (cfg: unknown) => cfg,
  useDataProvidersList: () => ({ configs: [liveProviderRow] }),
  useAppDataStore: () => ({ store: { get: vi.fn(), set: vi.fn(), list: () => [], subscribe: vi.fn() } }),
}));

vi.mock('../container/markets-grid-container/LoadingOverlay.js', () => ({ MarketsGridLoadingOverlay: () => null }));
vi.mock('../container/markets-grid-container/ProviderEditorDialog.js', () => ({ ProviderEditorDialog: () => null }));

import { BlotterHost } from './BlotterHost.js';

const fakeConfigManager = { deleteConfig: vi.fn().mockResolvedValue(undefined) } as never;

function makeStorage() {
  const adapter: StorageAdapter = {
    loadGridLevelData: vi.fn(async () => null),
    saveGridLevelData: vi.fn(async () => {}),
  } as StorageAdapter;
  return vi.fn(() => adapter);
}

describe('BlotterHost — provider config loading gate', () => {
  beforeEach(() => {
    lastMarketsGridProps.current = null;
  });

  it('does not mount MarketsGrid while the active provider catalog row is loading', async () => {
    render(
      <BlotterHost
        componentName="Test"
        gridId="g1"
        defaultInstanceId="inst-1"
        defaultAppId="app-1"
        defaultUserId="u1"
        configManager={fakeConfigManager}
        storage={makeStorage() as never}
        defaultLiveProviderId={LIVE_PROVIDER_ID}
      />,
    );

    expect(await screen.findByText('Loading provider configuration…')).toBeTruthy();
    expect(screen.queryByTestId('markets-grid-stub')).toBeNull();
    expect(lastMarketsGridProps.current).toBeNull();
  });
});
