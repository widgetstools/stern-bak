/**
 * useGridTheme — canonical StarUI AG Grid theme with live OKLCH tokens.
 * Light/dark chrome is selected by `data-ag-theme-mode` on `<html>`,
 * kept in sync with `data-theme` via `applyTheme()` from the design system.
 */

import { staruiGridTheme } from '@wellsfargo-starui/design-system/adapters/ag-grid';
import type { Theme } from 'ag-grid-community';

export function useGridTheme(): Theme {
  return staruiGridTheme;
}
