/**
 * MarketsGridContainer — the host's `onSavingChange` survives the container.
 *
 * `MarketsGridContainerProps extends Omit<MarketsGridProps, …>` and the render
 * spreads the rest onto `MarketsGrid`, so a host can pass `onSavingChange`.
 * The data-attached branch then set its own `onSavingChange` AFTER that spread
 * and silently swallowed the host's — the prop is optional, so nothing
 * complained and no consumer in this tree noticed. `SsrmMarketsGridContainer`
 * already chained it; this pins that both containers now do.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import type { StorageAdapter } from '@wellsfargo-starui/core';
import type { IDataProvider, Unsubscribe } from '@wellsfargo-starui/data';
import type { ProviderStatus } from '@wellsfargo-starui/data/runtime';

const PROVIDER_ID = 'dp-saving-test';

const providerConfig = {
  providerType: 'mock',
  keyColumn: 'id',
  columnDefinitions: [{ field: 'id' }, { field: 'price' }],
};

const providerRow = { configId: PROVIDER_ID, name: 'Saving Test', config: providerConfig };

function createMockProvider(): IDataProvider {
  return {
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
    onRowsReceived: vi.fn((): Unsubscribe => () => undefined),
    onSnapshotData: vi.fn((): Unsubscribe => () => undefined),
    onTick: vi.fn((): Unsubscribe => () => undefined),
    onError: vi.fn((): Unsubscribe => () => undefined),
    onStatus: vi.fn((): Unsubscribe => () => undefined),
  } as unknown as IDataProvider;
}

let latestProvider: IDataProvider | null = null;

const lastMarketsGridProps: { current: any } = { current: null };

vi.mock('@wellsfargo-starui/grid', () => ({
  MarketsGrid: (props: any) => {
    lastMarketsGridProps.current = props;
    return <div data-testid="markets-grid-stub" />;
  },
  createMarketsGridContainerEventBus: () => ({ emit: vi.fn(), on: vi.fn(() => () => {}) }),
  MARKETS_GRID_EVENT_CATALOG: [],
  useMarketsGridEventBridge: vi.fn(),
}));

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  useDataServices: () => ({
    client: {
      isProviderRunning: vi.fn().mockResolvedValue(false),
      waitForProviderRunning: vi.fn().mockResolvedValue(false),
    },
  }),
  useDataProvider: (id: string | null | undefined) => {
    if (id !== PROVIDER_ID) {
      latestProvider = null;
      return {
        provider: null,
        status: 'loading' as ProviderStatus,
        error: undefined,
        start: vi.fn(),
        refresh: vi.fn(),
        restart: vi.fn(),
      };
    }
    latestProvider ??= createMockProvider();
    return {
      provider: latestProvider,
      status: 'ready' as ProviderStatus,
      error: undefined,
      start: vi.fn(),
      refresh: vi.fn(),
      restart: vi.fn(),
    };
  },
  useDataProviderConfig: (id: string | null | undefined) => ({
    cfg: id === PROVIDER_ID ? providerRow : null,
    loading: false,
  }),
  useResolvedCfg: (cfg: unknown) => cfg,
  useDataProvidersList: () => ({ configs: [providerRow] }),
  useAppDataStore: () => ({ store: { get: vi.fn(), list: () => [], subscribe: vi.fn() } }),
}));

vi.mock('./LoadingOverlay.js', () => ({ MarketsGridLoadingOverlay: () => null }));
vi.mock('./ProviderEditorDialog.js', () => ({ ProviderEditorDialog: () => null }));

import { MarketsGridContainer } from './MarketsGridContainer.js';

function makeAdapter(): StorageAdapter {
  let current: unknown = {
    liveProviderId: PROVIDER_ID,
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

const baseProps = {
  gridId: 'g-saving',
  instanceId: 'inst-saving',
  appId: 'app-1',
  userId: 'u1',
} as const;

async function renderAttached(onSavingChange?: (saving: boolean) => void) {
  render(
    <MarketsGridContainer
      {...baseProps}
      storage={vi.fn(() => makeAdapter()) as any}
      onError={vi.fn()}
      {...(onSavingChange ? { onSavingChange } : {})}
    />,
  );
  // The data-attached branch is the one that used to drop the prop; the
  // no-provider branch spreads it untouched and was never affected.
  await waitFor(() => expect(lastMarketsGridProps.current?.rowIdField).toBe('id'));
}

describe('MarketsGridContainer — onSavingChange', () => {
  beforeEach(() => {
    latestProvider = null;
    lastMarketsGridProps.current = null;
  });

  it("forwards the grid's saving signal to the host that asked for it", async () => {
    const onSavingChange = vi.fn();
    await renderAttached(onSavingChange);

    act(() => lastMarketsGridProps.current.onSavingChange(true));
    expect(onSavingChange).toHaveBeenCalledWith(true);

    act(() => lastMarketsGridProps.current.onSavingChange(false));
    expect(onSavingChange).toHaveBeenLastCalledWith(false);
  });

  it("still drives the container's own Saving… overlay, which is why it chained rather than replaced", async () => {
    await renderAttached();

    // No host handler: the container's own state must still flip, so this
    // must not throw and must remain a function.
    expect(typeof lastMarketsGridProps.current.onSavingChange).toBe('function');
    act(() => lastMarketsGridProps.current.onSavingChange(true));
    act(() => lastMarketsGridProps.current.onSavingChange(false));
  });
});
