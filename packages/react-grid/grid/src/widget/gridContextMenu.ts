/**
 * gridContextMenu — builds AG-Grid's cell right-click menu for MarketsGrid.
 *
 * Two MarketsGrid-specific items are prepended (with a separator) ahead of
 * AG-Grid's stock entries (Copy / Copy with Headers / Export / Auto-size …):
 *
 *   1. **Settings** — opens the grid customizer on the Column Settings
 *      module with the clicked cell's column pre-selected, so the user lands
 *      straight on that column's editor. Routed through `openColumnSettings`,
 *      a host callback (the customizer lives in React state, not the grid).
 *   2. **Remove from Grid** — hides the clicked column via the native AG-Grid
 *      visibility API (`api.setColumnsVisible`). This is the SAME mechanism as
 *      unchecking the column in the side bar's Columns tool panel, so the
 *      column reappears in that panel as unchecked and the user can re-show it
 *      there; the change rides the normal grid-state save path on Save.
 *
 * The custom items are only added when the right-click resolves to a real
 * column (one with a colId). Right-clicks that don't (e.g. an empty area)
 * fall through to AG-Grid's default menu unchanged.
 *
 * The builder is a pure function of its params + handlers so it can be unit
 * tested without mounting a grid; the host wires the live handlers in.
 */
import type {
  DefaultMenuItem,
  GetContextMenuItemsParams,
  MenuItemDef,
} from 'ag-grid-community';

/** Live handlers the host supplies (React-side side effects). */
export interface GridContextMenuHandlers {
  /** Open the customizer's Column Settings module focused on `colId`. */
  openColumnSettings: (colId: string) => void;
}

// AG-Grid renders a menu item's `icon` as raw HTML in the icon slot (left of
// the label). These lucide-shaped SVGs use `currentColor` so they inherit the
// menu item's themed text colour — dark/light safe, no hardcoded hex.
const svgIcon = (inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" ` +
  `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ` +
  `stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

/** lucide `settings` (gear). */
const SETTINGS_ICON = svgIcon(
  '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
);

/** lucide `eye-off` — "hide" (the column is removed from view, not deleted; it
 *  stays re-showable from the side bar's Columns panel). */
const REMOVE_ICON = svgIcon(
  '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>',
);

export function buildGridContextMenuItems(
  params: GetContextMenuItemsParams,
  handlers: GridContextMenuHandlers,
): (DefaultMenuItem | MenuItemDef)[] {
  const defaults = params.defaultItems ?? [];
  const colId = params.column?.getColId();
  if (!colId) return defaults;

  const custom: (DefaultMenuItem | MenuItemDef)[] = [
    {
      name: 'Settings',
      icon: SETTINGS_ICON,
      action: () => handlers.openColumnSettings(colId),
    },
    {
      name: 'Remove from Grid',
      icon: REMOVE_ICON,
      action: () => params.api.setColumnsVisible([colId], false),
    },
  ];

  // Prepend the MarketsGrid items, then a separator, then the stock menu.
  return defaults.length > 0 ? [...custom, 'separator', ...defaults] : custom;
}
