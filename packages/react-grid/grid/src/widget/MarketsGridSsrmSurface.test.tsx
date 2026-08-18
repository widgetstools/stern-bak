import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React, { createRef } from 'react';
import type { AgGridReact } from 'ag-grid-react';

const { setGridOption, refreshServerSide, api, createSsrmDatasource, bindSsrmTicks } = vi.hoisted(() => {
  const setGridOption = vi.fn();
  const refreshServerSide = vi.fn();
  const api = { setGridOption, refreshServerSide, isDestroyed: () => false };
  const createSsrmDatasource = vi.fn(() => ({ getRows: vi.fn() }));
  const bindSsrmTicks = vi.fn(() => () => {});
  return { setGridOption, refreshServerSide, api, createSsrmDatasource, bindSsrmTicks };
});

vi.mock('ag-grid-react', () => ({
  AgGridReact: (props: { onGridReady?: (e: { api: typeof api }) => void }) => {
    (globalThis as Record<string, unknown>).__ssrmSurfaceProps = props;
    // Real AG Grid fires gridReady exactly once per mount.
    const firedRef = React.useRef(false);
    React.useEffect(() => {
      // Tests may hold gridReady to simulate a slow grid init.
      if ((globalThis as Record<string, unknown>).__ssrmHoldReady) return;
      if (firedRef.current) return;
      firedRef.current = true;
      props.onGridReady?.({ api });
    }, [props]);
    return React.createElement('div', {
      'data-testid': 'ag-ssrm',
      'data-row-model': (props as { rowModelType?: string }).rowModelType,
    });
  },
}));

vi.mock('ag-grid-enterprise', () => ({
  AllEnterpriseModule: {},
}));

vi.mock('../ssrm/createSsrmDatasource.js', () => ({ createSsrmDatasource }));
vi.mock('../ssrm/bindSsrmTicks.js', () => ({ bindSsrmTicks }));
vi.mock('../ssrm/createSsrmStatusBar.js', async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  return {
    ...mod,
    createSsrmStatusBar: () => ({
      statusBar: { statusPanels: [{ key: 'ssrm-pack-panel', statusPanel: 'packPanel' }] },
      context: {},
    }),
  };
});
vi.mock('./buildStreamSafeComponents.js', () => ({
  buildStreamSafeComponents: () => ({}),
}));
vi.mock('./nativeScrollbarWidth.js', () => ({
  measureNativeScrollbarWidth: () => 15,
}));
vi.mock('./useRestoreCellFocusOnWindowFocus.js', () => ({
  useRestoreCellFocusOnWindowFocus: () => {},
}));

import { GridPlatform } from '@wellsfargo-starui/core';
import { MarketsGridSsrmSurface } from './MarketsGridSsrmSurface.js';
import { GridProvider } from '../customizer/hooks/GridProvider.js';
import { SsrmFilteredRowsStatusPanel } from '../ssrm/createSsrmStatusBar.js';

describe('MarketsGridSsrmSurface', () => {
  beforeEach(() => {
    setGridOption.mockClear();
    createSsrmDatasource.mockClear();
    bindSsrmTicks.mockClear();
  });

  it('mounts serverSide and binds datasource + ticks on ready', async () => {
    const provider = {
      id: 'p-ssrm',
      getConfig: () => ({ blockSize: 100, keyColumn: 'positionId' }),
      getColumnDefs: () => [],
    } as never;
    const gridRef = createRef<AgGridReact>();
    const onReady = vi.fn();

    render(
      <MarketsGridSsrmSurface
        gridRef={gridRef}
        gridOptions={{}}
        hostOverrideKeys={new Set()}
        theme={undefined}
        columnDefs={[{ field: 'positionId' }]}
        ssrm={{ provider, keyColumn: 'positionId' }}
        sideBar={false}
        statusBar={undefined}
        defaultColDef={undefined}
        onGridReady={onReady}
        onGridPreDestroyed={() => {}}
      />,
    );

    await waitFor(() => {
      expect(createSsrmDatasource).toHaveBeenCalledWith(
        provider,
        expect.objectContaining({ keyColumn: 'positionId' }),
      );
      expect(setGridOption).toHaveBeenCalledWith(
        'serverSideDatasource',
        expect.anything(),
      );
      expect(bindSsrmTicks).toHaveBeenCalled();
      expect(onReady).toHaveBeenCalled();
    });
  });

  it('gives the tick binding the platform as its row-change sink', async () => {
    // `applyServerSideTransaction` fires no flush event, so the tick binding
    // is the platform's ONLY delta source under this row model. Wiring it is
    // one optional option away from being forgotten — this is the pin.
    const provider = {
      id: 'p-ssrm-rows',
      getConfig: () => ({ blockSize: 100, keyColumn: 'positionId' }),
      getColumnDefs: () => [],
    } as never;
    const platform = new GridPlatform({ gridId: 'ssrm-rows', modules: [] });
    const gridRef = createRef<AgGridReact>();

    render(
      <GridProvider platform={platform}>
        <MarketsGridSsrmSurface
          gridRef={gridRef}
          gridOptions={{}}
          hostOverrideKeys={new Set()}
          theme={undefined}
          columnDefs={[{ field: 'positionId' }]}
          ssrm={{ provider, keyColumn: 'positionId' }}
          sideBar={false}
          statusBar={undefined}
          defaultColDef={undefined}
          onGridReady={() => {}}
          onGridPreDestroyed={() => {}}
        />
      </GridProvider>,
    );

    await waitFor(() => {
      expect(bindSsrmTicks).toHaveBeenCalledWith(
        provider,
        expect.anything(),
        expect.objectContaining({ rows: platform.rows }),
      );
    });
    platform.destroy();
  });

  // Roadmap Phase 7 / T3-13. Grid-instance `modules` are ADDITIVE to the
  // global registry, so the `[AllEnterpriseModule]` this surface used to
  // pass handed every SSRM grid the full bundle and made a reduced
  // `agGridModules` prop silently inert. `MarketsGridSurface` never had an
  // instance list; the global registry (`ensureAgGridModules`, called by the
  // MarketsGrid shell with the host's list) is the single source for both.
  it('passes no grid-instance module list — the global registry is the only source', async () => {
    const provider = {
      id: 'p-ssrm-modules',
      getConfig: () => ({ blockSize: 100, keyColumn: 'positionId' }),
      getColumnDefs: () => [],
    } as never;
    const gridRef = createRef<AgGridReact>();

    render(
      <MarketsGridSsrmSurface
        gridRef={gridRef}
        gridOptions={{}}
        hostOverrideKeys={new Set()}
        theme={undefined}
        columnDefs={[{ field: 'positionId' }]}
        ssrm={{ provider, keyColumn: 'positionId' }}
        sideBar={false}
        statusBar={undefined}
        defaultColDef={undefined}
        onGridReady={() => {}}
        onGridPreDestroyed={() => {}}
      />,
    );

    await waitFor(() => {
      const props = (globalThis as Record<string, unknown>).__ssrmSurfaceProps as
        Record<string, unknown>;
      expect(props.rowModelType).toBe('serverSide');
      expect('modules' in props).toBe(false);
    });
  });
});

it('replaces the "Loading..." block renderer with a blank one (fast thumb scrolls)', () => {
  const props = (globalThis as Record<string, unknown>).__ssrmSurfaceProps as {
    loadingCellRenderer?: () => unknown;
  };
  expect(props.loadingCellRenderer).toBeDefined();
  expect(props.loadingCellRenderer!()).toBeNull();
});

describe('MarketsGridSsrmSurface — customizer status bar', () => {
  const provider = {
    id: 'p-ssrm',
    getConfig: () => ({ blockSize: 100, keyColumn: 'positionId' }),
    getColumnDefs: () => [],
  } as never;

  function mount(extra: {
    gridOptions?: Record<string, unknown>;
    statusBar?: { statusPanels: Array<Record<string, unknown>> };
    hostOverrideKeys?: Set<string>;
  }) {
    const gridRef = createRef<AgGridReact>();
    return render(
      <MarketsGridSsrmSurface
        gridRef={gridRef}
        gridOptions={extra.gridOptions ?? {}}
        hostOverrideKeys={extra.hostOverrideKeys ?? new Set(['statusBar'])}
        theme={undefined}
        columnDefs={[{ field: 'positionId' }]}
        ssrm={{ provider, keyColumn: 'positionId' }}
        sideBar={false}
        statusBar={extra.statusBar as never}
        defaultColDef={undefined}
        onGridReady={() => {}}
        onGridPreDestroyed={() => {}}
      />,
    );
  }

  const surfaceProps = () =>
    (globalThis as Record<string, unknown>).__ssrmSurfaceProps as {
      statusBar?: { statusPanels: Array<{ statusPanel: unknown; align?: string }> };
    };

  it('maps the pipeline statusBar selection onto worker-backed panels', () => {
    mount({
      gridOptions: {
        statusBar: {
          statusPanels: [
            { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
            { statusPanel: 'agSelectedRowCountComponent' },
          ],
        },
      },
    });
    const bar = surfaceProps().statusBar!;
    expect(bar.statusPanels).toHaveLength(2);
    // Count panel replaced with the SSRM component (a function, not the
    // native string); selected count passes through untouched.
    expect(typeof bar.statusPanels[0].statusPanel).toBe('function');
    expect(bar.statusPanels[0].align).toBe('left');
    expect(bar.statusPanels[1].statusPanel).toBe('agSelectedRowCountComponent');
  });

  it('renders an empty panel list when the customizer toggles the bar off (key absent)', () => {
    // Empty, not undefined — AG Grid only creates the status-bar container
    // when the option exists at init; the surface hides the empty strip.
    mount({ gridOptions: {} });
    expect(surfaceProps().statusBar).toEqual({ statusPanels: [] });
  });

  it('keeps host-prop statusBar behaviour: prepended to the SSRM pack', () => {
    mount({
      gridOptions: {},
      statusBar: { statusPanels: [{ statusPanel: 'hostPanel' }] },
    });
    const bar = surfaceProps().statusBar!;
    expect(bar.statusPanels.map((panel) => panel.statusPanel)).toEqual([
      'hostPanel',
      'packPanel',
    ]);
  });

  it('pushes post-mount customizer changes through setGridOption', async () => {
    const { rerender } = mount({
      gridOptions: {
        statusBar: { statusPanels: [{ statusPanel: 'agTotalRowCountComponent' }] },
      },
    });
    await waitFor(() => expect(setGridOption).toHaveBeenCalled());
    setGridOption.mockClear();

    const gridRef = createRef<AgGridReact>();
    rerender(
      <MarketsGridSsrmSurface
        gridRef={gridRef}
        gridOptions={{
          statusBar: {
            statusPanels: [
              { statusPanel: 'agTotalRowCountComponent' },
              { statusPanel: 'agAggregationComponent', align: 'right' },
            ],
          },
        }}
        hostOverrideKeys={new Set(['statusBar'])}
        theme={undefined}
        columnDefs={[{ field: 'positionId' }]}
        ssrm={{ provider, keyColumn: 'positionId' }}
        sideBar={false}
        statusBar={undefined}
        defaultColDef={undefined}
        onGridReady={() => {}}
        onGridPreDestroyed={() => {}}
      />,
    );
    await waitFor(() => {
      expect(setGridOption).toHaveBeenCalledWith(
        'statusBar',
        expect.objectContaining({
          statusPanels: expect.arrayContaining([
            expect.objectContaining({ statusPanel: 'agAggregationComponent' }),
          ]),
        }),
      );
    });
  });
});

describe('MarketsGridSsrmSurface — pre-ready statusBar race', () => {
  const provider = {
    id: 'p-ssrm',
    getConfig: () => ({ blockSize: 100, keyColumn: 'positionId' }),
    getColumnDefs: () => [],
  } as never;

  const surfaceEl = (gridOptions: Record<string, unknown>) => (
    <MarketsGridSsrmSurface
      gridRef={createRef<AgGridReact>()}
      gridOptions={gridOptions}
      hostOverrideKeys={new Set(['statusBar'])}
      theme={undefined}
      columnDefs={[{ field: 'positionId' }]}
      ssrm={{ provider, keyColumn: 'positionId' }}
      sideBar={false}
      statusBar={undefined}
      defaultColDef={undefined}
      onGridReady={() => {}}
      onGridPreDestroyed={() => {}}
    />
  );

  it('applies a selection that landed while the grid was initialising (catch-up push at ready)', async () => {
    setGridOption.mockClear();
    (globalThis as Record<string, unknown>).__ssrmHoldReady = true;
    try {
      const { rerender } = render(
        surfaceEl({ statusBar: { statusPanels: [{ statusPanel: 'agTotalRowCountComponent' }] } }),
      );
      // Customizer hydration lands a DIFFERENT selection before gridReady.
      rerender(
        surfaceEl({ statusBar: { statusPanels: [{ statusPanel: 'agFilteredRowCountComponent' }] } }),
      );
      // No api yet — nothing pushed, and (critically) nothing swallowed.
      expect(setGridOption).not.toHaveBeenCalledWith('statusBar', expect.anything());

      // Grid becomes ready — the catch-up push applies the LATEST selection.
      const props = (globalThis as Record<string, unknown>).__ssrmSurfaceProps as {
        onGridReady?: (e: { api: typeof api }) => void;
      };
      props.onGridReady?.({ api });

      const statusBarCalls = setGridOption.mock.calls.filter((c) => c[0] === 'statusBar');
      expect(statusBarCalls.length).toBeGreaterThan(0);
      const pushed = statusBarCalls[statusBarCalls.length - 1][1] as {
        statusPanels: Array<{ statusPanel: unknown }>;
      };
      expect(pushed.statusPanels).toHaveLength(1);
      expect(pushed.statusPanels[0].statusPanel).toBe(SsrmFilteredRowsStatusPanel);
    } finally {
      delete (globalThis as Record<string, unknown>).__ssrmHoldReady;
    }
  });
});

describe('MarketsGridSsrmSurface — late-bound key column (single grid instantiation)', () => {
  const makeProvider = () => ({
    id: 'p-ssrm',
    getConfig: () => ({ blockSize: 100 }),
    getColumnDefs: () => [],
  }) as never;

  const surfaceEl = (provider: never, keyColumn: string) => (
    <MarketsGridSsrmSurface
      gridRef={createRef<AgGridReact>()}
      gridOptions={{}}
      hostOverrideKeys={new Set(['statusBar'])}
      theme={undefined}
      columnDefs={[{ field: 'positionId' }]}
      ssrm={{ provider, keyColumn }}
      sideBar={false}
      statusBar={undefined}
      defaultColDef={undefined}
      onGridReady={() => {}}
      onGridPreDestroyed={() => {}}
    />
  );

  it('rebinds datasource + ticks and purges when keyColumn resolves — no remount', async () => {
    const provider = makeProvider();
    createSsrmDatasource.mockClear();
    bindSsrmTicks.mockClear();
    refreshServerSide.mockClear();

    const { rerender } = render(surfaceEl(provider, 'id'));
    await waitFor(() => expect(createSsrmDatasource).toHaveBeenCalledWith(
      provider,
      expect.objectContaining({ keyColumn: 'id' }),
    ));
    const bindsAfterReady = bindSsrmTicks.mock.calls.length;

    // Provider becomes ready → container resolves the real key column.
    rerender(surfaceEl(provider, 'positionId'));

    await waitFor(() => expect(createSsrmDatasource).toHaveBeenCalledWith(
      provider,
      expect.objectContaining({ keyColumn: 'positionId' }),
    ));
    expect(bindSsrmTicks.mock.calls.length).toBeGreaterThan(bindsAfterReady);
    // Row identity changed — every block reloads under the new key.
    expect(refreshServerSide).toHaveBeenCalledWith({ purge: true });

    // getRowId captured at init reads the CURRENT key column via the ref.
    const props = (globalThis as Record<string, unknown>).__ssrmSurfaceProps as {
      getRowId: (p: { data: Record<string, unknown> }) => string;
    };
    expect(props.getRowId({ data: { id: 'wrong', positionId: 'POS-1' } })).toBe('POS-1');
  });

  it('does not rebind when keyColumn is unchanged across re-renders', async () => {
    const provider = makeProvider();
    createSsrmDatasource.mockClear();

    const { rerender } = render(surfaceEl(provider, 'positionId'));
    await waitFor(() => expect(createSsrmDatasource).toHaveBeenCalled());
    const calls = createSsrmDatasource.mock.calls.length;

    rerender(surfaceEl(provider, 'positionId'));
    await new Promise((r) => setTimeout(r, 5));
    expect(createSsrmDatasource.mock.calls.length).toBe(calls);
  });
});

/**
 * The surface's own decisions: which host props override the pipeline, what
 * block size it asks for, when it skips a re-render, and what it does with a
 * grid that is already gone.
 */
describe('MarketsGridSsrmSurface — props and lifecycle', () => {
  const provider = {
    id: 'p',
    getConfig: () => ({ keyColumn: 'id' }),
    getConfigOrNull: () => ({ keyColumn: 'id' }),
    getColumnDefs: () => [],
  } as never;

  function renderSurface(overrides: Record<string, unknown> = {}) {
    const gridRef = createRef<AgGridReact>();
    const props = {
      gridRef,
      gridOptions: {},
      hostOverrideKeys: new Set<string>(),
      theme: undefined,
      columnDefs: [{ field: 'id' }],
      ssrm: { provider, keyColumn: 'id' },
      sideBar: false,
      statusBar: undefined,
      defaultColDef: undefined,
      onGridReady: vi.fn(),
      onGridPreDestroyed: vi.fn(),
      ...overrides,
    };
    const view = render(<MarketsGridSsrmSurface {...(props as never)} />);
    return { ...view, props, gridProps: () => (globalThis as Record<string, unknown>).__ssrmSurfaceProps as Record<string, unknown> };
  }

  beforeEach(() => {
    createSsrmDatasource.mockClear();
    bindSsrmTicks.mockClear();
    setGridOption.mockClear();
    refreshServerSide.mockClear();
  });

  it('takes the block size the caller declared', async () => {
    renderSurface({ ssrm: { provider, keyColumn: 'id', cacheBlockSize: 500 } });
    await waitFor(() => expect(createSsrmDatasource).toHaveBeenCalled());

    expect(gridPropsOf().cacheBlockSize).toBe(500);
  });

  it('ignores a caller block size too small to be worth a round trip', async () => {
    renderSurface({ ssrm: { provider, keyColumn: 'id', cacheBlockSize: 19 } });
    await waitFor(() => expect(createSsrmDatasource).toHaveBeenCalled());

    // Falls through to the provider config, which declares none → 100.
    expect(gridPropsOf().cacheBlockSize).toBe(100);
  });

  it('falls back to the provider config block size', async () => {
    const sized = {
      ...provider,
      getConfigOrNull: () => ({ keyColumn: 'id', blockSize: 250 }),
    } as never;
    renderSurface({ ssrm: { provider: sized, keyColumn: 'id' } });
    await waitFor(() => expect(createSsrmDatasource).toHaveBeenCalled());

    expect(gridPropsOf().cacheBlockSize).toBe(250);
  });

  it('defaults the block size when the provider has no config yet', async () => {
    // Pre-start the config is null; the old try/catch turned that into a
    // permanent 100 indistinguishable from a malformed config.
    const unstarted = { ...provider, getConfigOrNull: () => null } as never;
    renderSurface({ ssrm: { provider: unstarted, keyColumn: 'id' } });
    await waitFor(() => expect(createSsrmDatasource).toHaveBeenCalled());

    expect(gridPropsOf().cacheBlockSize).toBe(100);
  });

  it('defaults the block size for a provider with no config accessor', async () => {
    const bare = { id: 'p', getColumnDefs: () => [] } as never;
    renderSurface({ ssrm: { provider: bare, keyColumn: 'id' } });
    await waitFor(() => expect(createSsrmDatasource).toHaveBeenCalled());

    expect(gridPropsOf().cacheBlockSize).toBe(100);
  });

  it('honours each host override key the caller declares', async () => {
    renderSurface({
      hostOverrideKeys: new Set(['rowHeight', 'headerHeight', 'animateRows', 'sideBar', 'defaultColDef']),
      rowHeight: 42,
      headerHeight: 33,
      animateRows: false,
      sideBar: true,
      defaultColDef: { resizable: false },
    });
    await waitFor(() => expect(createSsrmDatasource).toHaveBeenCalled());

    const p = gridPropsOf();
    expect(p.rowHeight).toBe(42);
    expect(p.headerHeight).toBe(33);
    expect(p.animateRows).toBe(false);
    expect(p.sideBar).toBe(true);
    expect(p.defaultColDef).toMatchObject({ resizable: false });
  });

  it('leaves a host prop out when its key is not declared an override', async () => {
    renderSurface({ hostOverrideKeys: new Set(), rowHeight: 42 });
    await waitFor(() => expect(createSsrmDatasource).toHaveBeenCalled());

    expect(gridPropsOf().rowHeight).not.toBe(42);
  });

  it('does not rebind when every prop is identical', async () => {
    const gridRef = createRef<AgGridReact>();
    const stable = {
      gridRef,
      gridOptions: {},
      hostOverrideKeys: new Set<string>(),
      theme: undefined,
      columnDefs: [{ field: 'id' }],
      ssrm: { provider, keyColumn: 'id' },
      sideBar: false,
      statusBar: undefined,
      defaultColDef: undefined,
      onGridReady: vi.fn(),
      onGridPreDestroyed: vi.fn(),
    };
    const { rerender } = render(<MarketsGridSsrmSurface {...(stable as never)} />);
    await waitFor(() => expect(createSsrmDatasource).toHaveBeenCalledTimes(1));

    rerender(<MarketsGridSsrmSurface {...(stable as never)} />);
    expect(createSsrmDatasource).toHaveBeenCalledTimes(1);
  });

  it('releases the tick binding when the grid is destroyed', async () => {
    const unbind = vi.fn();
    bindSsrmTicks.mockReturnValue(unbind);
    const onGridPreDestroyed = vi.fn();
    renderSurface({ onGridPreDestroyed });
    await waitFor(() => expect(bindSsrmTicks).toHaveBeenCalled());

    (gridPropsOf().onGridPreDestroyed as () => void)();
    expect(unbind).toHaveBeenCalled();
    expect(onGridPreDestroyed).toHaveBeenCalled();
  });

  it('releases the tick binding on unmount', async () => {
    const unbind = vi.fn();
    bindSsrmTicks.mockReturnValue(unbind);
    const { unmount } = renderSurface();
    await waitFor(() => expect(bindSsrmTicks).toHaveBeenCalled());

    unmount();
    expect(unbind).toHaveBeenCalled();
  });

  it('survives a grid that refuses to refresh mid-teardown', async () => {
    refreshServerSide.mockImplementation(() => {
      throw new Error('grid is tearing down');
    });
    const { rerender, props } = renderSurface();
    await waitFor(() => expect(createSsrmDatasource).toHaveBeenCalled());

    expect(() =>
      rerender(
        <MarketsGridSsrmSurface
          {...(props as never)}
          ssrm={{ provider, keyColumn: 'newKey' }}
        />,
      ),
    ).not.toThrow();
    refreshServerSide.mockReset();
  });
});

/** The props the AgGridReact stand-in last received. */
function gridPropsOf(): Record<string, unknown> {
  return (globalThis as Record<string, unknown>).__ssrmSurfaceProps as Record<string, unknown>;
}
