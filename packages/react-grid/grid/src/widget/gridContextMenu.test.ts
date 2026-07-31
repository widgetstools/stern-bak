import { describe, it, expect, vi } from 'vitest';
import type { GetContextMenuItemsParams, MenuItemDef } from 'ag-grid-community';
import { buildGridContextMenuItems } from './gridContextMenu';

function makeParams(
  overrides: Partial<GetContextMenuItemsParams> = {},
): GetContextMenuItemsParams {
  return {
    column: { getColId: () => 'price' },
    api: { setColumnsVisible: vi.fn() },
    defaultItems: ['copy', 'copyWithHeaders', 'export'],
    ...overrides,
  } as unknown as GetContextMenuItemsParams;
}

describe('buildGridContextMenuItems', () => {
  it('prepends Settings + Remove from Grid, a separator, then the defaults', () => {
    const items = buildGridContextMenuItems(makeParams(), { openColumnSettings: vi.fn() });
    const names = items.map((i) => (typeof i === 'string' ? i : i.name));
    expect(names).toEqual([
      'Settings',
      'Remove from Grid',
      'separator',
      'copy',
      'copyWithHeaders',
      'export',
    ]);
  });

  it('gives the custom items a currentColor SVG icon (theme-safe)', () => {
    const items = buildGridContextMenuItems(makeParams(), { openColumnSettings: vi.fn() });
    const custom = items.filter(
      (i): i is MenuItemDef =>
        typeof i !== 'string' && (i.name === 'Settings' || i.name === 'Remove from Grid'),
    );
    expect(custom).toHaveLength(2);
    for (const item of custom) {
      expect(item.icon).toMatch(/^<svg[\s\S]*<\/svg>$/);
      expect(item.icon).toContain('stroke="currentColor"');
    }
  });

  it('Settings action opens the column settings for the clicked column', () => {
    const openColumnSettings = vi.fn();
    const items = buildGridContextMenuItems(makeParams(), { openColumnSettings });
    const settings = items.find((i) => typeof i !== 'string' && i.name === 'Settings') as MenuItemDef;
    settings.action?.({} as never);
    expect(openColumnSettings).toHaveBeenCalledWith('price');
  });

  it('Remove from Grid hides the clicked column via the native visibility API', () => {
    const setColumnsVisible = vi.fn();
    const params = makeParams({ api: { setColumnsVisible } as never });
    const items = buildGridContextMenuItems(params, { openColumnSettings: vi.fn() });
    const remove = items.find(
      (i) => typeof i !== 'string' && i.name === 'Remove from Grid',
    ) as MenuItemDef;
    remove.action?.({} as never);
    expect(setColumnsVisible).toHaveBeenCalledWith(['price'], false);
  });

  it('returns the default menu unchanged when the click has no column', () => {
    const items = buildGridContextMenuItems(makeParams({ column: null }), {
      openColumnSettings: vi.fn(),
    });
    expect(items).toEqual(['copy', 'copyWithHeaders', 'export']);
  });

  it('omits the separator when there are no default items', () => {
    const items = buildGridContextMenuItems(makeParams({ defaultItems: [] }), {
      openColumnSettings: vi.fn(),
    });
    const names = items.map((i) => (typeof i === 'string' ? i : i.name));
    expect(names).toEqual(['Settings', 'Remove from Grid']);
  });
});
