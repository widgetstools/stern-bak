// @wellsfargo-starui/widgets-react — Star Widget Components

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
export {
  HostedMarketsGrid,
  HostedSsrmMarketsGrid,
  useGridContextLink,
} from './hosted/index.js';
export type { HostedSsrmMarketsGridProps } from './hosted/index.js';
export {
  SsrmMarketsGridContainer,
  useSsrmProviderDataWiring,
} from './container/ssrm-markets-grid-container/index.js';
export type {
  SsrmMarketsGridContainerProps,
  UseSsrmProviderDataWiringParams,
} from './container/ssrm-markets-grid-container/index.js';
