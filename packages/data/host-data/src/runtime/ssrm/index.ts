export type {
  Row,
  AggFunc,
  SsrmGetRowsRequest,
  SsrmGetRowsResult,
  SetFilterValuesRequest,
  ExpressionRule,
  StyleResult,
  EnrichedRow,
  TickEvent,
  CacheStats,
  ICacheIngest,
  TreeDataConfig,
  DetailRowsRequest,
} from './types.js';
export { RowStore } from './RowStore.js';
export { QueryEngine } from './QueryEngine.js';
export {
  SsrmServer,
  type ViewportInterestScope,
  type SsrmFlushEvent,
  type SsrmStats,
} from './SsrmServer.js';
export {
  computeStatusBar,
  type StatusBarRequest,
  type StatusBarSummary,
  type StatusBarAggSpec,
  type StatusBarAggValue,
} from './statusBar.js';
export {
  SsrmPlane,
  isSsrmProviderType,
  resolveSsrmKeyColumn,
  SSRM_COMPOSITE_KEY_FIELD,
} from './SsrmPlane.js';
export {
  parseQuickFilter,
  buildQuickFilterText,
  rowPassesQuickFilter,
  rowPassesQuickFilterScoped,
} from './quickFilter.js';
// The filter predicate and its refusal type live in `@wellsfargo-starui/core`
// (`filters/filterPredicate.ts`) — ONE implementation, shared with the client
// so a pill badge and a block query cannot disagree about what a filter means.
// Re-exported here because this barrel is the query plane's public surface.
export {
  assertFilterModelSupported,
  compareValues,
  doesRowMatchFilterModel,
  UnsupportedQueryError,
} from '@wellsfargo-starui/core';
