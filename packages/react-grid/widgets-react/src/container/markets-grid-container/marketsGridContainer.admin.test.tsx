/**
 * MarketsGridContainer — admin actions, config browser, and event-binding host wiring.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StorageAdapter } from '@wellsfargo-starui/core';

const lastMarketsGridProps: { current: any } = { current: null };
const refreshMock = vi.fn().mockResolvedValue(undefined);
const restartMock = vi.fn().mockResolvedValue(undefined);
const refreshProviderMock = vi.fn().mockResolvedValue(undefined);

vi.mock('@wellsfargo-starui/grid', () => ({
  MarketsGrid: (props: any) => {
    lastMarketsGridProps.current = props;
    React.useEffect(() => {
      props.onReady?.({
        platform: { events: { emit: vi.fn(), on: vi.fn(() => () => {}) } },
        refreshView: refreshMock,
        saveAll: vi.fn().mockResolvedValue(undefined),
      });
    }, [props.onReady]);
    return <div data-testid="markets-grid-stub" />;
  },
  createMarketsGridContainerEventBus: () => ({
    emit: vi.fn(),
    on: vi.fn(() => () => {}),
  }),
  MARKETS_GRID_EVENT_CATALOG: [{ id: 'row:click', label: 'Row click' }],
  useMarketsGridEventBridge: vi.fn(),
}));

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  useDataServices: () => ({
    client: {
      isProviderRunning: vi.fn().mockResolvedValue(true),
      waitForProviderRunning: vi.fn().mockResolvedValue(true),
    },
  }),
  useDataProvider: () => ({
    provider: {
      id: 'dp-live',
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      restart: restartMock,
      getConfig: () => ({ providerType: 'mock', keyColumn: 'id', columnDefinitions: [{ field: 'id' }] }),
      getColumnDefs: () => [{ field: 'id' }],
      onRowsReceived: vi.fn(() => () => undefined),
      onSnapshotData: vi.fn(() => () => undefined),
      onTick: vi.fn(() => () => undefined),
      onError: vi.fn(() => () => undefined),
      onStatus: vi.fn(() => () => undefined),
    },
    status: 'ready',
    error: undefined,
    start: vi.fn(),
    refresh: refreshProviderMock,
    restart: restartMock,
  }),
  useAppDataStore: () => ({ store: { set: vi.fn(), get: vi.fn() } }),
  useDataProviderConfig: () => ({
    cfg: { providerType: 'mock', keyColumn: 'id', columnDefinitions: [{ field: 'id' }] },
    loading: false,
  }),
  useResolvedCfg: () => ({ providerType: 'mock', keyColumn: 'id', columnDefinitions: [{ field: 'id' }] }),
  useDataProvidersList: () => ({
    configs: [{ providerId: 'dp-live', name: 'Live', providerType: 'mock', config: { providerType: 'mock' } }],
    loading: false,
    refresh: vi.fn(),
  }),
}));

vi.mock('./LoadingOverlay.js', () => ({ MarketsGridLoadingOverlay: () => null }));
vi.mock('./ConfigBrowserDialog.js', () => ({
  ConfigBrowserDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="config-browser-dialog-open">browser</div> : null,
}));
vi.mock('./ProviderEditorDialog.js', () => ({
  ProviderEditorDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="provider-editor-dialog-open">editor</div> : null,
}));

import { MarketsGridContainer } from './MarketsGridContainer.js';

function makeAdapter() {
  let current: unknown = {
    liveProviderId: 'dp-live',
    historicalProviderId: null,
    mode: 'live',
  };
  return {
    loadGridLevelData: vi.fn(async () => current),
    saveGridLevelData: vi.fn(async (_id: string, data: unknown) => {
      current = data;
    }),
  } as unknown as StorageAdapter;
}

afterEach(() => {
  lastMarketsGridProps.current = null;
  refreshMock.mockClear();
  restartMock.mockClear();
});

describe('MarketsGridContainer — admin + event host wiring', () => {
  it('opens the in-browser config browser from admin actions', async () => {
    const user = userEvent.setup();
    render(
      <MarketsGridContainer
        gridId="g1"
        instanceId="inst-1"
        appId="app-1"
        userId="u1"
        storage={() => makeAdapter()}
        defaultLiveProviderId="dp-live"
      />,
    );
    await waitFor(() => expect(lastMarketsGridProps.current).not.toBeNull());
    const action = lastMarketsGridProps.current.adminActions.find((a: any) => /Config Browser/i.test(a.label));
    await user.click(action.onClick());
    expect(await screen.findByTestId('config-browser-dialog-open')).toBeInTheDocument();
  });

  it('opens the provider editor dialog from admin actions', async () => {
    const user = userEvent.setup();
    render(
      <MarketsGridContainer
        gridId="g1"
        instanceId="inst-1"
        appId="app-1"
        userId="u1"
        storage={() => makeAdapter()}
        defaultLiveProviderId="dp-live"
      />,
    );
    await waitFor(() => expect(lastMarketsGridProps.current).not.toBeNull());
    const action = lastMarketsGridProps.current.adminActions.find((a: any) => /Data Provider Editor/i.test(a.label));
    await user.click(action.onClick());
    expect(await screen.findByTestId('provider-editor-dialog-open')).toBeInTheDocument();
  });

  it('updates event bindings through the grid host api', async () => {
    render(
      <MarketsGridContainer
        gridId="g1"
        instanceId="inst-1"
        appId="app-1"
        userId="u1"
        storage={() => makeAdapter()}
        defaultLiveProviderId="dp-live"
        gridEventHandlers={{ handlerA: () => undefined }}
      />,
    );
    await waitFor(() => expect(lastMarketsGridProps.current?.gridEventBindingsHost?.available).toBe(true));
    act(() => {
      lastMarketsGridProps.current.gridEventBindingsHost.setEventHandler('row:click', 'handlerA');
      lastMarketsGridProps.current.gridEventBindingsHost.setBindings({ 'row:click': ['handlerA'] });
    });
    expect(lastMarketsGridProps.current.gridEventBindingsHost.bindings).toEqual({ 'row:click': ['handlerA'] });
  });

  it('merges caller admin actions with built-in infra actions', async () => {
    const customClick = vi.fn();
    render(
      <MarketsGridContainer
        gridId="g1"
        instanceId="inst-1"
        appId="app-1"
        userId="u1"
        storage={() => makeAdapter()}
        defaultLiveProviderId="dp-live"
        adminActions={[{ id: 'custom', label: 'Custom', onClick: customClick }]}
      />,
    );
    await waitFor(() => expect(lastMarketsGridProps.current).not.toBeNull());
    expect(lastMarketsGridProps.current.adminActions.some((a: any) => a.id === 'custom')).toBe(true);
    expect(lastMarketsGridProps.current.adminActions.some((a: any) => /Config Browser/i.test(a.label))).toBe(true);
    lastMarketsGridProps.current.adminActions.find((a: any) => a.id === 'custom').onClick();
    expect(customClick).toHaveBeenCalled();
  });

  it('refreshes the grid view through the provider host api', async () => {
    render(
      <MarketsGridContainer
        gridId="g1"
        instanceId="inst-1"
        appId="app-1"
        userId="u1"
        storage={() => makeAdapter()}
        defaultLiveProviderId="dp-live"
      />,
    );
    await waitFor(() => expect(lastMarketsGridProps.current?.providerGridHost).toBeTruthy());
    await act(async () => {
      await lastMarketsGridProps.current.providerGridHost.onRefreshView?.();
    });
    expect(refreshProviderMock).toHaveBeenCalled();
  });

  it('forwards OpenFin admin actions to host callbacks', async () => {
    (window as any).fin = { me: { identity: { name: 'view-1' } } };
    const onEditProvider = vi.fn();
    const onOpenConfigBrowser = vi.fn();
    render(
      <MarketsGridContainer
        gridId="g1"
        instanceId="inst-1"
        appId="app-1"
        userId="u1"
        storage={() => makeAdapter()}
        defaultLiveProviderId="dp-live"
        onEditProvider={onEditProvider}
        onOpenConfigBrowser={onOpenConfigBrowser}
      />,
    );
    await waitFor(() => expect(lastMarketsGridProps.current).not.toBeNull());
    const edit = lastMarketsGridProps.current.adminActions.find((a: any) => /Data Provider Editor/i.test(a.label));
    const browser = lastMarketsGridProps.current.adminActions.find((a: any) => /Config Browser/i.test(a.label));
    edit.onClick();
    browser.onClick();
    expect(onEditProvider).toHaveBeenCalled();
    expect(onOpenConfigBrowser).toHaveBeenCalled();
    delete (window as any).fin;
  });

  it('reloads from source through the provider host api', async () => {
    render(
      <MarketsGridContainer
        gridId="g1"
        instanceId="inst-1"
        appId="app-1"
        userId="u1"
        storage={() => makeAdapter()}
        defaultLiveProviderId="dp-live"
      />,
    );
    await waitFor(() => expect(lastMarketsGridProps.current?.providerGridHost).toBeTruthy());
    await act(async () => {
      await lastMarketsGridProps.current.providerGridHost.onReloadFromSource();
    });
    expect(restartMock).toHaveBeenCalled();
  });
});
