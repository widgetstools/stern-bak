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
  exportDrainedRowsAsExcel,
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

  it('excludes rows un-ticked after a header select-all', () => {
    const api = {
      getServerSideSelectionState: () => ({ selectAll: true, toggledNodes: ['a'] }),
      getGridOption: (k: string) => (k === 'getRowId' ? (p: { data: { id: string } }) => p.data.id : undefined),
    } as unknown as GridApi;
    expect(filterSsrmExportSelection(api, [{ id: 'a' }, { id: 'b' }])).toEqual([{ id: 'b' }]);
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

describe('filterSsrmExportSelection — group (groupSelects) state', () => {
  const groupApi = (state: unknown, groupCols: string[]) => ({
    getServerSideSelectionState: () => state,
    getRowGroupColumns: () => groupCols.map((id) => ({ getColId: () => id })),
    getGridOption: (k: string) => (k === 'getRowId' ? (p: { data: { id: string } }) => p.data.id : undefined),
  } as unknown as GridApi);

  it('resolves each row through its group chain', () => {
    // `selectAllChildren` at the root, with EUR toggled off underneath it.
    const state = {
      selectAllChildren: true,
      toggledNodes: [{ nodeId: 'EUR', selectAllChildren: false }],
    };
    const rows = [
      { id: 'a', ccy: 'USD' },
      { id: 'b', ccy: 'EUR' },
      { id: 'c', ccy: 'USD' },
    ];
    expect(filterSsrmExportSelection(groupApi(state, ['ccy']), rows))
      .toEqual([{ id: 'a', ccy: 'USD' }, { id: 'c', ccy: 'USD' }]);
  });

  it('falls through to the flat path when the tree cannot be resolved', () => {
    // No row-group columns: `filterRowsByGroupSelection` returns null for
    // "unknowable", and the export must not silently ship the whole book —
    // it drops to the loaded-node walk, which here selects nothing.
    const state = { selectAllChildren: true, toggledNodes: [] };
    const api = {
      getServerSideSelectionState: () => state,
      getRowGroupColumns: () => [],
      getSelectedNodes: () => [],
    } as unknown as GridApi;
    expect(filterSsrmExportSelection(api, [{ id: 'a' }])).toEqual([]);
  });

  it('treats a missing getRowGroupColumns as no grouping', () => {
    const api = {
      getServerSideSelectionState: () => ({ selectAllChildren: true }),
      getSelectedNodes: () => [{ id: 'a' }],
    } as unknown as GridApi;
    expect(filterSsrmExportSelection(api, [{ id: 'a' }, { id: 'b' }])).toEqual([{ id: 'a' }]);
  });
});

describe('filterSsrmExportSelection — identity fallbacks', () => {
  it('identifies rows by `row.id` when the grid has no getRowId', () => {
    const api = {
      getServerSideSelectionState: () => ({ selectAll: true, toggledNodes: ['a'] }),
    } as unknown as GridApi;
    expect(filterSsrmExportSelection(api, [{ id: 'a' }, { id: 'b' }])).toEqual([{ id: 'b' }]);
  });

  it('ignores non-string entries in toggledNodes', () => {
    const api = {
      getServerSideSelectionState: () => ({ selectAll: true, toggledNodes: [42, null] }),
    } as unknown as GridApi;
    const rows = [{ id: 'a' }];
    // Nothing usable to exclude, so the drained book passes through whole.
    expect(filterSsrmExportSelection(api, rows)).toBe(rows);
  });

  it('exports nothing when neither selection API answers', () => {
    // An un-selected export with `onlySelected` is an empty file, never the
    // whole book — shipping the book here is the bug this guards.
    const api = {} as unknown as GridApi;
    expect(filterSsrmExportSelection(api, [{ id: 'a' }])).toEqual([]);
  });

  it('ignores selected nodes with no usable id', () => {
    const api = {
      getServerSideSelectionState: () => ({}),
      getSelectedNodes: () => [{ id: '' }, { id: undefined }],
    } as unknown as GridApi;
    expect(filterSsrmExportSelection(api, [{ id: 'a' }])).toEqual([]);
  });
});

describe('exportDrainedRowsAsExcel', () => {
  beforeEach(() => {
    createGrid.mockClear();
    exportDataAsExcel.mockClear();
    exportDataAsCsv.mockClear();
    destroy.mockClear();
    document.body.innerHTML = '';
  });

  const settings = INITIAL_VISUAL_EXCEL.settings;

  it('refuses outside a document rather than throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('document', undefined);
    try {
      exportDrainedRowsAsExcel({} as unknown as GridApi, [{ id: 'a' }], settings);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(createGrid).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('needs a document'));
  });

  it('tears the scratch grid and its host down even when the export throws', () => {
    exportDataAsExcel.mockImplementationOnce(() => { throw new Error('writer blew up'); });
    const api = { getColumnDefs: () => [{ field: 'id' }] } as unknown as GridApi;

    expect(() => exportDrainedRowsAsExcel(api, [{ id: 'a' }], settings)).toThrow('writer blew up');
    // A leaked off-screen grid keeps its own listeners and row model alive.
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector('div')).toBeNull();
  });

  it('copes with a source grid that answers neither getColumnDefs nor defaultColDef', () => {
    exportDrainedRowsAsExcel({} as unknown as GridApi, [{ id: 'a' }], settings);
    expect(createGrid).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ columnDefs: [], defaultColDef: undefined }),
    );
  });

  it('uses the caller-supplied file name over the generated one', () => {
    exportDrainedRowsAsExcel({} as unknown as GridApi, [], settings, { fileName: 'book.xlsx' });
    expect(exportDataAsExcel).toHaveBeenCalledWith(
      expect.objectContaining({ fileName: 'book.xlsx', exportedRows: 'filteredAndSorted' }),
    );
  });

  /**
   * The cell callback is what keeps the exported file reading like the grid:
   * a formatted price must not land in the sheet as a raw float, and a null
   * must land as an empty cell rather than the string "null".
   */
  it('writes each cell through the column formatter, and blanks nullish values', () => {
    exportDrainedRowsAsExcel({} as unknown as GridApi, [], settings);
    const { processCellCallback } = exportDataAsExcel.mock.calls[0][0] as {
      processCellCallback: (p: { value: unknown; formatValue?: (v: unknown) => unknown }) => string;
    };
    expect(processCellCallback({ value: 1.5, formatValue: (v) => `${v as number}%` })).toBe('1.5%');
    expect(processCellCallback({ value: 'raw' })).toBe('raw');
    expect(processCellCallback({ value: null })).toBe('');
    expect(processCellCallback({ value: undefined })).toBe('');
    // A formatter that returns nothing falls back to the raw value, not ''.
    expect(processCellCallback({ value: 7, formatValue: () => undefined })).toBe('7');
  });
});
