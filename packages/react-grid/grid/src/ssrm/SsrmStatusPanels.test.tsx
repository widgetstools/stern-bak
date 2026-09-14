import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import {
  SsrmAggregationStatusPanel,
  SsrmTotalAndFilteredStatusPanel,
} from './SsrmStatusPanels.js';

function provider(): ISsrmDataProvider {
  return {
    getRowCount: vi.fn(async (req: { filterModel?: unknown }) => ({
      rowCount: req.filterModel ? 42 : 5000,
    })),
    getAggregates: vi.fn(async () => ({
      values: { marketValue_sum: 99.5, marketValue_count: 42, marketValue_avg: 2.4 },
    })),
  } as unknown as ISsrmDataProvider;
}

function api(column?: string): GridApi {
  return {
    getFilterModel: () => ({ desk: { filterType: 'set', values: ['Govies'] } }),
    getSelectedNodes: () => [],
    getCellRanges: () => (column ? [{ columns: [{ getColId: () => column }] }] : []),
    getValueColumns: () => [],
    getGridOption: () => undefined,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as GridApi;
}

describe('SsrmStatusPanels', () => {
  it('renders the CSRM total+filtered chrome with provider numbers', async () => {
    const { unmount } = render(
      <SsrmTotalAndFilteredStatusPanel api={api()} provider={provider()} />,
    );
    await waitFor(() => {
      expect(screen.getByText('5,000')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
    });
    expect(document.querySelector('.ag-status-panel-total-and-filtered-row-count')).toBeTruthy();
    unmount();
  });

  it('renders avg / count / sum from the provider and honours aggFuncs', async () => {
    const { unmount } = render(
      <SsrmAggregationStatusPanel
        api={api('marketValue')}
        provider={provider()}
        aggFuncs={['sum', 'count']}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('99.5')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
    });
    expect(screen.queryByText('avg:')).toBeNull();
    expect(document.querySelector('.ag-status-panel-aggregations')).toBeTruthy();
    unmount();
  });

  it('keeps aggregation labels mounted when no column is selected', () => {
    const { unmount } = render(
      <SsrmAggregationStatusPanel api={api()} provider={provider()} />,
    );
    expect(screen.getByText(/avg:/)).toBeInTheDocument();
    expect(screen.getByText(/sum:/)).toBeInTheDocument();
    expect(document.querySelector('.ag-status-panel-aggregations')).toBeTruthy();
    unmount();
  });
});
