/**
 * BlotterHost — the hosted-view half: identity and storage gates, the
 * document title, the explicit storage factory, and the data-plane wrapper.
 * Moved in intent from the HostedMarketsGrid smoke / withStorage tests.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { StorageAdapter } from '@wellsfargo-starui/core';

const lastMarketsGridProps: { current: any } = { current: null };
const hubProviderRenders = { count: 0 };

vi.mock('@wellsfargo-starui/grid', () => ({
  MarketsGrid: (props: any) => {
    lastMarketsGridProps.current = props;
    return <div data-testid="markets-grid-stub" data-instance-id={props.instanceId} data-component-name={props.componentName} />;
  },
  createMarketsGridContainerEventBus: () => ({ emit: vi.fn(), on: vi.fn(() => () => {}) }),
  MARKETS_GRID_EVENT_CATALOG: [],
  useMarketsGridEventBridge: vi.fn(),
}));

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  DataHubProvider: ({ children }: { children: React.ReactNode }) => { hubProviderRenders.count += 1; return <>{children}</>; },
  DataServicesProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  usePlatformIdentityOrNull: () => null,
  useDataServices: () => ({ client: { isProviderRunning: vi.fn().mockResolvedValue(false), waitForProviderRunning: vi.fn().mockResolvedValue(false) } }),
  useDataProvider: () => ({ provider: null, status: 'loading', error: undefined, start: vi.fn(), refresh: vi.fn(), restart: vi.fn() }),
  useSsrmDataProvider: () => ({ provider: null, status: 'loading', error: undefined, start: vi.fn(), refresh: vi.fn(), restart: vi.fn() }),
  useAppDataStore: () => ({ store: { set: vi.fn(), get: vi.fn(), list: () => [], subscribe: vi.fn() } }),
  useDataProviderConfig: () => ({ cfg: null, loading: false }),
  useResolvedCfg: () => null,
  useDataProvidersList: () => ({ configs: [] }),
}));

vi.mock('../container/markets-grid-container/LoadingOverlay.js', () => ({ MarketsGridLoadingOverlay: () => null }));
// No host ConfigManager singleton in this realm: the identity hook's lazy
// resolution finds neither `peekConfigManager` nor `getConfigManager`.
vi.mock('@wellsfargo-starui/openfin/config', () => ({}));

import { BlotterHost } from './BlotterHost.js';

const fakeConfigManager = { deleteConfig: vi.fn().mockResolvedValue(undefined) } as never;

function makeAdapter() {
  return {
    loadGridLevelData: vi.fn(async () => null),
    saveGridLevelData: vi.fn(async () => {}),
  } as unknown as StorageAdapter;
}

afterEach(() => {
  cleanup();
  lastMarketsGridProps.current = null;
  hubProviderRenders.count = 0;
  document.title = '';
});

describe('BlotterHost — hosted identity and storage gates', () => {
  it('renders one MarketsGrid with the resolved identity once the ConfigManager is there', async () => {
    render(<BlotterHost componentName="Test" gridId="t1" defaultInstanceId="t1" configManager={fakeConfigManager} storage={() => makeAdapter()} />);
    const stub = await waitFor(() => screen.getByTestId('markets-grid-stub'));
    expect(stub.getAttribute('data-instance-id')).toBe('t1');
    expect(stub.getAttribute('data-component-name')).toBe('Test');
    expect(screen.getAllByTestId('markets-grid-stub')).toHaveLength(1);
  });

  it('shows the connecting note and no grid while persistence is on but the storage factory is not built yet', async () => {
    // No ConfigManager override and no host singleton in this realm: the
    // ConfigService-backed factory never materialises, so the host waits.
    render(<BlotterHost componentName="Test" gridId="t2" defaultInstanceId="t2" withStorage />);
    expect(await screen.findByText('Connecting to ConfigService…')).toBeInTheDocument();
    expect(screen.queryByTestId('markets-grid-stub')).toBeNull();
  });

  it('an explicit storage factory wins and is handed to MarketsGrid', async () => {
    const adapter = makeAdapter();
    const storage = vi.fn(() => adapter);
    render(<BlotterHost componentName="Test" gridId="t3" defaultInstanceId="t3" configManager={fakeConfigManager} storage={storage} withStorage />);
    await waitFor(() => screen.getByTestId('markets-grid-stub'));
    expect(storage).toHaveBeenCalledWith(expect.objectContaining({ instanceId: 't3', gridId: 't3' }));
    expect(lastMarketsGridProps.current?.storage).toBe(storage);
  });

  it('sets and restores document.title', async () => {
    document.title = 'Original';
    const { unmount } = render(<BlotterHost componentName="Test" gridId="t4" defaultInstanceId="t4" documentTitle="Hosted · Test" configManager={fakeConfigManager} storage={() => makeAdapter()} />);
    await waitFor(() => screen.getByTestId('markets-grid-stub'));
    expect(document.title).toBe('Hosted · Test');
    unmount();
    expect(document.title).toBe('Original');
  });

  it('mounts the data hub provider around the body when a platform bundle is given', async () => {
    render(<BlotterHost componentName="Test" gridId="t5" defaultInstanceId="t5" configManager={fakeConfigManager} storage={() => makeAdapter()} platform={{} as never} />);
    await waitFor(() => screen.getByTestId('markets-grid-stub'));
    expect(hubProviderRenders.count).toBeGreaterThan(0);
  });
});
