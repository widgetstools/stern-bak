import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React, { createRef } from 'react';
import type { AgGridReact } from 'ag-grid-react';

const { setGridOption, api, createSsrmDatasource, bindSsrmTicks } = vi.hoisted(() => {
  const setGridOption = vi.fn();
  const api = { setGridOption, isDestroyed: () => false };
  const createSsrmDatasource = vi.fn(() => ({ getRows: vi.fn() }));
  const bindSsrmTicks = vi.fn(() => () => {});
  return { setGridOption, api, createSsrmDatasource, bindSsrmTicks };
});

vi.mock('ag-grid-react', () => ({
  AgGridReact: (props: { onGridReady?: (e: { api: typeof api }) => void }) => {
    (globalThis as Record<string, unknown>).__ssrmSurfaceProps = props;
    React.useEffect(() => {
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

import { MarketsGridSsrmSurface } from './MarketsGridSsrmSurface.js';

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

  it('renders no status bar when the customizer toggles it off (key absent)', () => {
    mount({ gridOptions: {} });
    expect(surfaceProps().statusBar).toBeUndefined();
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
