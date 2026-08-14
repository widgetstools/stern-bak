/**
 * AG-Grid theming bridge for config-browser.
 *
 * One theme object: the canonical `staruiGridTheme` (mode-switched by the
 * `data-ag-theme-mode` attribute on <html>, which ConfigBrowser sets) plus
 * the tool-specific chrome overrides (input chrome, resize handle, header
 * row border, wrapper border). The `--ds-*` variables in the overrides
 * re-resolve per theme, so no per-mode theme objects are needed.
 */
import type { Theme } from "ag-grid-community";
import { staruiGridTheme } from "@wellsfargo-starui/design-system/adapters/ag-grid";

export const configBrowserGridTheme: Theme = staruiGridTheme.withParams({
  headerColumnResizeHandleColor: "var(--ds-border-secondary)",
  wrapperBorder:    "solid 1px var(--ds-border-primary)",
  headerRowBorder:  "solid 1px var(--ds-border-primary)",
  columnBorder:     { style: "solid" as const, width: 1, color: "var(--ds-border-primary)" },
  inputBackgroundColor: "var(--ds-surface-secondary)",
  inputBorder:      "solid 1px var(--ds-border-primary)",
  inputTextColor:   "var(--ds-text-primary)",
});
