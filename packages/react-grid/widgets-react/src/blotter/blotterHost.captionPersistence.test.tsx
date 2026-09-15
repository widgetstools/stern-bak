/**
 * BlotterHost — caption persistence via StorageAdapter `gridLevelData`, and
 * the OpenFin "Save Tab As…" adoption. Moved from MarketsGridContainer; the
 * tests exercise the "no provider selected" render path, where caption +
 * onCaptionChange flow identically.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import type { StorageAdapter } from '@wellsfargo-starui/core';

const lastMarketsGridProps: { current: any } = { current: null };
vi.mock('@wellsfargo-starui/grid', () => ({
  MarketsGrid: (props: any) => {
    lastMarketsGridProps.current = props;
    return <div data-testid="markets-grid-stub" data-caption={props.caption ?? ''} />;
  },
  createMarketsGridContainerEventBus: () => ({ emit: vi.fn(), on: vi.fn(() => () => {}) }),
  MARKETS_GRID_EVENT_CATALOG: [],
  useMarketsGridEventBridge: vi.fn(),
}));

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  DataHubProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
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

import { BlotterHost } from './BlotterHost.js';

const fakeConfigManager = { deleteConfig: vi.fn().mockResolvedValue(undefined) } as never;

function makeAdapter(initial: unknown = null) {
  let current: unknown = initial;
  const adapter: StorageAdapter & { __getSaved: () => unknown } = {
    loadGridLevelData: vi.fn(async () => current),
    saveGridLevelData: vi.fn(async (_id: string, data: unknown) => { current = data; }),
    __getSaved: () => current,
  } as any;
  return adapter;
}

const baseProps = {
  componentName: 'MarketsGrid',
  gridId: 'g1',
  defaultInstanceId: 'inst-1',
  defaultAppId: 'app-1',
  defaultUserId: 'u1',
  configManager: fakeConfigManager,
} as const;

describe('BlotterHost — caption persistence', () => {
  it('hydrates the caption from gridLevelData and forwards it to MarketsGrid', async () => {
    const adapter = makeAdapter({ liveProviderId: null, historicalProviderId: null, mode: 'live', caption: 'My FX Blotter' });
    render(<BlotterHost {...baseProps} storage={vi.fn(() => adapter) as any} caption="initial-prop" />);
    await waitFor(() => { expect(lastMarketsGridProps.current?.caption).toBe('My FX Blotter'); });
  });

  it('falls back to the prop caption when no persisted value exists', async () => {
    const adapter = makeAdapter(null);
    render(<BlotterHost {...baseProps} storage={vi.fn(() => adapter) as any} caption="initial-prop" />);
    await waitFor(() => { expect(lastMarketsGridProps.current?.caption).toBe('initial-prop'); });
  });

  it('saves the caption to gridLevelData when onCaptionChange fires', async () => {
    const adapter = makeAdapter(null);
    render(<BlotterHost {...baseProps} storage={vi.fn(() => adapter) as any} caption="initial-prop" />);
    await waitFor(() => { expect(lastMarketsGridProps.current?.onCaptionChange).toBeTypeOf('function'); });
    React.act(() => { lastMarketsGridProps.current.onCaptionChange('Renamed'); });
    await waitFor(() => { expect(adapter.saveGridLevelData).toHaveBeenCalled(); });
    expect((adapter.__getSaved() as { caption?: string }).caption).toBe('Renamed');
  });

  it('chains a caller-supplied onCaptionChange', async () => {
    const adapter = makeAdapter(null);
    const callerOnCaptionChange = vi.fn();
    render(<BlotterHost {...baseProps} storage={vi.fn(() => adapter) as any} caption="initial-prop" onCaptionChange={callerOnCaptionChange} />);
    await waitFor(() => { expect(lastMarketsGridProps.current?.onCaptionChange).toBeTypeOf('function'); });
    React.act(() => { lastMarketsGridProps.current.onCaptionChange('Renamed Again'); });
    expect(callerOnCaptionChange).toHaveBeenCalledWith('Renamed Again');
  });

  describe('under OpenFin — an external tab rename is adopted', () => {
    afterEach(() => { delete (globalThis as any).fin; });

    it('keeps the persisted caption on first render but adopts a later tab rename (Save Tab As…)', async () => {
      // A minimal OpenFin view: `customData` carries the instance id and, once
      // the user renames the tab, `savedTitle`; `options-changed` is how the
      // rename reaches the view (the same event useViewTabTitle listens to).
      let customData: Record<string, unknown> = { instanceId: 'inst-1' };
      const listeners = new Set<(evt: unknown) => void>();
      (globalThis as any).fin = {
        me: {
          identity: { uuid: 'app', name: 'view-1' },
          getOptions: async () => ({ customData }),
          updateOptions: async () => undefined,
          on: (event: string, fn: (evt: unknown) => void) => { if (event === 'options-changed') listeners.add(fn); },
          removeListener: (_event: string, fn: (evt: unknown) => void) => { listeners.delete(fn); },
        },
      };
      const adapter = makeAdapter({ liveProviderId: null, historicalProviderId: null, mode: 'live', caption: 'Persisted Name' });
      const storage = vi.fn(() => adapter) as any;
      render(<BlotterHost {...baseProps} storage={storage} caption="MarketsGrid" />);
      // First render: the persisted caption is preserved — the initial tab
      // name (the componentName fallback) does not shadow it.
      await waitFor(() => { expect(lastMarketsGridProps.current?.caption).toBe('Persisted Name'); });

      // "Save Tab As…" writes savedTitle and the view reports options-changed —
      // the host adopts the new tab name into the persisted caption.
      customData = { ...customData, savedTitle: 'Renamed Via Tab' };
      React.act(() => { for (const fn of listeners) fn({ options: { customData } }); });
      await waitFor(() => { expect(lastMarketsGridProps.current?.caption).toBe('Renamed Via Tab'); });
      await waitFor(() => { expect((adapter.__getSaved() as { caption?: string }).caption).toBe('Renamed Via Tab'); });
    });
  });
});

/**
 * `gridId` is the profile-storage key, and a host that reads its id out of the
 * launch URL gets an empty one when the launcher did not stamp it — which is
 * what a "Configure Component" launch from Workspace Setup used to do. Keying
 * profiles to `''` let the grid mount while its layout dropdown came up blank,
 * next to a sibling with a hardcoded gridId that looked fine. Under the
 * registry model the view's instanceId IS the template id, so the resolved
 * identity is what the caller meant.
 */
describe('BlotterHost — gridId fallback', () => {
  it('keys storage on the resolved instanceId when the host passes no gridId', async () => {
    const storage = vi.fn(() => makeAdapter(null)) as never;
    render(<BlotterHost {...baseProps} gridId="" storage={storage} />);

    await waitFor(() => { expect(storage).toHaveBeenCalled(); });
    expect((storage as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])
      .toMatchObject({ gridId: 'inst-1', instanceId: 'inst-1' });
  });

  it('prefers an explicit gridId over the instanceId', async () => {
    const storage = vi.fn(() => makeAdapter(null)) as never;
    render(<BlotterHost {...baseProps} gridId="g1" storage={storage} />);

    await waitFor(() => { expect(storage).toHaveBeenCalled(); });
    // A host CAN legitimately scope several grids to one view identity.
    expect((storage as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0])
      .toMatchObject({ gridId: 'g1', instanceId: 'inst-1' });
  });
});
