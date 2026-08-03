/**
 * @wellsfargo-starui/core — vanilla grid platform (ported from @wellsfargo-starui/core).
 *
 *   platform/      GridPlatform, store, events, api hub
 *   expression/    CSP-safe expression engine
 *   profiles/      ProfileManager
 *   persistence/   StorageAdapter implementations
 *   security/      expression-policy (CSP gate)
 *   history/       undo/redo stack
 *   colDef/        AG-Grid column-def helpers
 *   css/           CSS injection utilities
 *
 * React UI lives in `@wellsfargo-starui/grid` (phase 3). OpenFin utilities removed
 * from engine — they belong in `@wellsfargo-starui/host-openfin` or `@wellsfargo-starui/grid`.
 */

// ─── Platform runtime (framework-agnostic) ──────────────────────────────────
export {
  GridPlatform,
  EventBus,
  topoSortModules,
  ApiHub,
  RowChangeBus,
  ResourceScope,
  CssInjector,
  PipelineRunner,
} from './platform';
export type {
  GridPlatformOptions,
  AnyColDef,
  AnyModule,
  ApiEventName,
  AppDataLookup,
  CssHandle,
  EditorPaneProps,
  ExpressionEngineLike,
  GridApi,
  GridOptions,
  GetRowIdFunc,
  GetRowIdParams,
  IDirtyBus,
  ListPaneProps,
  Module,
  PlatformEventMap,
  PlatformHandle,
  RowChange,
  RowChangeSignal,
  SerializedState,
  SettingsPanelProps,
  Store,
  TransformContext,
} from './platform';

// ─── Store + auto-save ──────────────────────────────────────────────────────
export { createGridStore } from './store/createGridStore';
export type { CreateStoreOptions } from './store/createGridStore';
export { startAutoSave } from './store/autosave';
export type { AutoSaveHandle, AutoSaveOptions } from './store/autosave';

// ─── Persistence adapters ───────────────────────────────────────────────────
export {
  MemoryAdapter,
  LocalStorageBundleAdapter,
  marketsGridLocalStorageBundleKey,
  RESERVED_DEFAULT_PROFILE_ID,
  activeProfileKey,
  createMarketsGridLocalStorageStorage,
  isMarketsGridLocalStorageStorageFactory,
  type MarketsGridLocalStorageConfig,
  type ProfileSnapshot,
  type StorageAdapter,
  type StorageAdapterFactory,
  type StorageAdapterFactoryOpts,
} from './persistence';

// ─── Profile manager ────────────────────────────────────────────────────────
export { ProfileManager } from './profiles';
export type {
  ActiveIdSource,
  ProfileManagerOptions,
  ProfileManagerState,
  ProfileMeta,
  ExportedProfilePayload,
} from './profiles';

// ─── Security policy ────────────────────────────────────────────────────────
//
// Runtime gate for the `kind: 'expression'` valueFormatter escape hatch
// (compiled via `new Function`, therefore CSP-unsafe). Set to `'strict'`
// at boot when running under a `script-src` CSP that forbids
// `unsafe-eval`. See docs in `./security/expressionPolicy.ts`.
export {
  configureExpressionPolicy,
  getExpressionPolicy,
} from './security/expressionPolicy';
export type {
  ExpressionPolicy,
  ExpressionPolicyMode,
  ExpressionPolicyViolation,
} from './security/expressionPolicy';

// ─── History (framework-agnostic; the non-React core of useUndoRedo) ────────
export { HistoryStack, type HistoryStackOptions } from './history/HistoryStack';

// `GridStore` is a back-compat alias for `Store` — vanilla, stays here.
export type { Store as GridStore } from './platform/types';

// ─── Expression Engine ──────────────────────────────────────────────────────
export {
  ExpressionEngine,
  tokenize,
  parse,
  Evaluator,
  tryCompileToAgString,
  tryCompileToPerspectiveExpression,
  astUsesAggregateFunctions,
  getAggregateFunctionNames,
} from './expression';
export type {
  ExpressionNode,
  EvaluationContext,
  ValidationResult,
  FunctionDefinition,
  PerspectiveCompileResult,
  PerspectiveExpressionType,
} from './expression';
export { migrateExpressionSyntax, migrateExpressionsInObject } from './expression/migrate';

// ─── Perspective translation (pure; shared by the window-side view config and
// the worker-side query engine, so a filter means the same thing in both) ────
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
} from './perspective/filterTranslate';
export type {
  AgFilterItem,
  AgGroupLevelState,
  AgRequestState,
  AgSortItem,
  PerspectiveAggregate,
  PerspectiveGroupLevel,
  PerspectiveViewConfig,
} from './perspective/filterTranslate';
export { viewConfigKey } from './perspective/viewConfigKey';
// Deleting a View with a read in flight throws an uncatchable wasm borrow
// error. Both sides of the worker port build and drop Views, so the
// refcounted close lives here rather than in either of them.
export { createSafeView } from './perspective/safeView';
export type {
  DeletableView,
  PerspectiveViewLike,
  SafeView,
} from './perspective/safeView';

// ─── Types ──────────────────────────────────────────────────────────────────
export type { CellStyleProperties, ThemeAwareStyle } from './types/common';

// ─── Shared CSS utilities ────────────────────────────────────────────────────
export { injectEditorStyles } from './css';

// ─── Shared colDef types + helpers ─────────────────────────────────────────
//
// `ColumnAssignment` exported here is the BASE shape (with `unknown`
// `filter` / `rowGrouping` slots) — exposed as `BaseColumnAssignment`
// because the NARROWED variant lives next to its consumers in
// `@wellsfargo-starui/grid-react`'s column-customization module.
export type {
  BorderSpec,
  CellStyleOverrides,
  ColumnAssignment as BaseColumnAssignment,
  ColumnDataType,
  GridThemeMode,
  PresetId,
  ThemedCellStyleOverrides,
  TickToken,
  ValueFormatterTemplate,
} from './colDef';
export {
  valueFormatterFromTemplate,
  excelFormatter,
  excelFormatColorResolver,
  isValidExcelFormat,
  tickFormatter,
  presetToExcelFormat,
  cellStyleToAgStyle,
  getActiveTheme,
  mergeCellStyleOverrides,
  mergeThemedStyle,
  migrateThemedStyle,
  patchActiveStyle,
  resolveActiveStyle,
  resolveEffectiveStyle,
  nestedField,
  defaultNullSafeComparator,
  FIELD_FORMAT_CATALOG,
  matchFieldToCatalog,
  normalizeToken,
  soundex,
  buildAutoFormatPlan,
} from './colDef';
export type { NestedFieldOptions } from './colDef';
export type {
  AutoFormatAlignment,
  AutoFormatAssignment,
  AutoFormatColumn,
  AutoFormatTypography,
  FieldFormatEntry,
} from './colDef';

// ─── Style editor value shape (shared by customizer panels) ────────────────
export type {
  StyleEditorValue,
  StyleEditorSection,
  StyleEditorVariant,
  StyleEditorDataType,
  TextAlign,
  FontWeight,
} from './styleEditor/types';

// ─── Customizer module logic (framework-agnostic) ────────────────────────────
export * from './customizer';

// ─── Filter toolbar helpers ──────────────────────────────────────────────────
export {
  makeId,
  generateLabel,
  formatFilterModel,
  doesValueMatchFilter,
  doesRowMatchFilterModel,
  filterModelsEqual,
  mergeFilterModels,
  subtractFilterModel,
  isNewFilter,
  type SavedFilterShape,
} from './filters/filtersToolbarLogic';
