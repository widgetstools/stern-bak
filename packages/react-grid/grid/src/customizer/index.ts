/**
 * `@wellsfargo-starui/grid/customizer` — the CURATED cross-package surface.
 *
 * This barrel once exported ~320 symbols (internal panel primitives,
 * shadcn re-exports, every engine reducer via the deleted module shims).
 * 95% had no consumer outside this package. What remains is exactly what
 * other packages and apps actually import:
 *
 *  - `ExpressionEditor` — the shared DSL editor (provider editor's
 *    Columns tab mounts it cross-package).
 *  - `isHistoricalToolbarDate` / `todayIsoDate` — the toolbar-date
 *    predicate and today's ISO date, both wired by the two grid
 *    containers' shared historical-date hook. `todayIsoDate` is here
 *    because MarketsGridContainer had grown a byte-identical private
 *    copy of it.
 *  - The module STATE types lab/demo seeds author against. State shapes
 *    live in `@wellsfargo-starui/core` (modules live in the engine);
 *    `SavedFiltersState` is grid-local (grid-only module).
 *
 * Everything else is internal — import it by relative path inside this
 * package, never re-export it here without a named consumer.
 */

export { ExpressionEditor } from './ui/ExpressionEditor';
export type {
  ExpressionEditorProps,
  ExpressionEditorHandle,
} from './ui/ExpressionEditor';

export { isHistoricalToolbarDate } from './modules/toolbar-date-settings/applyHistoricalToolbarDateToAppData';
export { todayIsoDate } from '../widget/toolbarDateUtils';

export type { SavedFiltersState } from './modules/saved-filters/index';

export type {
  GeneralSettingsState,
  ColumnAssignment,
  ColumnCustomizationState,
  ConditionalRule,
  ConditionalStylingState,
  CalculatedColumnsState,
  VirtualColumnDef,
  ColumnGroupsState,
  ColumnGroupNode,
} from '@wellsfargo-starui/core';
