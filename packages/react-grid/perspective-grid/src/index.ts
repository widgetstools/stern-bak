/**
 * `@wellsfargo-starui/grid/perspective` — Perspective-backed MarketsGrid engine.
 *
 * Topology (validated against 4.5.2): ONE Table lives in the SharedWorker and
 * is fed by the STOMP provider; each blotter window opens its own View and
 * renders only the rows in its viewport. A window therefore never materializes
 * the full book — a 100-row window read measured ~2-6ms flat with scroll depth,
 * against ~1.3ms per extra live View per tick.
 *
 * AG Grid is retained as the surface (the MarketsGrid customizer, cell
 * renderers, conditional styling and column defs are all built on it);
 * Perspective replaces only the row-supply engine underneath. Nothing in this
 * folder imports AG Grid: its shapes are structural, so the engine unit-tests
 * without a grid and without a DOM.
 *
 * Views MUST be closed through `createSafeView` — deleting one while a
 * read is in flight throws an uncatchable wasm borrow error that can take
 * the whole SharedWorker down. See `safeView.ts`.
 */
export {
  createPerspectiveDatasource,
  columnsToRows,
  cloneRequest,
  type PerspectiveDatasource,
  type PerspectiveDatasourceOpts,
  type PerspectiveViewLike,
  type ServerSideRequestLike,
  type ServerSideGetRowsParamsLike,
} from './perspectiveDatasource.js';
export { createSafeView, type SafeView, type DeletableView } from './safeView.js';
export {
  coerceEditedValue,
  type CoercedValue,
  type PerspectiveColumnType,
} from './cellEdits.js';
export {
  createPerspectiveRowEngine,
  GRAND_TOTAL_ROW_ID,
  GRAND_TOTAL_FLAG,
  type PerspectiveRowEngine,
  type PerspectiveGridStatus,
  type PerspectiveRowEngineOpts,
  type PerspectiveCellEdit,
  type GridApiLike,
  type GridNodeLike,
} from './perspectiveRowEngine.js';
export {
  createViewManager,
  type ViewManager,
  type ViewManagerOpts,
  type ViewManagerEvent,
  type PerspectiveTableLike,
  type UpdatableView,
} from './viewManager.js';
export {
  usePerspectiveTable,
  type UsePerspectiveTableOpts,
  type UsePerspectiveTableResult,
  type PerspectiveAttachClientLike,
  type PerspectiveAttachOutcome,
  type PerspectiveClientModuleLike,
  type PerspectiveTableStatus,
} from './usePerspectiveTable.js';
export { loadPerspectiveClient } from './loadPerspectiveClient.js';
export {
  toPerspectiveEdits,
  type GridDataTransaction,
  type ToPerspectiveEditsOpts,
} from './editTransactions.js';
export {
  toGroupColumns,
  toTreeColumns,
  blankUnaggregatedNonNumeric,
  TREE_KEY_FIELD,
  TREE_GROUP_FIELD,
  viewConfigKey,
} from './viewConfig.js';

/**
 * The AG-request -> View-config translation, re-exported so the grid layer has
 * ONE import site for the whole engine surface.
 *
 * It LIVES in `@wellsfargo-starui/core` because the worker-side query engine
 * needs the identical translation and cannot import a React grid package. A
 * second copy on this side is exactly the divergence that would let a saved
 * filter's badge disagree with the rows under it.
 */
export {
  QUICK_FILTER_COLUMN,
  sanitizeQuickFilterTerm,
  toQuickFilterExpression,
  toPerspectiveSort,
  toPerspectiveAggregate,
  toPerspectiveFilterClauses,
  isFilterModelMappable,
  toPerspectiveFilter,
  toPerspectiveViewConfig,
  toPerspectiveGroupLevel,
  type AgFilterItem,
  type AgGroupLevelState,
  type AgRequestState,
  type AgSortItem,
  type PerspectiveAggregate,
  type PerspectiveGroupLevel,
  type PerspectiveViewConfig,
} from '@wellsfargo-starui/core';
