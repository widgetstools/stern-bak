import { describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import React, { createRef } from 'react';
import type { AgGridReact } from 'ag-grid-react';

vi.mock('./MarketsGridSurface.js', () => ({
  MarketsGridSurface: () => React.createElement('div', { 'data-testid': 'csrm-surface' }),
}));

vi.mock('./MarketsGridSsrmSurface.js', () => ({
  MarketsGridSsrmSurface: () => React.createElement('div', { 'data-testid': 'ssrm-surface' }),
}));

vi.mock('./useSsrmExpressionBridge.js', () => ({
  useSsrmExpressionBridge: vi.fn(),
}));

vi.mock('./useGridHost.js', () => ({
  useGridHost: () => ({
    platform: { api: { api: null, onReady: () => () => undefined } },
    columnDefs: [],
    gridOptions: {},
    onGridReady: vi.fn(),
    onGridPreDestroyed: vi.fn(),
  }),
}));

vi.mock('./useGeneralSettingsSnapshot.js', () => ({
  useGeneralSettingsSnapshot: () => undefined,
}));

vi.mock('./theme/useGridTheme.js', () => ({
  useGridTheme: () => undefined,
}));

vi.mock('./ensureAgGridModules.js', () => ({
  ensureAgGridModules: vi.fn(),
}));

vi.mock('./resolveMarketsGridHost.js', () => ({
  resolveMarketsGridHost: () => ({}),
}));

import { MarketsGridCore } from './MarketsGrid.js';
import { ensureAgGridModules } from './ensureAgGridModules.js';

describe('MarketsGridCore SSRM routing', () => {
  // Roadmap Phase 7 / T3-13: the host's `agGridModules` reaches the global
  // registry under SSRM exactly as it does under CSRM. The surface no longer
  // hands the grid instance its own `[AllEnterpriseModule]`, which used to
  // make a reduced list inert.
  it('registers the host agGridModules for a server-side grid', () => {
    const provider = { id: 'p-modules' } as never;
    const agGridModules = [{ moduleName: 'ServerSideRowModelModule' }] as never;
    vi.mocked(ensureAgGridModules).mockClear();

    render(
      <MarketsGridCore
        gridId="g-modules"
        ssrm={{ provider, keyColumn: 'id' }}
        agGridModules={agGridModules}
        columnDefs={[]}
        rowData={[]}
      />,
    );

    expect(ensureAgGridModules).toHaveBeenCalledWith(agGridModules);
  });

  it('mounts MarketsGridSsrmSurface when ssrm.provider is set', async () => {
    const provider = { id: 'p-core' } as never;
    const gridRef = createRef<AgGridReact>();

    const { getByTestId, queryByTestId } = render(
      <MarketsGridCore
        ref={gridRef}
        gridId="g-core"
        ssrm={{ provider, keyColumn: 'id' }}
        columnDefs={[]}
        rowData={[]}
      />,
    );

    await waitFor(() => {
      expect(getByTestId('ssrm-surface')).toBeInTheDocument();
      expect(queryByTestId('csrm-surface')).toBeNull();
    });
  });
});
