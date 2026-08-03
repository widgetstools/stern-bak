/**
 * Row-engine layer — which engine supplies a grid's rows, and the seams the
 * module pipeline reaches it through.
 *
 * Two engines exist and there was never a third: the client-side model, where
 * every window materializes the whole book, and Perspective, where the book
 * lives once in a SharedWorker and each window reads only the blocks its
 * viewport asks for.
 *
 * The one rule worth knowing before touching anything here: asking for
 * Perspective can never mount a client grid, not even for the length of an
 * async attach. See `resolveGridSurface`.
 */

export { GridSurfaceSlot, type GridSurfaceSlotProps } from './GridSurfaceSlot.js';
export {
  resolveGridSurface,
  isPerspectiveRowModel,
  type ResolveGridSurfaceOpts,
} from './resolveGridSurface.js';
export {
  PerspectiveMarketsGridSurface,
  makeGetRowId,
  type PerspectiveMarketsGridSurfaceHandle,
  type PerspectiveMarketsGridSurfaceProps,
} from './PerspectiveMarketsGridSurface.js';
export {
  PerspectiveStatusPanel,
  type PerspectiveStatusPanelParams,
} from './PerspectiveStatusPanel.js';
export { createPerspectiveEngineHolder } from './perspectiveEngineHolder.js';
export {
  createPerspectiveWorkerQueries,
  type PerspectiveWorkerQueriesOpts,
} from './perspectiveWorkerQueries.js';
export { withPerspectiveSetFilterValues } from './perspectiveSetFilterValues.js';
export {
  usePerspectiveCalcColumns,
  planCalcColumn,
  planCalcColumns,
  type PerspectiveCalcColumn,
  type PerspectiveCalcColumnPlan,
  type PerspectiveCalcColumnTier,
} from './usePerspectiveCalcColumns.js';
export { useCalcColumnsSnapshot } from './useCalcColumnsSnapshot.js';
export {
  asPerspectiveContext,
  readPerspectiveContext,
  type GridSurfaceChoice,
  type MarketsGridRowModel,
  type PerspectiveEngineHolder,
  type PerspectiveGridContext,
  type PerspectiveGridQueries,
} from './types.js';
