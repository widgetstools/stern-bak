// @wellsfargo-starui/widgets-react — Star Widget Components

// ─── Blotter primitives ──────────────────────────
export { BlotterToolbar } from './blotter/BlotterToolbar.js';
export type { BlotterToolbarProps } from './blotter/BlotterToolbar.js';

export { LayoutSelector } from './blotter/LayoutSelector.js';
export type { LayoutSelectorProps } from './blotter/LayoutSelector.js';

// ─── Types ────────────────────────────────────────
export type {
  BlotterSlots,
  BlotterSlotContext,
  ToolbarButton,
  GridColumnConfig,
  LayoutState,
} from './blotter/types.js';

// ─── Hooks ────────────────────────────────────────
export { useBlotterDataConnection } from './blotter/hooks/useBlotterDataConnection.js';
export type { UseBlotterDataConnectionOptions, UseBlotterDataConnectionResult } from './blotter/hooks/useBlotterDataConnection.js';

export { useGridStateManager } from './blotter/hooks/useGridStateManager.js';
export type { GridStateManagerResult } from './blotter/hooks/useGridStateManager.js';

// ─── DI / Provider ───────────────────────────────
export { BlotterProvider, useBlotterDI } from './BlotterProvider.js';
export type { BlotterDependencies, BlotterProviderProps } from './BlotterProvider.js';

// ─── Interfaces ───────────────────────────────────
export type { IBlotterDataProvider, IActionRegistry } from './interfaces.js';

// ─── AG Grid Theme ───────────────────────────────
// Theme objects live in `@wellsfargo-starui/design-system/adapters/ag-grid` —
// import `agGridDarkTheme` / `agGridLightTheme` from there directly.
// This hook still reads the runtime `[data-theme]` and returns the
// matching theme.
export { useAgGridTheme } from './theme/index.js';

// ─── Provider Editor (v2) and Data Provider Selector (v2) ─────────
// The v1 mirrored editor/selector are gone; consumers import the
// v2 surfaces directly via subpath:
//   import { DataProviderEditor } from '@wellsfargo-starui/widgets-react/provider-editor';
//   import { DataProviderSelector } from '@wellsfargo-starui/widgets-react/data-provider-selector';
//   import { MarketsGridContainer } from '@wellsfargo-starui/widgets-react/markets-grid-container';

// ─── Hosted-feature wrappers (public API) ────────
// Subpath: '@wellsfargo-starui/widgets-react/hosted'
// Re-exported here for convenience; new consumers should prefer the
// subpath import for treeshakability.
export type {
  HostedContext,
  RegisteredComponentMetadata,
  ConfigManager,
  StorageAdapterFactory,
  HostedMarketsGridProps,
  GridContextLinkConfig,
  GridLinkSelectionContext,
  GridLinkResolver,
  GridLinkSelectionBuilder,
} from './hosted/index.js';
export { HostedMarketsGrid, useGridContextLink } from './hosted/index.js';
