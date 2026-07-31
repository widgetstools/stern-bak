/**
 * MarketsGridContainer — provider edit opens an in-browser dialog
 * when not hosted in OpenFin; OpenFin delegates to `onEditProvider`.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { StorageAdapter } from '@wellsfargo-starui/engine';

vi.mock('./ProviderEditorDialog.js', () => ({
  ProviderEditorDialog: (props: any) => (
    props.open ? <div data-testid="provider-editor-dialog" data-provider-id={props.providerId ?? ''} /> : null
  ),
}));

vi.mock('./ConfigBrowserDialog.js', () => ({
  ConfigBrowserDialog: (props: any) => (
    props.open ? <div data-testid="config-browser-dialog" /> : null
  ),
}));

vi.mock('./openFinRuntime.js', () => ({
  isOpenFinRuntime: vi.fn(() => false),
}));

const lastMarketsGridProps: { current: any } = { current: null };
vi.mock('@wellsfargo-starui/grid', () => ({
  MarketsGrid: (props: any) => {
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

vi.mock('@wellsfargo-starui/host-data-react/runtime', () => ({
  useDataServices: () => ({
    client: {
      isProviderRunning: vi.fn().mockResolvedValue(false),
      waitForProviderRunning: vi.fn().mockResolvedValue(false),
    },
  }),
  useDataProvider: () => ({
    provider: null,
    status: 'loading',
    error: undefined,
    start: vi.fn(),
    refresh: vi.fn(),
    restart: vi.fn(),
  }),
  useAppDataStore: () => ({ store: { set: vi.fn() } }),
  useDataProviderConfig: () => ({ cfg: null, loading: false }),
  useResolvedCfg: () => null,
  useDataProvidersList: () => ({ configs: [] }),
}));

vi.mock('./LoadingOverlay.js', () => ({ MarketsGridLoadingOverlay: () => null }));

import { isOpenFinRuntime } from './openFinRuntime.js';
import { MarketsGridContainer, DATA_PROVIDER_EDITOR_ACTION_ID } from './MarketsGridContainer.js';
import { CONFIG_BROWSER_ACTION_ID } from '@wellsfargo-starui/config-browser';

afterEach(() => {
  cleanup();
});

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
  gridId: 'g1',
  instanceId: 'inst-1',
  appId: 'app-1',
  userId: 'u1',
} as const;

describe('MarketsGridContainer — provider editor dialog', () => {
  beforeEach(() => {
    lastMarketsGridProps.current = null;
    vi.mocked(isOpenFinRuntime).mockReturnValue(false);
  });

  it('wires providerGridHost.onEditProvider to open ProviderEditorDialog in browser', async () => {
    const storage = vi.fn(() => makeAdapter());
    const { getByTestId, queryByTestId } = render(
      <MarketsGridContainer {...baseProps} storage={storage as any} />,
    );

    await waitFor(() => expect(lastMarketsGridProps.current?.providerGridHost?.onEditProvider).toBeTypeOf('function'));
    expect(queryByTestId('provider-editor-dialog')).toBeNull();

    act(() => {
      lastMarketsGridProps.current.providerGridHost.onEditProvider('provider-abc');
    });

    await waitFor(() => {
      expect(getByTestId('provider-editor-dialog').getAttribute('data-provider-id')).toBe('provider-abc');
    });
  });

  it('delegates edit to onEditProvider when running in OpenFin', async () => {
    vi.mocked(isOpenFinRuntime).mockReturnValue(true);
    const onEditProvider = vi.fn();
    const storage = vi.fn(() => makeAdapter());

    const { queryByTestId } = render(
      <MarketsGridContainer
        {...baseProps}
        storage={storage as any}
        onEditProvider={onEditProvider}
      />,
    );

    await waitFor(() => expect(lastMarketsGridProps.current?.providerGridHost?.onEditProvider).toBeTypeOf('function'));

    act(() => {
      lastMarketsGridProps.current.providerGridHost.onEditProvider('provider-openfin');
    });

    expect(onEditProvider).toHaveBeenCalledWith('provider-openfin');
    expect(queryByTestId('provider-editor-dialog')).toBeNull();
  });

  it('injects data-provider editor and config browser into toolbar overflow adminActions', async () => {
    const storage = vi.fn(() => makeAdapter());
    render(<MarketsGridContainer {...baseProps} storage={storage as any} />);

    await waitFor(() => expect(lastMarketsGridProps.current?.adminActions).toBeDefined());

    const ids = lastMarketsGridProps.current.adminActions.map((a: { id: string }) => a.id);
    expect(ids).toContain(DATA_PROVIDER_EDITOR_ACTION_ID);
    expect(ids).toContain(CONFIG_BROWSER_ACTION_ID);
  });

  it('opens ConfigBrowserDialog from overflow admin action in browser', async () => {
    const storage = vi.fn(() => makeAdapter());
    const { getByTestId, queryByTestId } = render(
      <MarketsGridContainer {...baseProps} storage={storage as any} />,
    );

    await waitFor(() => expect(lastMarketsGridProps.current?.adminActions).toBeDefined());
    expect(queryByTestId('config-browser-dialog')).toBeNull();

    const configAction = lastMarketsGridProps.current.adminActions.find(
      (a: { id: string }) => a.id === CONFIG_BROWSER_ACTION_ID,
    );
    act(() => {
      void configAction.onClick();
    });

    await waitFor(() => {
      expect(getByTestId('config-browser-dialog')).toBeTruthy();
    });
  });

  it('delegates config browser to onOpenConfigBrowser when running in OpenFin', async () => {
    vi.mocked(isOpenFinRuntime).mockReturnValue(true);
    const onOpenConfigBrowser = vi.fn();
    const storage = vi.fn(() => makeAdapter());

    render(
      <MarketsGridContainer
        {...baseProps}
        storage={storage as any}
        onOpenConfigBrowser={onOpenConfigBrowser}
      />,
    );

    await waitFor(() => expect(lastMarketsGridProps.current?.adminActions).toBeDefined());

    const configAction = lastMarketsGridProps.current.adminActions.find(
      (a: { id: string }) => a.id === CONFIG_BROWSER_ACTION_ID,
    );
    act(() => {
      void configAction.onClick();
    });

    expect(onOpenConfigBrowser).toHaveBeenCalledTimes(1);
  });
});
