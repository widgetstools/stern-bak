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

describe('MarketsGridCore SSRM routing', () => {
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
