// @wellsfargo-starui/widgets-react — Star Widget Components

// ─── StarGrid — the one grid component (Phase 1 front door) ────────
export { StarGrid, type StarGridProps } from './stargrid/StarGrid.js';

// ─── AG Grid Theme ───────────────────────────────
// Theme objects live in `@wellsfargo-starui/design-system/adapters/ag-grid` —
// import `agGridDarkTheme` / `agGridLightTheme` from there directly.
// This hook still reads the runtime `[data-theme]` and returns the
// matching theme.
// useAgGridTheme (the { theme } wrapper) is internal now — the PUBLIC
// useAgGridTheme is the hosted variant on ./widgets/hosted (mode -> Theme).
// Two same-name exports with incompatible signatures in one package was
// a documented footgun.

// ─── Provider Editor (v2) and Data Provider Selector (v2) ─────────
// The v1 mirrored editor/selector are gone; consumers import the
// v2 surfaces directly via subpath:
//   import { DataProviderEditor } from '@wellsfargo-starui/widgets-react/provider-editor';
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
  GridContextLinkConfig,
  GridLinkSelectionContext,
  GridLinkResolver,
  GridLinkSelectionBuilder,
} from './hosted/index.js';
export { useGridContextLink } from './hosted/index.js';
export {
  MarketsGridContainer,
  DatePicker,
} from './container/markets-grid-container/index.js';
export type {
  MarketsGridContainerProps,
  ProviderSelection,
  ProviderMode,
} from './container/markets-grid-container/index.js';
export {
  SsrmMarketsGridContainer,
  useSsrmProviderDataWiring,
} from './container/ssrm-markets-grid-container/index.js';
export type {
  SsrmMarketsGridContainerProps,
  UseSsrmProviderDataWiringParams,
} from './container/ssrm-markets-grid-container/index.js';
