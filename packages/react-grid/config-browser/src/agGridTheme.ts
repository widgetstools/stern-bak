/**
 * AG-Grid theming bridge for config-browser-react.
 *
 * Surface / border / focus / range / accent colors flow from the design-system
 * adapter (agGridDarkParams / agGridLightParams). Only tool-specific overrides
 * (input chrome, resize handle, header row border, wrapper border) are kept here.
 * Flipping [data-theme="light"|"dark"] re-skins the grid automatically via
 * the CSS variables resolved by the adapter.
 */
import { themeQuartz } from "ag-grid-community";
import type { Theme } from "ag-grid-community";
import { agGridDarkParams, agGridLightParams } from "@wellsfargo-starui/design-system/adapters/ag-grid";

// Tool-specific overrides: input chrome + structural borders not covered by adapter.
const overrides = {
  headerColumnResizeHandleColor: "var(--ds-border-secondary)",
  wrapperBorder:    "solid 1px var(--ds-border-primary)",
  headerRowBorder:  "solid 1px var(--ds-border-primary)",
  columnBorder:     { style: "solid" as const, width: 1, color: "var(--ds-border-primary)" },
  inputBackgroundColor: "var(--ds-surface-secondary)",
  inputBorder:      "solid 1px var(--ds-border-primary)",
  inputTextColor:   "var(--ds-text-primary)",
};

const agGridThemeDark: Theme  = themeQuartz.withParams({ ...agGridDarkParams,  ...overrides });
const agGridThemeLight: Theme = themeQuartz.withParams({ ...agGridLightParams, ...overrides });

export function agGridThemeFor(theme: "dark" | "light"): Theme {
  return theme === "dark" ? agGridThemeDark : agGridThemeLight;
}
