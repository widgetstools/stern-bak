/**
 * @vitest-environment jsdom
 *
 * AG Grid default status bar parity: totalAndFiltered (left), total /
 * filtered / selected (center), aggregation (right). Counts come from the
 * worker — the native count components only see the client row model, which
 * under SSRM never knows the unfiltered cache total.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import {
  createSsrmStatusBar,
  SsrmTotalRowsStatusPanel,
  SsrmFilteredRowsStatusPanel,
} from './createSsrmStatusBar.js';

const provider = {
  getStatusBar: vi.fn(async () => ({
    totalRows: 20_000,
    filteredRows: 1_234,
    selectedRows: 0,
    aggregations: [],
    revision: 1,
  })),
} as never;

const api = { isDestroyed: () => false, getFilterModel: () => ({}) } as never;

describe('createSsrmStatusBar default parity', () => {
  it('produces AG Grid\'s default five-panel arrangement', () => {
    const { statusBar } = createSsrmStatusBar({ provider });
    const panels = statusBar.statusPanels.map((p) => [
      p.key,
      typeof p.statusPanel === 'string' ? p.statusPanel : 'custom',
      p.align,
    ]);
    expect(panels).toEqual([
      ['ssrm-rows', 'custom', 'left'],
      ['ssrm-total-rows', 'custom', 'center'],
      ['ssrm-filtered-rows', 'custom', 'center'],
      ['ssrm-selected', 'agSelectedRowCountComponent', 'center'],
      ['ssrm-aggregation', 'agAggregationComponent', 'right'],
    ]);
  });

  it('Total Rows panel shows the worker cache total with AG Grid markup', async () => {
    render(<SsrmTotalRowsStatusPanel api={api} provider={provider} />);
    await waitFor(() => expect(screen.getByText('20,000')).toBeInTheDocument());
    expect(screen.getByText('Total Rows')).toBeInTheDocument();
    expect(document.querySelector('.ag-status-panel-total-row-count')).toBeTruthy();
  });

  it('Filtered Rows panel shows the worker filtered count', async () => {
    render(<SsrmFilteredRowsStatusPanel api={api} provider={provider} />);
    await waitFor(() => expect(screen.getByText('1,234')).toBeInTheDocument());
    expect(screen.getByText('Filtered Rows')).toBeInTheDocument();
    expect(document.querySelector('.ag-status-panel-filtered-row-count')).toBeTruthy();
  });
});
