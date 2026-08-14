import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';

/**
 * Column inference — providers whose config declares no columnDefinitions
 * (createStarui drafts) get their columns inferred from a sampled block.
 * A declared list always wins and skips the sample fetch.
 */

const { getRows, providerRef, resetProvider, state } = vi.hoisted(() => {
  const getRows = vi.fn();
  const state = { declaredDefs: [] as Array<{ field: string }> };
  const makeProvider = () =>
    ({
      id: 'stomp-ssrm-1',
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      getConfig: () => ({ keyColumn: 'positionId' }),
      getConfigOrNull: () => ({ keyColumn: 'positionId' }),
      getColumnDefs: () => state.declaredDefs,
      getRows,
      onStatus: vi.fn(() => () => undefined),
      onError: vi.fn(() => () => undefined),
      onRowsReceived: vi.fn(() => () => undefined),
    }) as unknown as ISsrmDataProvider;
  // One instance per test — a per-render instance would retrigger the
  // container's provider-rebind reset and starve the inference effect.
  const providerRef = { current: makeProvider() };
  return { getRows, providerRef, resetProvider: () => { providerRef.current = makeProvider(); }, state };
});

vi.mock('@wellsfargo-starui/grid', () => ({
  MarketsGrid: (props: { columnDefs?: Array<{ field?: string; headerName?: string }> }) =>
    React.createElement('div', {
      'data-testid': 'markets-grid',
      'data-col-fields': (props.columnDefs ?? []).map((c) => c.field).join(','),
      'data-col-headers': (props.columnDefs ?? []).map((c) => c.headerName).join('|'),
    }),
  toSsrmExpressionRules: vi.fn(() => []),
}));

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  useDataProvidersList: () => ({ configs: [], loading: false, refresh: () => {} }),
  useSsrmDataProvider: () => ({ provider: providerRef.current, error: undefined }),
}));

vi.mock('./useSsrmProviderDataWiring.js', () => ({
  useSsrmProviderDataWiring: () => ({ ready: true }),
}));

vi.mock('../markets-grid-container/ProviderEditorDialog.js', () => ({
  ProviderEditorDialog: () => null,
}));

import { SsrmMarketsGridContainer } from './SsrmMarketsGridContainer.js';

afterEach(() => {
  cleanup();
  getRows.mockReset();
  state.declaredDefs = [];
  resetProvider();
});

describe('SsrmMarketsGridContainer column inference', () => {
  it('infers columns from a sampled block when none are declared', async () => {
    getRows.mockResolvedValue({
      rowData: [
        {
          positionId: 'POS-1',
          ticker: 'TICK1',
          currentPrice: 99.5,
          active: true,
          __ssrmStyle: { color: 'red' },
        },
      ],
      rowCount: 1,
    });
    render(<SsrmMarketsGridContainer providerId="stomp-ssrm-1" showProviderEditor={false} />);

    await waitFor(() =>
      expect(screen.getByTestId('markets-grid')).toHaveAttribute(
        'data-col-fields',
        'positionId,ticker,currentPrice,active',
      ),
    );
    // Internal `__ssrm*` fields never become columns; headers humanize.
    expect(screen.getByTestId('markets-grid').getAttribute('data-col-headers')).toContain(
      'Current Price',
    );
    expect(getRows).toHaveBeenCalledWith({ startRow: 0, endRow: 50 });
  });

  it('prefers declared columnDefinitions and skips the sample fetch', async () => {
    state.declaredDefs = [{ field: 'declared' }];
    render(<SsrmMarketsGridContainer providerId="stomp-ssrm-1" showProviderEditor={false} />);

    await waitFor(() =>
      expect(screen.getByTestId('markets-grid')).toHaveAttribute('data-col-fields', 'declared'),
    );
    expect(getRows).not.toHaveBeenCalled();
  });
});
