import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';

const readyOptions: Record<string, unknown> = { quickFilterText: 'ABC' };
const readyApi = {
  refreshServerSide: vi.fn(),
  applyServerSideTransactionAsync: vi.fn(),
  getColumnState: vi.fn(() => []),
  getRowGroupColumns: vi.fn(() => []),
  getValueColumns: vi.fn(() => []),
  getGridOption: vi.fn((key: string) => readyOptions[key]),
  setGridOption: vi.fn((key: string, value: unknown) => {
    readyOptions[key] = value;
  }),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  isDestroyed: () => false,
};

const lastGridProps: { current: Record<string, unknown> | null } = { current: null };

vi.mock('ag-grid-react', () => ({
  AgGridReact: React.forwardRef<unknown, Record<string, unknown>>(function AgGridStub(props, _ref) {
    lastGridProps.current = props;
    React.useEffect(() => {
      (props.onGridReady as ((e: { api: typeof readyApi }) => void) | undefined)?.({ api: readyApi });
    }, [props.onGridReady]);
    return (
      <div
        data-testid="ag-grid-ssrm"
        data-row-model={String(props.rowModelType)}
        data-block-size={String(props.cacheBlockSize)}
      />
    );
  }),
}));

vi.mock('./useRestoreCellFocusOnWindowFocus.js', () => ({
  useRestoreCellFocusOnWindowFocus: () => undefined,
}));

import { MarketsGridSsrmSurface } from './MarketsGridSsrmSurface.js';
import { SsrmBlankLoadingCellRenderer } from '../ssrm/SsrmBlankLoadingCellRenderer.js';

function provider(): ISsrmDataProvider {
  return {
    id: 'p-ssrm',
    capabilities: {
      providerType: 'stomp-ssrm',
      streaming: true,
      realtime: true,
      supportsRefresh: true,
      supportsRestart: true,
    },
    start: vi.fn(),
    stop: vi.fn(),
    refresh: vi.fn(),
    restart: vi.fn(),
    getConfig: vi.fn(),
    getColumnDefs: vi.fn(() => []),
    getRows: vi.fn(),
    getColumnValues: vi.fn(() => Promise.resolve({ column: 'c', values: [], truncated: false })),
  getRowCount: vi.fn(() => Promise.resolve({ rowCount: 0 })),
  getAggregates: vi.fn(() => Promise.resolve({ values: {} })),
    watchGroups: vi.fn().mockResolvedValue(undefined),
    onSsrmTick: vi.fn(() => () => undefined),
    onRefresh: vi.fn(() => () => undefined),
    onRowsReceived: vi.fn(() => () => undefined),
    onStatus: vi.fn(() => () => undefined),
    onError: vi.fn(() => () => undefined),
  };
}

describe('MarketsGridSsrmSurface', () => {
  beforeEach(() => {
    readyOptions.quickFilterText = 'ABC';
    delete readyOptions.statusBar;
    vi.mocked(readyApi.setGridOption).mockClear();
    vi.mocked(readyApi.getGridOption).mockClear();
  });

  it('mounts AG Grid in serverSide mode and binds ticks on ready', () => {
    const p = provider();
    const onGridReady = vi.fn();
    const gridRef = { current: { api: readyApi } };
    const { unmount, getByTestId } = render(
      <MarketsGridSsrmSurface
        gridRef={gridRef as never}
        gridOptions={{ suppressCellFocus: true }}
        hostOverrideKeys={new Set(['rowHeight', 'sideBar'])}
        theme={undefined}
        columnDefs={[{ field: 'id' }]}
        rowHeight={22}
        sideBar
        defaultColDef={{ sortable: true }}
        onGridReady={onGridReady}
        onGridPreDestroyed={vi.fn()}
        ssrm={{ provider: p, keyColumn: 'id', cacheBlockSize: 150 }}
      />,
    );
    expect(getByTestId('ag-grid-ssrm')).toHaveAttribute('data-row-model', 'serverSide');
    expect(getByTestId('ag-grid-ssrm')).toHaveAttribute('data-block-size', '150');
    expect(lastGridProps.current?.suppressServerSideFullWidthLoadingRow).toBe(true);
    expect(lastGridProps.current?.loadingCellRenderer).toBe(SsrmBlankLoadingCellRenderer);
    expect(
      (lastGridProps.current?.defaultColDef as { loadingCellRenderer?: unknown })?.loadingCellRenderer,
    ).toBe(SsrmBlankLoadingCellRenderer);
    expect(onGridReady).toHaveBeenCalled();
    expect(p.onSsrmTick).toHaveBeenCalled();
    expect(p.watchGroups).toHaveBeenCalled();
    unmount();
  });

  it('defaults cacheBlockSize and keyColumn and applies every host override', () => {
    const p = provider();
    const { getByTestId, unmount } = render(
      <MarketsGridSsrmSurface
        gridRef={{ current: null }}
        gridOptions={{}}
        hostOverrideKeys={new Set([
          'rowHeight',
          'headerHeight',
          'animateRows',
          'sideBar',
          'statusBar',
          'defaultColDef',
        ])}
        theme={undefined}
        columnDefs={[{ field: 'positionId' }]}
        rowHeight={20}
        headerHeight={24}
        animateRows={false}
        sideBar={false}
        statusBar={{ statusPanels: [] }}
        defaultColDef={{ filter: true }}
        includeAllStreamSafeFilters={false}
        onGridReady={vi.fn()}
        onGridPreDestroyed={vi.fn()}
        ssrm={{ provider: p }}
      />,
    );
    expect(getByTestId('ag-grid-ssrm')).toHaveAttribute('data-block-size', '200');
    unmount();
  });

  // AG Grid's own quick filter is client-side only — the text has to ride
  // the block request so the worker cache can match it.
  it('forwards the live quickFilterText into the block request', async () => {
    const p = provider();
    const gridRef = { current: { api: readyApi } };
    const { unmount } = render(
      <MarketsGridSsrmSurface
        gridRef={gridRef as never}
        gridOptions={{}}
        hostOverrideKeys={new Set()}
        theme={undefined}
        columnDefs={[{ field: 'id' }]}
        onGridReady={vi.fn()}
        onGridPreDestroyed={vi.fn()}
        ssrm={{ provider: p, keyColumn: 'id' }}
      />,
    );

    const datasource = lastGridProps.current?.serverSideDatasource as {
      getRows: (params: unknown) => void;
    };
    vi.mocked(p.getRows).mockResolvedValue({ rowData: [], rowCount: 0 });
    const firstSuccess = vi.fn();
    datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      api: readyApi,
      success: firstSuccess,
      fail: vi.fn(),
    });
    // The first block is sent without the live filter (grouped store hang).
    await vi.waitFor(() => expect(firstSuccess).toHaveBeenCalled());
    datasource.getRows({
      request: { startRow: 0, endRow: 100 },
      api: readyApi,
      success: vi.fn(),
      fail: vi.fn(),
    });

    expect(p.getRows).toHaveBeenLastCalledWith(
      expect.objectContaining({ quickFilterText: 'ABC' }),
    );
    unmount();
  });

  // A set filter builds its list by scanning rows, which SSRM doesn't have —
  // so the surface has to supply one from the worker on both the colDefs and
  // the defaultColDef (AG Grid doesn't merge filterParams between them).
  it('supplies set filter values on the column defs and the default col def', async () => {
    const p = provider();
    vi.mocked(p.getColumnValues).mockResolvedValue({
      column: 'desk',
      values: ['DeskA'],
      truncated: false,
    });
    const { unmount } = render(
      <MarketsGridSsrmSurface
        gridRef={{ current: null }}
        gridOptions={{ defaultColDef: { filter: true } }}
        hostOverrideKeys={new Set()}
        theme={undefined}
        columnDefs={[{ field: 'desk', filter: 'agSetColumnFilter' }]}
        onGridReady={vi.fn()}
        onGridPreDestroyed={vi.fn()}
        ssrm={{ provider: p, keyColumn: 'id' }}
      />,
    );

    const colDefs = lastGridProps.current?.columnDefs as Array<{
      filterParams?: { values?: (p: { success: (v: unknown[]) => void }) => void };
    }>;
    const success = vi.fn();
    colDefs[0].filterParams?.values?.({ success });
    await vi.waitFor(() => expect(success).toHaveBeenCalledWith(['DeskA']));

    const defaultColDef = lastGridProps.current?.defaultColDef as {
      filterParams?: { values?: unknown };
    };
    expect(typeof defaultColDef.filterParams?.values).toBe('function');
    unmount();
  });

  it('leaves the default col def alone when it declares no set filter', () => {
    const p = provider();
    const defaultColDef = { sortable: true };
    const { unmount } = render(
      <MarketsGridSsrmSurface
        gridRef={{ current: null }}
        gridOptions={{}}
        hostOverrideKeys={new Set(['defaultColDef'])}
        theme={undefined}
        columnDefs={[{ field: 'desk' }]}
        defaultColDef={defaultColDef}
        onGridReady={vi.fn()}
        onGridPreDestroyed={vi.fn()}
        ssrm={{ provider: p, keyColumn: 'id' }}
      />,
    );
    // No set-filter values callback is added — only the blank block
    // placeholder renderer every SSRM default col def carries.
    expect(lastGridProps.current?.defaultColDef).toEqual({
      sortable: true,
      loadingCellRenderer: SsrmBlankLoadingCellRenderer,
    });
    unmount();
  });

  it('shows engine child counts on group rows and refuses a paste onto unloaded rows', () => {
    const p = provider();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { unmount } = render(
      <MarketsGridSsrmSurface
        gridRef={{ current: null }}
        gridOptions={{}}
        hostOverrideKeys={new Set()}
        theme={undefined}
        columnDefs={[{ field: 'desk' }]}
        defaultColDef={undefined}
        onGridReady={vi.fn()}
        onGridPreDestroyed={vi.fn()}
        ssrm={{ provider: p, keyColumn: 'id' }}
      />,
    );
    const getChildCount = lastGridProps.current?.getChildCount as (data: unknown) => number;
    expect(getChildCount({ __count: 42 })).toBe(42);
    expect(getChildCount({})).toBeUndefined();

    const paste = lastGridProps.current?.processDataFromClipboard as (p: unknown) => string[][] | null;
    const loaded = { data: {} };
    const stub = { stub: true };
    const apiFor = (rows: unknown[]) => ({
      getCellRanges: () => [{ startRow: { rowIndex: 0 }, endRow: { rowIndex: rows.length - 1 } }],
      getDisplayedRowAtIndex: (i: number) => rows[i],
    });
    expect(paste({ api: apiFor([loaded, loaded]), data: [['1'], ['2']] })).toEqual([['1'], ['2']]);
    expect(paste({ api: apiFor([loaded, stub]), data: [['1'], ['2']] })).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('paste refused'));
    warn.mockRestore();
    unmount();
  });

  it('remaps pipeline statusBar panels when the host does not override', () => {
    const p = provider();
    const { unmount } = render(
      <MarketsGridSsrmSurface
        gridRef={{ current: null }}
        gridOptions={{
          statusBar: {
            statusPanels: [
              { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
              { statusPanel: 'agSelectedRowCountComponent' },
              { statusPanel: 'agAggregationComponent', align: 'right' },
            ],
          },
        }}
        hostOverrideKeys={new Set()}
        theme={undefined}
        columnDefs={[{ field: 'desk' }]}
        onGridReady={vi.fn()}
        onGridPreDestroyed={vi.fn()}
        ssrm={{ provider: p }}
      />,
    );
    const bar = (readyApi.setGridOption as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'statusBar',
    )?.[1] as { statusPanels: Array<{ statusPanel: unknown }> };
    expect(bar.statusPanels).toHaveLength(3);
    expect(bar.statusPanels.every((panel) => typeof panel.statusPanel === 'function')).toBe(true);
    unmount();
  });

  it('does not re-push statusBar when only pipeline identity changes', () => {
    const p = provider();
    const panels = [
      { statusPanel: 'agSelectedRowCountComponent' },
    ];
    const { rerender, unmount } = render(
      <MarketsGridSsrmSurface
        gridRef={{ current: { api: readyApi } }}
        gridOptions={{ statusBar: { statusPanels: panels }, rowHeight: 30 }}
        hostOverrideKeys={new Set()}
        theme={undefined}
        columnDefs={[{ field: 'desk' }]}
        onGridReady={vi.fn()}
        onGridPreDestroyed={vi.fn()}
        ssrm={{ provider: p }}
      />,
    );
    const pushed = (readyApi.setGridOption as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c) => c[0] === 'statusBar',
    ).length;
    rerender(
      <MarketsGridSsrmSurface
        gridRef={{ current: { api: readyApi } }}
        gridOptions={{ statusBar: { statusPanels: [...panels] }, rowHeight: 32 }}
        hostOverrideKeys={new Set()}
        theme={undefined}
        columnDefs={[{ field: 'desk' }]}
        onGridReady={vi.fn()}
        onGridPreDestroyed={vi.fn()}
        ssrm={{ provider: p }}
      />,
    );
    expect(
      (readyApi.setGridOption as ReturnType<typeof vi.fn>).mock.calls.filter(
        (c) => c[0] === 'statusBar',
      ),
    ).toHaveLength(pushed);
    unmount();
  });

  it('swaps the built-in status-bar panels for provider-backed ones', () => {
    const p = provider();
    const { unmount } = render(
      <MarketsGridSsrmSurface
        gridRef={{ current: null }}
        gridOptions={{}}
        hostOverrideKeys={new Set(['statusBar'])}
        theme={undefined}
        columnDefs={[{ field: 'desk' }]}
        statusBar={{
          statusPanels: [
            { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
            { statusPanel: 'agAggregationComponent', align: 'right' },
          ],
        }}
        onGridReady={vi.fn()}
        onGridPreDestroyed={vi.fn()}
        ssrm={{ provider: p }}
      />,
    );
    const bar = (readyApi.setGridOption as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === 'statusBar',
    )?.[1] as {
      statusPanels: Array<{ statusPanel: unknown; statusPanelParams?: { provider?: unknown } }>;
    };
    expect(typeof bar.statusPanels[0].statusPanel).toBe('function');
    expect(bar.statusPanels[0].statusPanelParams?.provider).toBe(p);
    expect(typeof bar.statusPanels[1].statusPanel).toBe('function');
    unmount();
  });

  it('forces Advanced Filter off and remaps multi-row select-all', () => {
    const p = provider();
    const { unmount } = render(
      <MarketsGridSsrmSurface
        gridRef={{ current: null }}
        gridOptions={{
          enableAdvancedFilter: true,
          rowSelection: { mode: 'multiRow', checkboxes: true, headerCheckbox: true },
        }}
        hostOverrideKeys={new Set()}
        theme={undefined}
        columnDefs={[
          { field: 'desk' },
          { colId: 'calc', context: { staruiVirtual: true }, sortable: true, filter: true },
        ]}
        onGridReady={vi.fn()}
        onGridPreDestroyed={vi.fn()}
        ssrm={{ provider: p }}
      />,
    );
    expect(lastGridProps.current?.enableAdvancedFilter).toBe(false);
    expect(lastGridProps.current?.rowSelection).toEqual({
      mode: 'multiRow',
      checkboxes: true,
      headerCheckbox: true,
      selectAll: 'all',
    });
    expect(typeof lastGridProps.current?.sendToClipboard).toBe('function');
    const cols = lastGridProps.current?.columnDefs as Array<Record<string, unknown>>;
    expect(cols[1].sortable).toBe(false);
    expect(cols[1].filter).toBe(false);
    unmount();
  });
});
