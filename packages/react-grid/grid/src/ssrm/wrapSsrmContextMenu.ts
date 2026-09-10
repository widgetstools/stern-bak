import type {
  DefaultMenuItem,
  GetContextMenuItems,
  GetContextMenuItemsParams,
  MenuItemDef,
} from 'ag-grid-community';
import { INITIAL_VISUAL_EXCEL } from '@wellsfargo-starui/core';
import { exportVisualExcel } from '../customizer/modules/visual-excel/exportVisualExcel.js';

type MenuItem = DefaultMenuItem | MenuItemDef;

function replaceExportItem(item: MenuItem, params: GetContextMenuItemsParams): MenuItem {
  if (item === 'excelExport') {
    return {
      name: 'Export to Excel',
      action: () => {
        void exportVisualExcel(params.api, INITIAL_VISUAL_EXCEL.settings);
      },
    };
  }
  if (item === 'csvExport') {
    return {
      name: 'Export to CSV',
      action: () => {
        void exportVisualExcel(params.api, INITIAL_VISUAL_EXCEL.settings, { format: 'csv' });
      },
    };
  }
  return item;
}

/** Native Excel/CSV export is cache-only under SSRM — route through the drain. */
export function wrapSsrmContextMenu(inner?: GetContextMenuItems): GetContextMenuItems {
  return (params) => {
    const raw = inner ? inner(params) : (params.defaultItems ?? []);
    return (raw as MenuItem[]).map((item) => replaceExportItem(item, params));
  };
}
