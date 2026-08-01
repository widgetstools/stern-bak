import { describe, expect, it, vi } from 'vitest';
import type { GridApi } from 'ag-grid-community';
import { INITIAL_VISUAL_EXCEL } from '@wellsfargo-starui/engine';
import { exportVisualExcel } from './exportVisualExcel';

describe('exportVisualExcel', () => {
  it('delegates to AG-Grid exportDataAsExcel with formatter callback', () => {
    const exportDataAsExcel = vi.fn();
    const api = { exportDataAsExcel } as unknown as GridApi;

    exportVisualExcel(api, INITIAL_VISUAL_EXCEL.settings);

    expect(exportDataAsExcel).toHaveBeenCalledWith(expect.objectContaining({
      author: 'MarketsGrid',
      exportedRows: 'filteredAndSorted',
      onlySelected: false,
      processCellCallback: expect.any(Function),
    }));

    const args = exportDataAsExcel.mock.calls[0]![0];
    expect(args.processCellCallback({ formatValue: (v: unknown) => `fmt:${v}`, value: 42 }))
      .toBe('fmt:42');
  });

  it('honours custom fileName and onlySelected options', () => {
    const exportDataAsExcel = vi.fn();
    const api = { exportDataAsExcel } as unknown as GridApi;

    exportVisualExcel(api, INITIAL_VISUAL_EXCEL.settings, {
      fileName: 'custom.xlsx',
      onlySelected: true,
      exportedRows: 'all',
    });

    expect(exportDataAsExcel).toHaveBeenCalledWith(expect.objectContaining({
      fileName: 'custom.xlsx',
      onlySelected: true,
      exportedRows: 'all',
    }));
  });
});
