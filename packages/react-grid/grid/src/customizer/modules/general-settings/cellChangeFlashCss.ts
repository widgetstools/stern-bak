import type { FlashColor } from '@wellsfargo-starui/engine';
import { FLASH_PALETTE } from '../conditional-styling/transforms';

export const CELL_CHANGE_FLASH_CSS_RULE_ID = 'cell-change-flash-color';
export const CELL_CHANGE_FLASH_CSS_HANDLE = 'general-settings-cell-flash';

/**
 * Scoped override for AG-Grid's `--ag-value-change-value-highlight-background-color`.
 * Per-grid via `[data-grid-id]` so multiple MarketsGrid instances on one page
 * can pick different flash colours from Grid Options.
 */
export function buildCellChangeFlashCss(gridId: string, color: FlashColor): string {
  const { light, dark } = FLASH_PALETTE[color];
  const sel = `[data-grid-id="${escapeAttr(gridId)}"] .ag-root-wrapper`;
  return `
html[data-theme="light"] ${sel},
html:not([data-theme="dark"]):not(.dark) ${sel} {
  --ag-value-change-value-highlight-background-color: ${light};
}
html[data-theme="dark"] ${sel},
.dark ${sel},
[data-theme="dark"] ${sel} {
  --ag-value-change-value-highlight-background-color: ${dark};
}
`.trim();
}

function escapeAttr(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
