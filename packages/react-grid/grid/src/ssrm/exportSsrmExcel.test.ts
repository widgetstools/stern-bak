/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import type { ISsrmDataProvider } from '@wellsfargo-starui/data';
import { INITIAL_VISUAL_EXCEL } from '@wellsfargo-starui/core';

const exportDataAsExcel = vi.fn();
const exportDataAsCsv = vi.fn();
const destroy = vi.fn();
const createGrid = vi.fn(() => ({ exportDataAsExcel, exportDataAsCsv, destroy }));

vi.mock('ag-grid-community', () => ({
  createGrid: (...args: unknown[]) => createGrid(...args),
}));

import { attachSsrmSession } from './ssrmSession.js';
import {
  exportSsrmVisualExcel,
  filterSsrmExportSelection,
} from './exportSsrmExcel.js';

function provider(rows: Record<string, unknown>[]): ISsrmDataProvider {
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
    getRows: vi.fn(async () => ({ rowData: rows, rowCount: rows.length })),
    getColumnValues: vi.fn(),
    getRowCount: vi.fn(async () => ({ rowCount: rows.length })),
    getAggregates: vi.fn(),
    watchGroups: vi.fn(),
    onSsrmTick: vi.fn(() => () => undefined),
    onRefresh: vi.fn(() => () => undefined),
    onRowsReceived: vi.fn(() => () => undefined),
    onStatus: vi.fn(() => () => undefined),
    onError: vi.fn(() => () => undefined),
  };
}

describe('exportSsrmVisualExcel', () => {
  beforeEach(() => {
    createGrid.mockClear();
    exportDataAsExcel.mockClear();
    exportDataAsCsv.mockClear();
    destroy.mockClear();
  });

  it('refuses when no engine session is attached', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const api = {
      getGridOption: (k: string) => (k === 'rowModelType' ? 'serverSide' : undefined),
      exportDataAsExcel: vi.fn(),
    } as unknown as GridApi;
    await exportSsrmVisualExcel(api, INITIAL_VISUAL_EXCEL.settings);
    expect(createGrid).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no engine session'));
    warn.mockRestore();
  });

  it('drains the filtered book onto a hidden grid then destroys it', async () => {
    const api = {
      getGridOption: (k: string) => (k === 'rowModelType' ? 'serverSide' : undefined),
      getFilterModel: () => null,
      getColumnState: () => [],
      getColumnDefs: () => [{ field: 'id' }],
    } as unknown as GridApi;
    attachSsrmSession(api, provider([{ id: '1' }, { id: '2' }]));
    await exportSsrmVisualExcel(api, INITIAL_VISUAL_EXCEL.settings);
    expect(createGrid).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({
        rowData: [{ id: '1' }, { id: '2' }],
        columnDefs: [{ field: 'id' }],
      }),
    );
    expect(exportDataAsExcel).toHaveBeenCalled();
    expect(destroy).toHaveBeenCalled();
  });

  it('writes CSV when format is csv', async () => {
    const api = {
      getGridOption: () => undefined,
      getFilterModel: () => null,
      getColumnState: () => [],
      getColumnDefs: () => [],
    } as unknown as GridApi;
    attachSsrmSession(api, provider([{ id: '1' }]));
    await exportSsrmVisualExcel(api, INITIAL_VISUAL_EXCEL.settings, { format: 'csv' });
    expect(exportDataAsCsv).toHaveBeenCalled();
  });
});

describe('filterSsrmExportSelection', () => {
  it('keeps the drained book when selectAll is set', () => {
    const api = {
      getServerSideSelectionState: () => ({ selectAll: true }),
    } as unknown as GridApi;
    const rows = [{ id: 'a' }];
    expect(filterSsrmExportSelection(api, rows)).toBe(rows);
  });

  it('filters drained rows to selected node ids', () => {
    const api = {
      getServerSideSelectionState: () => ({}),
      getSelectedNodes: () => [{ id: 'b' }],
      getGridOption: (k: string) => (k === 'getRowId' ? (p: { data: { id: string } }) => p.data.id : undefined),
    } as unknown as GridApi;
    expect(filterSsrmExportSelection(api, [{ id: 'a' }, { id: 'b' }])).toEqual([{ id: 'b' }]);
  });
});
