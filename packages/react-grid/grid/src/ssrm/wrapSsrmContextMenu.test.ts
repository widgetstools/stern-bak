import { describe, expect, it, vi } from 'vitest';

const { exportVisualExcel } = vi.hoisted(() => ({ exportVisualExcel: vi.fn() }));
vi.mock('../customizer/modules/visual-excel/exportVisualExcel.js', () => ({
  exportVisualExcel,
}));

import { wrapSsrmContextMenu } from './wrapSsrmContextMenu.js';

describe('wrapSsrmContextMenu', () => {
  it('replaces native excel/csv export with the drain path', () => {
    const api = { id: 'api' };
    const menu = wrapSsrmContextMenu((params) => params.defaultItems ?? []);
    const items = menu({
      api,
      defaultItems: ['copy', 'excelExport', 'csvExport'],
    } as never);
    expect(items[0]).toBe('copy');
    const excel = items[1] as { name: string; action: () => void };
    const csv = items[2] as { name: string; action: () => void };
    expect(excel.name).toBe('Export to Excel');
    expect(csv.name).toBe('Export to CSV');
    excel.action();
    csv.action();
    expect(exportVisualExcel).toHaveBeenCalledTimes(2);
    expect(exportVisualExcel).toHaveBeenNthCalledWith(2, api, expect.any(Object), { format: 'csv' });
  });

  it('wraps AG Grid\'s own default menu when no inner callback is configured', () => {
    const api = { id: 'api' };
    const menu = wrapSsrmContextMenu();
    const items = menu({ api, defaultItems: ['excelExport', 'separator'] } as never);
    expect((items[0] as { name: string }).name).toBe('Export to Excel');
    expect(items[1]).toBe('separator');
  });

  it('returns an empty menu when there are no default items to wrap', () => {
    // `defaultItems` is optional on the AG Grid params — a column with no
    // default menu would otherwise blow up inside `.map`.
    const menu = wrapSsrmContextMenu();
    expect(menu({ api: {} } as never)).toEqual([]);
  });
});
