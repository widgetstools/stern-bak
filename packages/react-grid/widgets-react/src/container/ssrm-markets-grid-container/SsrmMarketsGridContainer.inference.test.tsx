import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';

/**
 * Column resolution — declared and inferred.
 *
 * Providers whose config declares no `columnDefinitions` (createStarui
 * drafts) get their columns inferred from a sampled block; a declared list
 * always wins and skips the sample fetch. Since roadmap Phase 9 both go
 * through ONE mapping path, so the rest of these cases are about what
 * survives it (T3-1).
 */

const { getRows, providerRef, resetProvider, state } = vi.hoisted(() => {
  const getRows = vi.fn();
  const state = { declaredDefs: [] as Array<Record<string, unknown>> };
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

const captured = vi.hoisted(() => ({ colDefs: [] as Array<Record<string, unknown>> }));

vi.mock('@wellsfargo-starui/grid/core', () => ({
  MarketsGrid: (props: { columnDefs?: Array<Record<string, unknown>> }) => {
    captured.colDefs = props.columnDefs ?? [];
    return React.createElement('div', {
      'data-testid': 'markets-grid',
      'data-col-fields': (props.columnDefs ?? []).map((c) => c.field).join(','),
      'data-col-headers': (props.columnDefs ?? []).map((c) => c.headerName).join('|'),
    });
  },
  toSsrmExpressionRules: vi.fn(() => []),
  createMarketsGridContainerEventBus: () => ({ emit: vi.fn(), on: vi.fn(() => () => {}) }),
  MARKETS_GRID_EVENT_CATALOG: [],
  useMarketsGridEventBridge: vi.fn(),
}));

vi.mock('@wellsfargo-starui/react/data/runtime', () => ({
  useDataServices: () => ({
    client: {
      isProviderRunning: async () => true,
      waitForProviderRunning: async () => true,
    },
  }),
  useDataProvidersList: () => ({ configs: [], loading: false, refresh: () => {} }),
  useAppDataStore: () => ({
    store: { get: vi.fn(), set: vi.fn(), list: () => [], subscribe: () => () => {} },
  }),
  useSsrmDataProvider: () => ({ provider: providerRef.current, error: undefined }),
}));

vi.mock('./useSsrmProviderDataWiring.js', () => ({
  useSsrmProviderDataWiring: () => ({ ready: true }),
}));

vi.mock('../markets-grid-container/ProviderEditorDialog.js', () => ({
  ProviderEditorDialog: () => null,
}));

vi.mock('../markets-grid-container/ConfigBrowserDialog.js', () => ({
  ConfigBrowserDialog: () => null,
}));

import { SsrmMarketsGridContainer } from './SsrmMarketsGridContainer.js';

afterEach(() => {
  cleanup();
  getRows.mockReset();
  state.declaredDefs = [];
  captured.colDefs = [];
  resetProvider();
});

/** First tab of the multi-filter envelope `buildColumnDefs` installs. */
function firstFilterTab(def: Record<string, unknown> | undefined): string | undefined {
  const params = def?.filterParams as { filters?: Array<{ filter?: string }> } | undefined;
  return params?.filters?.[0]?.filter;
}

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

/**
 * T3-1. The declared path used to cherry-pick five members before
 * `buildColumnDefs`, so a provider that DECLARED its columns got worse
 * typing than one that declared none — and the inferred path never reached
 * `buildColumnDefs` at all.
 */
describe('SsrmMarketsGridContainer declared column fidelity', () => {
  it('carries a declared cellDataType into the first multi-filter tab', async () => {
    state.declaredDefs = [
      { field: 'qty', headerName: 'Qty', cellDataType: 'number' },
      { field: 'tradeDate', headerName: 'Trade Date', cellDataType: 'dateString' },
      { field: 'ticker', headerName: 'Ticker', cellDataType: 'text' },
    ];
    render(<SsrmMarketsGridContainer providerId="stomp-ssrm-1" showProviderEditor={false} />);
    await waitFor(() => expect(captured.colDefs).toHaveLength(3));

    expect(captured.colDefs[0].cellDataType).toBe('number');
    expect(firstFilterTab(captured.colDefs[0])).toBe('agNumberColumnFilter');
    expect(firstFilterTab(captured.colDefs[1])).toBe('agDateColumnFilter');
    expect(firstFilterTab(captured.colDefs[2])).toBe('agTextColumnFilter');
    // Tab 2 is always the set filter — that is what carries the worker-backed
    // whole-domain values under SSRM.
    const params = captured.colDefs[0].filterParams as { filters: Array<{ filter: string }> };
    expect(params.filters[1].filter).toBe('agSetColumnFilter');
  });

  it('compiles a declared valueGetter expression instead of dropping it', async () => {
    state.declaredDefs = [
      { field: 'price', headerName: 'Price' },
      { field: 'notional', headerName: 'Notional', valueGetter: '[price] * [qty]' },
    ];
    render(<SsrmMarketsGridContainer providerId="stomp-ssrm-1" showProviderEditor={false} />);
    await waitFor(() => expect(captured.colDefs).toHaveLength(2));

    const getter = captured.colDefs[1].valueGetter;
    expect(typeof getter).toBe('function');
    expect((getter as (p: unknown) => unknown)({ data: { price: 4, qty: 3 } })).toBe(12);
  });

  it('keeps every other declared member the old re-map dropped', async () => {
    state.declaredDefs = [{
      field: 'ticker',
      headerName: 'Ticker',
      width: 140,
      hide: true,
      sortable: false,
      resizable: false,
      type: 'rightAligned',
      valueFormatter: 'value',
      cellRenderer: 'agAnimateShowChangeCellRenderer',
      filter: 'agTextColumnFilter',
    }];
    render(<SsrmMarketsGridContainer providerId="stomp-ssrm-1" showProviderEditor={false} />);
    await waitFor(() => expect(captured.colDefs).toHaveLength(1));

    const def = captured.colDefs[0];
    expect(def).toMatchObject({
      field: 'ticker',
      headerName: 'Ticker',
      width: 140,
      hide: true,
      sortable: false,
      resizable: false,
      type: 'rightAligned',
      valueFormatter: 'value',
      cellRenderer: 'agAnimateShowChangeCellRenderer',
    });
    // A column that declares its own filter keeps it — no multi-filter
    // envelope is imposed over a host/customizer choice.
    expect(def.filter).toBe('agTextColumnFilter');
    expect(def.filterParams).toBeUndefined();
  });

  it('installs the nested-path accessor for a dotted declared field', async () => {
    state.declaredDefs = [{ field: 'pnl.daily', headerName: 'Daily PnL' }];
    render(<SsrmMarketsGridContainer providerId="stomp-ssrm-1" showProviderEditor={false} />);
    await waitFor(() => expect(captured.colDefs).toHaveLength(1));

    const getter = captured.colDefs[0].valueGetter;
    expect(typeof getter).toBe('function');
    // The accessor tries the flat key first, then walks — AG-Grid's own
    // dot-walk cannot tell `row.pnl.daily` from `row['pnl.daily']`.
    expect((getter as (p: unknown) => unknown)({ data: { pnl: { daily: 7 } } })).toBe(7);
    expect((getter as (p: unknown) => unknown)({ data: { 'pnl.daily': 9 } })).toBe(9);
  });

  it('gives every SSRM column the grouping / pivot / value capabilities', async () => {
    state.declaredDefs = [{ field: 'book', headerName: 'Book' }];
    render(<SsrmMarketsGridContainer providerId="stomp-ssrm-1" showProviderEditor={false} />);
    await waitFor(() => expect(captured.colDefs).toHaveLength(1));
    expect(captured.colDefs[0]).toMatchObject({
      enableRowGroup: true,
      enablePivot: true,
      enableValue: true,
    });
  });

  // The inferred path used to skip `buildColumnDefs` entirely.
  it('runs inferred columns through the same path', async () => {
    getRows.mockResolvedValue({
      rowData: [{ positionId: 'POS-1', currentPrice: 99.5 }],
      rowCount: 1,
    });
    render(<SsrmMarketsGridContainer providerId="stomp-ssrm-1" showProviderEditor={false} />);
    await waitFor(() => expect(captured.colDefs).toHaveLength(2));

    expect(firstFilterTab(captured.colDefs[1])).toBe('agNumberColumnFilter');
    expect(captured.colDefs[0]).toMatchObject({ enableRowGroup: true });
  });
});
