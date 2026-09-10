import { describe, expect, it, vi } from 'vitest';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import type { GridApi } from 'ag-grid-community';
import {
  drainSsrmRows,
  SSRM_EXPORT_MAX_ROWS,
  SsrmExportTooLargeError,
  ssrmExportRequestFromApi,
} from './drainSsrmRows.js';

function provider(overrides: Partial<ISsrmDataProvider> = {}): ISsrmDataProvider {
  return {
    id: 'p',
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
    getColumnValues: vi.fn(),
    getRowCount: vi.fn(async () => ({ rowCount: 0 })),
    getAggregates: vi.fn(),
    watchGroups: vi.fn(),
    onSsrmTick: vi.fn(() => () => undefined),
    onRefresh: vi.fn(() => () => undefined),
    onRowsReceived: vi.fn(() => () => undefined),
    onStatus: vi.fn(() => () => undefined),
    onError: vi.fn(() => () => undefined),
    ...overrides,
  };
}

describe('ssrmExportRequestFromApi', () => {
  it('reads live filter, sort, and quick filter — no grouping', () => {
    const api = {
      getFilterModel: () => ({ desk: { filterType: 'text', type: 'equals', filter: 'A' } }),
      getColumnState: () => [
        { colId: 'px', sort: 'desc', sortIndex: 1 },
        { colId: 'desk', sort: 'asc', sortIndex: 0 },
        { colId: 'qty' },
      ],
      getGridOption: (key: string) => (key === 'quickFilterText' ? 'abc' : undefined),
    } as unknown as GridApi;
    expect(ssrmExportRequestFromApi(api)).toEqual({
      filterModel: { desk: { filterType: 'text', type: 'equals', filter: 'A' } },
      sortModel: [
        { colId: 'desk', sort: 'asc' },
        { colId: 'px', sort: 'desc' },
      ],
      quickFilterText: 'abc',
    });
  });
});

describe('drainSsrmRows', () => {
  it('refuses when getRowCount exceeds the cap', async () => {
    const p = provider({
      getRowCount: vi.fn(async () => ({ rowCount: SSRM_EXPORT_MAX_ROWS + 1 })),
    });
    await expect(drainSsrmRows(p, {})).rejects.toBeInstanceOf(SsrmExportTooLargeError);
    expect(p.getRows).not.toHaveBeenCalled();
  });

  it('pages until the engine reports the last block', async () => {
    const p = provider({
      getRowCount: vi.fn(async () => ({ rowCount: 2 })),
      getRows: vi.fn(async (req) => {
        if ((req.startRow ?? 0) === 0) {
          return { rowData: [{ id: 'a' }], rowCount: 2 };
        }
        return { rowData: [{ id: 'b' }], rowCount: 2 };
      }),
    });
    const rows = await drainSsrmRows(p, {}, 10);
    expect(rows).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('refuses when a page reports a total above the cap', async () => {
    const p = provider({
      getRowCount: vi.fn(async () => ({ rowCount: 1 })),
      getRows: vi.fn(async () => ({ rowData: [{ id: 'a' }], rowCount: 9 })),
    });
    await expect(drainSsrmRows(p, {}, 5)).rejects.toBeInstanceOf(SsrmExportTooLargeError);
  });
});
