/**
 * Pure row-analytics helpers — no config, no I/O, no provider.
 *
 * Shared between the AI Assistant (apps/source/star-demo) and any
 * grid-package consumer (e.g. the summary-panel customizer module) so the
 * arithmetic and chart/highlight logic exists exactly once.
 */

export {
  summariseRows,
  type ColumnKind,
  type NumericStats,
  type CategoryStats,
  type DateStats,
  type ColumnDigest,
  type GroupDigest,
  type DataDigest,
  type DigestOptions,
} from './dataDigest.js';

export {
  buildChartSpec,
  chartColor,
  CHART_KINDS,
  SUMMARY_CHART_KINDS,
  CHART_COLORS,
  type ChartKind,
  type ResolvedChartKind,
  type ChartPoint,
  type ChartSpec,
  type ChartInput,
} from './chartSpec.js';

export {
  runQuery,
  validateQuery,
  FILTER_OPS,
  AGG_FNS,
  type FilterOp,
  type AggFn,
  type FilterClause,
  type Aggregation,
  type DataQuery,
  type PivotMeta,
  type QueryResult,
  type QueryOutcome,
} from './dataQuery.js';

export {
  heatmapDomain,
  heatmapCellColor,
  type HeatmapDomain,
} from './heatmap.js';

export {
  formatValue,
  formatCompact,
  formatNumberFallback,
} from './formatValue.js';

export {
  LABEL_CONTRASTS,
  CHART_PALETTES,
  labelContrastClass,
  type LabelContrast,
  type ChartPalette,
  type ChartStyle,
} from './chartStyle.js';
