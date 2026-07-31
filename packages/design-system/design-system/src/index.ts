// ─────────────────────────────────────────────────────────────
//  @wellsfargo-starui/design-system — Public API
//
//  Subpath imports for direct adapter access:
//    @wellsfargo-starui/design-system/tailwind  → tailwindPreset
//    @wellsfargo-starui/design-system/primeng   → primengPreset
//    @wellsfargo-starui/design-system/css       → bundled stylesheet (theme + scrollbar + base)
//
//  Root import for tokens + helpers:
//    import { dark, light, componentTokens, applyTheme } from '@wellsfargo-starui/design-system';
// ─────────────────────────────────────────────────────────────

export * from './tokens';
export * from './adapters';
export { applyTheme, getTheme, type ThemeOptions, type LightVariant, type Mode } from './applyTheme';
export {
  // Existing zero-config renderers
  SideCellRenderer, StatusBadgeRenderer, ColoredValueRenderer,
  OasValueRenderer, SignedValueRenderer, TickerCellRenderer,
  RatingBadgeRenderer, PnlValueRenderer, FilledAmountRenderer,
  BookNameRenderer, ChangeValueRenderer, YtdValueRenderer,
  RfqStatusRenderer,
  // Configurable renderers (Tier 1 + 2 + FI specialised)
  PillCellRenderer, HeatmapCellRenderer, PercentBarCellRenderer,
  TrendArrowCellRenderer, SparklineCellRenderer, MultiLineCellRenderer,
  IconTextCellRenderer, CountryFlagCellRenderer, RatingDeltaCellRenderer,
  TimeSinceCellRenderer, AllocationBarCellRenderer,
} from './cellRenderers';
export {
  cellRendererComponents,
  cellRendererCatalogue,
  cellRendererCatalogueByCategory,
  CONFIGURABLE_RENDERER_IDS,
  getCellRendererEntry,
  type CellRendererId,
  type CellRendererConfig,
  type CellRendererCategory,
  type CellRendererCatalogueEntry,
  type ThemeAwareColor,
  type PillRendererConfig,
  type HeatmapRendererConfig,
  type PercentBarRendererConfig,
  type TrendArrowRendererConfig,
  type SparklineRendererConfig,
  type MultiLineRendererConfig,
  type IconTextRendererConfig,
  type CountryFlagRendererConfig,
  type RatingDeltaRendererConfig,
  type TimeSinceRendererConfig,
  type AllocationBarRendererConfig,
} from './cellRendererRegistry';
