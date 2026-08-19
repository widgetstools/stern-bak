/**
 * MarketsGridContainer — defer AG Grid mount while the worker catalog
 * row for the active provider is still loading.
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

vi.mock('@wellsfargo-starui/grid/core', () => ({
  MarketsGrid: (props: unknown) => {
    lastMarketsGridProps.current = props;
    return <div data-testid="markets-grid-stub" />;
  },
  createMarketsGridContainerEventBus: () => ({
    emit: vi.fn(),
    on: vi.fn(() => () => {}),
  }),
  MARKETS_GRID_EVENT_CATALOG: [],
  useMarketsGridEventBridge: vi.fn(),
}));

const { dataHubClientMock } = vi.hoisted(() => {
  const isProviderRunning = vi.fn().mockResolvedValue(false);
  const waitForProviderRunning = vi.fn().mockResolvedValue(false);
  return { dataHubClientMock: { isProviderRunning, waitForProviderRunning } };
});

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  useDataServices: () => ({ client: dataHubClientMock }),
  useDataProvider: () => ({
    provider: null,
    status: 'loading' as ProviderStatus,
    error: undefined,
    start: vi.fn(),
    refresh: vi.fn(),
    restart: vi.fn(),
  }),
  useDataProviderConfig: (id: string | null | undefined) => ({
    cfg: null,
    loading: Boolean(id),
  }),
  useResolvedCfg: (cfg: unknown) => cfg,
  useDataProvidersList: () => ({ configs: [liveProviderRow] }),
  useAppDataStore: () => ({
    store: {
      get: vi.fn(),
      set: vi.fn(),
      list: () => [],
      subscribe: vi.fn(),
    },
  }),
}));

vi.mock('./LoadingOverlay.js', () => ({ MarketsGridLoadingOverlay: () => null }));
vi.mock('./ProviderEditorDialog.js', () => ({ ProviderEditorDialog: () => null }));

import { MarketsGridContainer } from './MarketsGridContainer.js';

function makeStorage() {
  const adapter: StorageAdapter = {
    loadGridLevelData: vi.fn(async () => null),
    saveGridLevelData: vi.fn(async () => {}),
  } as StorageAdapter;
  return vi.fn(() => adapter);
}

describe('MarketsGridContainer — provider config loading gate', () => {
  beforeEach(() => {
    lastMarketsGridProps.current = null;
  });

  it('does not mount MarketsGrid while the active provider catalog row is loading', async () => {
    render(
      <MarketsGridContainer
        gridId="g1"
        instanceId="inst-1"
        appId="app-1"
        userId="u1"
        storage={makeStorage() as never}
        defaultLiveProviderId={LIVE_PROVIDER_ID}
      />,
    );

    expect(await screen.findByText('Loading provider configuration…')).toBeTruthy();
    expect(screen.queryByTestId('markets-grid-stub')).toBeNull();
    expect(lastMarketsGridProps.current).toBeNull();
  });
});
