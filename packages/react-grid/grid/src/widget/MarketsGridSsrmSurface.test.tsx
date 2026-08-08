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
vi.mock('../ssrm/createSsrmStatusBar.js', () => ({
  createSsrmStatusBar: () => ({ statusBar: { statusPanels: [] }, context: {} }),
}));
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
