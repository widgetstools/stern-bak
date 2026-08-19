/**
 * Host-shell prop forwarding. star-demo's blotter needs gridId (keys stored
 * grid state), defaultColDef, onReady (colour-link gridApi capture),
 * onRowIdFieldChange / onProviderReady (hosted link wiring), and
 * onEditProvider / onOpenConfigBrowser (popouts) — all of which the
 * container previously dropped or hardcoded.
 *
 * Since roadmap Phase 7 the container `extends Omit<MarketsGridProps, …>`
 * and SPREADS the rest onto the grid, so the interesting assertions are now
 * (a) that an arbitrary MarketsGridProps member arrives, and (b) that the
 * seven members the render used to hardcode behave as decided: `ssrm` /
 * `rowData` / `columnDefs` / `rowIdField` are the container's, `caption`
 * persists, `dataStaleMessage` is the container's, and host `style` MERGES
 * over the fill style rather than replacing it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const captured = vi.hoisted(() => ({ props: {} as Record<string, unknown> }));
const runtime = vi.hoisted(() => ({ openFin: false }));

const fakeProvider = vi.hoisted(() => {
  const statusHandlers: Array<(s: string, err?: string) => void> = [];
  return {
    getConfig: () => ({ keyColumn: 'positionId' }),
    getConfigOrNull: () => ({ keyColumn: 'positionId' }),
    getColumnDefs: () => [{ field: 'positionId' }],
    getSetFilterValues: vi.fn(async () => []),
    // Raw provider status stream — what the container's load / stale
    // tracking subscribes to (NOT the wiring hook's display-text onStatus).
    // Carries the second `error` argument the real stream carries.
    onStatus: (h: (s: string, err?: string) => void) => {
      statusHandlers.push(h);
      return () => {
        const i = statusHandlers.indexOf(h);
        if (i >= 0) statusHandlers.splice(i, 1);
      };
    },
    emitStatus: (s: string, err?: string) =>
      [...statusHandlers].forEach((h) => h(s, err)),
  };
});

vi.mock('@wellsfargo-starui/grid/core', async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  return {
    ...mod,
    MarketsGrid: (props: Record<string, unknown>) => {
      captured.props = props;
      return React.createElement('div', { 'data-testid': 'markets-grid' });
    },
  };
});

const providerHook = vi.hoisted(() => ({ ids: [] as Array<string | null> }));

vi.mock('@wellsfargo-starui/openfin/host', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  isOpenFin: () => runtime.openFin,
}));

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  useDataServices: () => ({
    client: {
      isProviderRunning: async () => true,
      waitForProviderRunning: async () => true,
    },
  }),
  useSsrmDataProvider: (id: string | null) => {
    providerHook.ids.push(id);
    return { provider: id ? fakeProvider : null, error: null };
  },
  useAppDataStore: () => ({
    store: { get: vi.fn(), set: vi.fn(), list: () => [], subscribe: () => () => {} },
  }),
  // `providerId` is the real key on `DataProviderConfig` — the DATA PROVIDER
  // card reads `p.providerId`, and so does the container's overlay copy. This
  // fixture used a bare `id`, which no production code looks at.
  useDataProvidersList: () => ({
    configs: [
      { providerId: 'p1', name: 'P One' },
      { providerId: 'p2', name: 'P Two' },
      { providerId: 'hist-1', name: 'Historical One' },
    ],
    loading: false,
    refresh: () => {},
  }),
}));

const wiring = vi.hoisted(() => ({
  onStatus: null as ((s: string) => void) | null,
  params: [] as unknown[],
  // The real hook reports `ready` only once `start()` resolves. Tests that
  // exercise the loading overlay flip this to false so the overlay is driven
  // by the provider's status stream, as it is in production.
  ready: true,
}));

vi.mock('./useSsrmProviderDataWiring.js', () => ({
  useSsrmProviderDataWiring: (params: { onStatus?: (s: string) => void }) => {
    wiring.onStatus = params.onStatus ?? null;
    wiring.params.push(params);
    return { ready: wiring.ready };
  },
}));

vi.mock('../markets-grid-container/ProviderEditorDialog.js', () => ({
  ProviderEditorDialog: ({ open }: { open: boolean }) =>
    open ? React.createElement('div', { 'data-testid': 'inline-editor' }) : null,
}));

vi.mock('../markets-grid-container/ConfigBrowserDialog.js', () => ({
  ConfigBrowserDialog: ({ open }: { open: boolean }) =>
    open ? React.createElement('div', { 'data-testid': 'inline-config-browser' }) : null,
}));

import { SsrmMarketsGridContainer } from './SsrmMarketsGridContainer.js';

beforeEach(() => {
  captured.props = {};
  wiring.params.length = 0;
  providerHook.ids.length = 0;
  runtime.openFin = false;
  wiring.ready = true;
});

describe('SsrmMarketsGridContainer prop forwarding', () => {
  // `historicalDateAppDataRef` is a MarketsGridContainer prop, not a
  // MarketsGridProps member, so it is not part of this container's surface;
  // SSRM's historical-date subsystem is roadmap Phase 8.
  it('forwards gridId and defaultColDef to MarketsGrid', async () => {
    render(
      <SsrmMarketsGridContainer
        providerId="p1"
        gridId="star-demo-blotter"
        defaultColDef={{ floatingFilter: true }}
      />,
    );
    await waitFor(() => expect(captured.props.gridId).toBe('star-demo-blotter'));
    expect(captured.props.defaultColDef).toMatchObject({ floatingFilter: true });
  });

  it('defaults gridId to providerId when omitted', async () => {
    render(<SsrmMarketsGridContainer providerId="p1" />);
    await waitFor(() => expect(captured.props.gridId).toBe('p1'));
  });

  it('chains onReady to the caller (grid api captured for Refresh view first)', async () => {
    const onReady = vi.fn();
    render(<SsrmMarketsGridContainer providerId="p1" onReady={onReady} />);
    await waitFor(() => expect(captured.props.onReady).toBeDefined());
    const handle = { gridApi: { refreshServerSide: vi.fn() } };
    act(() => (captured.props.onReady as (h: unknown) => void)(handle));
    expect(onReady).toHaveBeenCalledWith(handle);
  });

  it('reports the resolved keyColumn through onRowIdFieldChange', async () => {
    const onRowIdFieldChange = vi.fn();
    render(
      <SsrmMarketsGridContainer providerId="p1" onRowIdFieldChange={onRowIdFieldChange} />,
    );
    await waitFor(() => expect(onRowIdFieldChange).toHaveBeenCalledWith('positionId'));
  });

  it('reports the live provider through onProviderReady', async () => {
    const onProviderReady = vi.fn();
    render(
      <SsrmMarketsGridContainer providerId="p1" onProviderReady={onProviderReady} />,
    );
    await waitFor(() => expect(onProviderReady).toHaveBeenCalledWith(fakeProvider));
  });

  // CSRM routes on the RUNTIME, not on callback presence — a browser host
  // that supplies `onEditProvider` for its OpenFin popout still gets the
  // inline dialog. Before Phase 7 the SSRM container routed on presence, so
  // the inline editor and Config Browser were unreachable outside OpenFin.
  it('routes the Data Provider Editor admin action to onEditProvider under OpenFin', async () => {
    runtime.openFin = true;
    const onEditProvider = vi.fn();
    render(
      <SsrmMarketsGridContainer providerId="p1" onEditProvider={onEditProvider} />,
    );
    await waitFor(() => expect(captured.props.adminActions).toBeDefined());
    const actions = captured.props.adminActions as Array<{
      id: string;
      onClick: () => void;
    }>;
    const editor = actions.find((a) => a.id === 'data-provider-editor');
    expect(editor).toBeDefined();
    editor!.onClick();
    expect(onEditProvider).toHaveBeenCalledWith('p1');
    expect(screen.queryByTestId('inline-editor')).toBeNull();
  });

  it('opens the inline dialog from the admin action in a browser runtime, callback or not', async () => {
    const onEditProvider = vi.fn();
    render(<SsrmMarketsGridContainer providerId="p1" onEditProvider={onEditProvider} />);
    await waitFor(() => expect(captured.props.adminActions).toBeDefined());
    const actions = captured.props.adminActions as Array<{
      id: string;
      onClick: () => void;
    }>;
    act(() => {
      actions.find((a) => a.id === 'data-provider-editor')!.onClick();
    });
    expect(await screen.findByTestId('inline-editor')).toBeTruthy();
    expect(onEditProvider).not.toHaveBeenCalled();
  });

  it('opens Config Browser inline in a browser runtime and routes it out under OpenFin', async () => {
    const onOpenConfigBrowser = vi.fn();
    const { unmount } = render(
      <SsrmMarketsGridContainer providerId="p1" onOpenConfigBrowser={onOpenConfigBrowser} />,
    );
    await waitFor(() => expect(captured.props.adminActions).toBeDefined());
    const browse = () =>
      (captured.props.adminActions as Array<{ id: string; onClick: () => void }>)
        .find((a) => a.id === 'config-browser')!;
    act(() => browse().onClick());
    expect(await screen.findByTestId('inline-config-browser')).toBeTruthy();
    expect(onOpenConfigBrowser).not.toHaveBeenCalled();
    unmount();

    runtime.openFin = true;
    render(
      <SsrmMarketsGridContainer providerId="p1" onOpenConfigBrowser={onOpenConfigBrowser} />,
    );
    await waitFor(() => expect(captured.props.adminActions).toBeDefined());
    act(() => browse().onClick());
    expect(onOpenConfigBrowser).toHaveBeenCalledTimes(1);
  });

  it('prepends CSRM\'s refresh pair: Refresh view (cache) and Reload from source (restart)', async () => {
    const restart = vi.fn(async () => {});
    (fakeProvider as Record<string, unknown>).restart = restart;
    const refreshServerSide = vi.fn();
    render(<SsrmMarketsGridContainer providerId="p1" />);
    await waitFor(() => expect(captured.props.adminActions).toBeDefined());
    const actions = captured.props.adminActions as Array<{
      id: string;
      onClick: () => void;
    }>;
    // Same ids and order as MarketsGridContainer's refresh/reload pair.
    expect(actions.map((a) => a.id).slice(0, 2)).toEqual([
      'refresh-view',
      'reload-from-source',
    ]);

    // Refresh view: purge blocks against the worker cache — no upstream I/O.
    act(() => {
      (captured.props.onReady as (h: unknown) => void)?.({
        gridApi: { refreshServerSide },
      });
    });
    act(() => actions[0].onClick());
    expect(refreshServerSide).toHaveBeenCalledWith({ purge: true });
    expect(restart).not.toHaveBeenCalled();

    // Reload from source: restart the provider; the ready transition then
    // auto-purges every subscribed grid via bindSsrmTicks.
    act(() => actions[1].onClick());
    expect(restart).toHaveBeenCalledWith(
      expect.objectContaining({ __refresh: expect.any(Number) }),
    );
  });

  it('drives the CSRM stale-data banner: error after ready sets dataStale, recovery clears it', async () => {
    render(<SsrmMarketsGridContainer providerId="p1" />);
    await waitFor(() => expect(captured.props.dataStale).toBe(false));

    act(() => {
      fakeProvider.emitStatus('ready');
      fakeProvider.emitStatus('error', 'socket closed');
    });
    await waitFor(() => expect(captured.props.dataStale).toBe(true));
    // Once the feed HAS delivered, staleness is the honest word for it.
    expect(captured.props.dataStaleMessage).toMatch(/Live SSRM feed disconnected/);
    expect(captured.props.dataStaleMessage).toMatch(/socket closed/);

    act(() => {
      fakeProvider.emitStatus('loading');
      fakeProvider.emitStatus('ready');
    });
    await waitFor(() => expect(captured.props.dataStale).toBe(false));
    expect(captured.props.dataStaleMessage).toBeUndefined();
  });

  // An error BEFORE the first ready used to be suppressed entirely, on a
  // "cold-connect retries stay silent" reading that also left a provider
  // which never connects showing an empty grid and no explanation (T3-5).
  // It now reports, with copy that does not claim data went stale — there
  // was never any data — and points at the panel that can repair it.
  it('reports a never-connected provider with repair copy, not a staleness claim', async () => {
    render(<SsrmMarketsGridContainer providerId="p1" />);
    await waitFor(() => expect(captured.props.dataStale).toBe(false));
    act(() => {
      fakeProvider.emitStatus('error', 'broker unreachable');
    });
    await waitFor(() => expect(captured.props.dataStale).toBe(true));
    expect(captured.props.dataStaleMessage).toMatch(/Cannot load data from this provider/);
    expect(captured.props.dataStaleMessage).toMatch(/broker unreachable/);
    expect(captured.props.dataStaleMessage).toMatch(/Custom Settings/);
    expect(captured.props.dataStaleMessage).not.toMatch(/stale/i);
  });

  it('keeps onStatus a stable reference across renders (unstable identity restarts the provider)', async () => {
    const { rerender } = render(<SsrmMarketsGridContainer providerId="p1" />);
    rerender(<SsrmMarketsGridContainer providerId="p1" />);
    await waitFor(() => expect(wiring.params.length).toBeGreaterThanOrEqual(2));
    const first = wiring.params[0] as { onStatus?: unknown };
    const last = wiring.params[wiring.params.length - 1] as { onStatus?: unknown };
    expect(first.onStatus).toBe(last.onStatus);
  });

  // Both data-infra entries are unconditional now, exactly as in CSRM: the
  // Config Browser action used to appear only when a host wired
  // `onOpenConfigBrowser`, which made it OpenFin-only in practice.
  it('carries CSRM\'s exact data-infra menu pair with no callbacks wired', async () => {
    render(<SsrmMarketsGridContainer providerId="p1" />);
    await waitFor(() => expect(captured.props.adminActions).toBeDefined());
    const actions = captured.props.adminActions as Array<{ id: string; label: string }>;
    expect(actions.map((a) => [a.id, a.label])).toEqual([
      ['refresh-view', 'Refresh view'],
      ['reload-from-source', 'Reload from source'],
      ['data-provider-editor', 'Data Provider Editor'],
      ['config-browser', 'Config Browser'],
    ]);
  });

  // mergeAdminActions: host entries land last and win on id collision, so an
  // app can replace a data-infra launcher without ending up with two.
  it('merges host adminActions after the data-infra pair and dedupes by id', async () => {
    const hostEditor = vi.fn();
    render(
      <SsrmMarketsGridContainer
        providerId="p1"
        adminActions={[
          { id: 'data-provider-editor', label: 'My Editor', onClick: hostEditor },
          { id: 'audit-log', label: 'Audit Log', onClick: vi.fn() },
        ]}
      />,
    );
    await waitFor(() => expect(captured.props.adminActions).toBeDefined());
    const actions = captured.props.adminActions as Array<{ id: string; label: string }>;
    expect(actions.map((a) => a.id)).toEqual([
      'refresh-view',
      'reload-from-source',
      'config-browser',
      'data-provider-editor',
      'audit-log',
    ]);
    expect(actions.find((a) => a.id === 'data-provider-editor')!.label).toBe('My Editor');
  });

  it('keeps onError a stable reference across renders', async () => {
    const { rerender } = render(
      <SsrmMarketsGridContainer providerId="p1" onError={() => {}} />,
    );
    rerender(<SsrmMarketsGridContainer providerId="p1" onError={() => {}} />);
    await waitFor(() => expect(wiring.params.length).toBeGreaterThanOrEqual(2));
    const first = wiring.params[0] as { onError?: unknown };
    const last = wiring.params[wiring.params.length - 1] as { onError?: unknown };
    expect(first.onError).toBeDefined();
    expect(first.onError).toBe(last.onError);
  });

  it('reports a failed reload through onError', async () => {
    const onError = vi.fn();
    const boom = new Error('restart refused');
    (fakeProvider as Record<string, unknown>).restart = vi.fn(async () => { throw boom; });
    render(<SsrmMarketsGridContainer providerId="p1" onError={onError} />);
    await waitFor(() => expect(captured.props.adminActions).toBeDefined());
    const actions = captured.props.adminActions as Array<{ id: string; onClick: () => void }>;
    await act(async () => {
      actions.find((a) => a.id === 'reload-from-source')!.onClick();
    });
    await waitFor(() => expect(onError).toHaveBeenCalledWith(boom));
  });
});

/**
 * The rest spread (roadmap Phase 7 / T3-2, T3-3). Before this, the render
 * listed 26 props by hand and dropped 29 members of `MarketsGridProps` —
 * which is also why `StarGrid`'s `advanced` escape hatch was inert for an
 * SSRM grid: StarGrid spreads `advanced` onto the container, and the
 * container spread nothing onward.
 */
describe('SsrmMarketsGridContainer host surface', () => {
  it('forwards arbitrary MarketsGridProps members the old list dropped', async () => {
    const onGridReady = vi.fn();
    const modules = [{ id: 'general-settings' }] as never;
    const agGridModules = [{ moduleName: 'ClientSideRowModelModule' }] as never;
    render(
      <SsrmMarketsGridContainer
        providerId="p1"
        modules={modules}
        agGridModules={agGridModules}
        sideBar
        statusBar={{ statusPanels: [{ statusPanel: 'agTotalRowCountComponent' }] }}
        rowHeight={44}
        headerHeight={28}
        animateRows={false}
        componentName="FX Blotter"
        toolbarActionsLayout="inline"
        showVisualExcelExport={false}
        sizeColumnsToFitOnReady
        includeAllStreamSafeFilters={false}
        autoSaveDebounceMs={900}
        className="host-class"
        tabsHidden
        onGridReady={onGridReady}
      />,
    );
    await waitFor(() => expect(captured.props.gridId).toBe('p1'));
    expect(captured.props.modules).toBe(modules);
    expect(captured.props.agGridModules).toBe(agGridModules);
    expect(captured.props.sideBar).toBe(true);
    expect(captured.props.statusBar).toMatchObject({
      statusPanels: [{ statusPanel: 'agTotalRowCountComponent' }],
    });
    expect(captured.props.rowHeight).toBe(44);
    expect(captured.props.headerHeight).toBe(28);
    expect(captured.props.animateRows).toBe(false);
    expect(captured.props.componentName).toBe('FX Blotter');
    expect(captured.props.toolbarActionsLayout).toBe('inline');
    expect(captured.props.showVisualExcelExport).toBe(false);
    expect(captured.props.sizeColumnsToFitOnReady).toBe(true);
    expect(captured.props.includeAllStreamSafeFilters).toBe(false);
    expect(captured.props.autoSaveDebounceMs).toBe(900);
    expect(captured.props.className).toBe('host-class');
    expect(captured.props.tabsHidden).toBe(true);
    expect(captured.props.onGridReady).toBe(onGridReady);
  });

  it('keeps the three toolbars the container defaults ON, and lets a host turn them off', async () => {
    const { unmount } = render(<SsrmMarketsGridContainer providerId="p1" />);
    await waitFor(() => expect(captured.props.gridId).toBe('p1'));
    expect(captured.props.showFiltersToolbar).toBe(true);
    expect(captured.props.showFormattingToolbar).toBe(true);
    expect(captured.props.showEditingToolbar).toBe(true);
    unmount();

    render(
      <SsrmMarketsGridContainer
        providerId="p1"
        showFiltersToolbar={false}
        showFormattingToolbar={false}
        showEditingToolbar={false}
      />,
    );
    await waitFor(() => expect(captured.props.showFiltersToolbar).toBe(false));
    expect(captured.props.showFormattingToolbar).toBe(false);
    expect(captured.props.showEditingToolbar).toBe(false);
  });

  // The container's fill style is what gives the AG Grid viewport a real
  // height (apps/e2e/star-demo-ssrm-smoke.spec.ts asserts > 200px). A rest
  // spread that let a host `style` REPLACE it would re-open that collapse,
  // so it merges — same precedence MarketsGrid's own root style uses.
  it('merges host style over the fill style instead of replacing it', async () => {
    const { unmount } = render(<SsrmMarketsGridContainer providerId="p1" />);
    await waitFor(() => expect(captured.props.style).toBeDefined());
    expect(captured.props.style).toEqual({ height: '100%', width: '100%' });
    unmount();

    render(<SsrmMarketsGridContainer providerId="p1" style={{ padding: 8 }} />);
    await waitFor(() => expect(captured.props.style).toBeDefined());
    expect(captured.props.style).toEqual({ height: '100%', width: '100%', padding: 8 });
  });

  it('owns ssrm / rowData / columnDefs / rowIdField and the stale message', async () => {
    render(<SsrmMarketsGridContainer providerId="p1" />);
    await waitFor(() => expect(captured.props.ssrm).toBeDefined());
    expect(captured.props.ssrm).toMatchObject({ provider: fakeProvider, keyColumn: 'positionId' });
    expect(captured.props.rowData).toEqual([]);
    expect(captured.props.rowIdField).toBe('positionId');
    expect(captured.props.columnDefs).toBeDefined();
    // Nothing is wrong yet, so there is no banner message to carry.
    expect(captured.props.dataStale).toBe(false);
    expect(captured.props.dataStaleMessage).toBeUndefined();
  });

  it('keeps the ssrm object referentially stable across unrelated re-renders', async () => {
    const { rerender } = render(<SsrmMarketsGridContainer providerId="p1" />);
    await waitFor(() => expect(captured.props.ssrm).toBeDefined());
    const first = captured.props.ssrm;
    rerender(<SsrmMarketsGridContainer providerId="p1" />);
    expect(captured.props.ssrm).toBe(first);
  });

  it('supplies appData so cell-editor valuesSource bindings resolve', async () => {
    render(<SsrmMarketsGridContainer providerId="p1" />);
    await waitFor(() => expect(captured.props.appData).toBeDefined());
    const appData = captured.props.appData as { listProviders(): string[] };
    expect(typeof appData.listProviders).toBe('function');
  });

  it('supplies a gridEventBindingsHost, available only with a handler registry', async () => {
    const { unmount } = render(<SsrmMarketsGridContainer providerId="p1" />);
    await waitFor(() => expect(captured.props.gridEventBindingsHost).toBeDefined());
    expect((captured.props.gridEventBindingsHost as { available: boolean }).available).toBe(false);
    unmount();

    render(
      <SsrmMarketsGridContainer
        providerId="p1"
        gridEventHandlers={{ ping: () => {} }}
        handlerMeta={{ ping: { label: 'Ping' } }}
      />,
    );
    await waitFor(() => expect(captured.props.gridEventBindingsHost).toBeDefined());
    const host = captured.props.gridEventBindingsHost as {
      available: boolean;
      handlerIds: string[];
      handlerMeta?: Record<string, { label: string }>;
      setEventHandler(eventId: string, handlerId: string | null): void;
      bindings: Record<string, string[]>;
    };
    expect(host.available).toBe(true);
    expect(host.handlerIds).toEqual(['ping']);
    expect(host.handlerMeta).toMatchObject({ ping: { label: 'Ping' } });
    act(() => host.setEventHandler('grid:cellClicked', 'ping'));
    await waitFor(() => {
      const next = captured.props.gridEventBindingsHost as { bindings: Record<string, string[]> };
      expect(next.bindings).toEqual({ 'grid:cellClicked': ['ping'] });
    });
  });

  // T3-9, end to end: container bus → useMarketsGridEventBridge → the app's
  // handler registry. The SSRM container had no bus, no bridge and no
  // handler registry, so none of the four `provider:*` / `toolbar:*` catalog
  // events could ever reach an app handler on a server-side grid.
  it('delivers provider:status / provider:switched to a bound app handler', async () => {
    const onStatusEvent = vi.fn();
    const onSwitched = vi.fn();
    render(
      <SsrmMarketsGridContainer
        providerId="p1"
        gridEventHandlers={{ status: onStatusEvent, switched: onSwitched }}
      />,
    );
    await waitFor(() => expect(captured.props.onReady).toBeDefined());
    act(() => {
      (captured.props.onReady as (h: unknown) => void)({
        gridApi: { refreshServerSide: vi.fn() },
        platform: {
          events: { on: () => () => {} },
          api: { on: () => () => {} },
        },
      });
    });
    const host = () => captured.props.gridEventBindingsHost as {
      setBindings(next: Record<string, string[]>): void;
    };
    await waitFor(() => expect(captured.props.gridEventBindingsHost).toBeDefined());
    act(() => host().setBindings({
      'provider:status': ['status'],
      'provider:switched': ['switched'],
    }));

    await act(async () => { fakeProvider.emitStatus('ready'); });
    await waitFor(() => expect(onStatusEvent).toHaveBeenCalled());
    expect(onStatusEvent.mock.calls[0][0]).toMatchObject({
      status: 'ready',
      providerId: 'p1',
      mode: 'live',
    });

    const providerHost = captured.props.providerGridHost as {
      onLiveChange(id: string | null): void;
    };
    await act(async () => { providerHost.onLiveChange('p2'); });
    await waitFor(() => expect(onSwitched).toHaveBeenCalledWith(
      expect.objectContaining({ liveProviderId: 'p2', mode: 'live' }),
      expect.anything(),
    ));
  });

  // T3-8: the toolbar renders an editable caption unconditionally, so a
  // static caption with no change handler let the user edit a label that
  // died on remount.
  //
  // (T3-4 / T3-5 live in the lifecycle describe below.)
  it('persists a caption edit and chains the host handler', async () => {
    const onCaptionChange = vi.fn();
    render(
      <SsrmMarketsGridContainer
        providerId="p1"
        caption="FX Blotter"
        onCaptionChange={onCaptionChange}
      />,
    );
    await waitFor(() => expect(captured.props.caption).toBe('FX Blotter'));
    act(() => (captured.props.onCaptionChange as (n: string) => void)('Renamed'));
    await waitFor(() => expect(captured.props.caption).toBe('Renamed'));
    expect(onCaptionChange).toHaveBeenCalledWith('Renamed');
  });
});

describe('SsrmMarketsGridContainer provider-grid-host (customizer Custom Settings)', () => {
  type HostApi = {
    available: boolean;
    liveProviders: ReadonlyArray<{ providerId?: string }>;
    historicalProviders: ReadonlyArray<{ providerId?: string }>;
    liveProviderId: string | null;
    historicalProviderId: string | null;
    mode: string;
    asOfDate: string | null;
    onLiveChange(id: string | null): void;
    onHistoricalChange(id: string | null): void;
    onModeChange(mode: 'live' | 'historical'): void;
    onAsOfDateChange(date: string | null): void;
    onReloadFromSource(): void;
    onEditProvider(id: string): void;
  };
  const host = () => captured.props.providerGridHost as HostApi;

  it('supplies an available ProviderGridHostApi with the catalog and the bound provider', async () => {
    render(<SsrmMarketsGridContainer providerId="p1" />);
    await waitFor(() => expect(captured.props.providerGridHost).toBeDefined());
    expect(host().available).toBe(true);
    expect(host().liveProviders.map((c) => c.providerId)).toEqual(['p1', 'p2', 'hist-1']);
    expect(host().historicalProviders.length).toBe(3);
    expect(host().liveProviderId).toBe('p1');
    expect(host().mode).toBe('live');
  });

  it('rebinds the grid to a different live provider through onLiveChange', async () => {
    render(<SsrmMarketsGridContainer providerId="p1" />);
    await waitFor(() => expect(captured.props.providerGridHost).toBeDefined());
    await act(async () => {
      host().onLiveChange('p2');
    });
    await waitFor(() => {
      expect(providerHook.ids[providerHook.ids.length - 1]).toBe('p2');
    });
    expect(host().liveProviderId).toBe('p2');
  });

  it('historical mode resolves the historical provider and reload carries asOfDate', async () => {
    const restart = vi.fn(async () => {});
    (fakeProvider as Record<string, unknown>).restart = restart;
    render(<SsrmMarketsGridContainer providerId="p1" />);
    await waitFor(() => expect(captured.props.providerGridHost).toBeDefined());
    await act(async () => {
      host().onHistoricalChange('hist-1');
    });
    await act(async () => {
      host().onModeChange('historical');
    });
    await waitFor(() => {
      expect(providerHook.ids[providerHook.ids.length - 1]).toBe('hist-1');
    });
    act(() => {
      host().onAsOfDateChange('2026-08-01');
    });
    await waitFor(() => expect(host().asOfDate).toBe('2026-08-01'));
    act(() => {
      host().onReloadFromSource();
    });
    expect(restart).toHaveBeenCalledWith(
      expect.objectContaining({ asOfDate: '2026-08-01' }),
    );
  });

  it('routes the host Edit action to onEditProvider with the requested id under OpenFin', async () => {
    runtime.openFin = true;
    const onEditProvider = vi.fn();
    render(<SsrmMarketsGridContainer providerId="p1" onEditProvider={onEditProvider} />);
    await waitFor(() => expect(captured.props.providerGridHost).toBeDefined());
    act(() => {
      host().onEditProvider('p2');
    });
    expect(onEditProvider).toHaveBeenCalledWith('p2');
  });

  it('opens the inline editor on the requested id in a browser runtime', async () => {
    render(<SsrmMarketsGridContainer providerId="p1" onEditProvider={vi.fn()} />);
    await waitFor(() => expect(captured.props.providerGridHost).toBeDefined());
    act(() => {
      host().onEditProvider('p2');
    });
    expect(await screen.findByTestId('inline-editor')).toBeTruthy();
  });
});

/**
 * Container lifecycle (roadmap Phase 8 / T3-4, T3-5). Before this, an SSRM
 * grid's only load feedback was a status strip that defaults OFF, so the
 * default hosted configuration showed grid chrome over an empty viewport for
 * the whole snapshot load and said nothing at all when the provider failed.
 */
describe('SsrmMarketsGridContainer lifecycle', () => {
  const overlay = () => screen.queryByRole('status');

  // Production shape: `ready` is false until `start()` resolves, so the
  // overlay's visibility is decided by the provider's status stream.
  beforeEach(() => { wiring.ready = false; });

  // A transport need not expose `onStatus` at all — the subscription is
  // optional-chained. `ready` from the wiring hook is the second settle
  // signal, so such a provider does not sit under a blocking overlay forever.
  it('settles on a started provider even with no status stream', async () => {
    const holder = fakeProvider as { onStatus?: unknown };
    const saved = holder.onStatus;
    holder.onStatus = undefined;
    wiring.ready = true;
    try {
      render(<SsrmMarketsGridContainer providerId="p1" />);
      await waitFor(() => expect(captured.props.gridId).toBe('p1'));
      expect(overlay()).toBeNull();
    } finally {
      holder.onStatus = saved;
    }
  });

  it('overlays the grid until the first load settles, naming the provider', async () => {
    render(<SsrmMarketsGridContainer providerId="p1" />);
    await waitFor(() => expect(captured.props.gridId).toBe('p1'));
    expect(overlay()).toBeTruthy();
    expect(overlay()!.getAttribute('aria-label')).toMatch(/Loading P One/);

    act(() => { fakeProvider.emitStatus('ready'); });
    await waitFor(() => expect(overlay()).toBeNull());
  });

  // The overlay takes pointer events across the whole grid INCLUDING the
  // toolbar, so leaving it up on a failed provider would take away the only
  // route to repairing that provider. An error settles the first load.
  it('resolves the overlay on a provider error so the toolbar stays reachable', async () => {
    render(<SsrmMarketsGridContainer providerId="p1" />);
    await waitFor(() => expect(overlay()).toBeTruthy());
    act(() => { fakeProvider.emitStatus('error', 'broker unreachable'); });
    await waitFor(() => expect(overlay()).toBeNull());
    // …and the banner is what reports it, on the mounted grid.
    expect(captured.props.dataStale).toBe(true);
    expect(captured.props.adminActions).toBeDefined();
  });

  it('brings the overlay back with Refreshing copy for a post-ready re-snapshot', async () => {
    render(<SsrmMarketsGridContainer providerId="p1" />);
    await waitFor(() => expect(captured.props.gridId).toBe('p1'));
    act(() => { fakeProvider.emitStatus('ready'); });
    await waitFor(() => expect(overlay()).toBeNull());

    act(() => { fakeProvider.emitStatus('loading'); });
    await waitFor(() => expect(overlay()).toBeTruthy());
    expect(overlay()!.getAttribute('aria-label')).toMatch(/Refreshing P One/);

    act(() => { fakeProvider.emitStatus('ready'); });
    await waitFor(() => expect(overlay()).toBeNull());
  });

  it('shows Saving… while a profile is written and chains the host handler', async () => {
    const onSavingChange = vi.fn();
    render(<SsrmMarketsGridContainer providerId="p1" onSavingChange={onSavingChange} />);
    await waitFor(() => expect(captured.props.onSavingChange).toBeDefined());
    act(() => { fakeProvider.emitStatus('ready'); });
    await waitFor(() => expect(overlay()).toBeNull());

    act(() => (captured.props.onSavingChange as (s: boolean) => void)(true));
    await waitFor(() => expect(overlay()).toBeTruthy());
    expect(overlay()!.getAttribute('aria-label')).toMatch(/Saving…/);
    expect(onSavingChange).toHaveBeenCalledWith(true);

    act(() => (captured.props.onSavingChange as (s: boolean) => void)(false));
    await waitFor(() => expect(overlay()).toBeNull());
  });

  // T3-5's literal case: no provider adapter at all. The grid still mounts —
  // on a sentinel row key, with the data-infra actions but no refresh pair —
  // because repairing the provider is the only thing the user can do here.
  it('mounts a no-provider shell that keeps the customizer reachable', async () => {
    render(<SsrmMarketsGridContainer providerId="" />);
    await waitFor(() => expect(captured.props.rowIdField).toBe('__none__'));
    expect(captured.props.ssrm).toBeUndefined();
    expect(captured.props.columnDefs).toEqual([]);
    expect(captured.props.dataStale).toBe(true);
    expect(captured.props.dataStaleMessage).toMatch(/No data provider is bound/);
    expect((captured.props.providerGridHost as { available: boolean }).available).toBe(true);
    expect((captured.props.adminActions as Array<{ id: string }>).map((a) => a.id)).toEqual([
      'data-provider-editor',
      'config-browser',
    ]);
    expect(overlay()).toBeNull();
  });
});
