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
  defineModule,
  quickFilterColumnsOf,
  applyQuickFilterText,
  COMPUTED_FIELDS_KEY,
  NOT_COMPUTED,
  readComputedField,
} from './platform';
export type {
  DefineModuleOptions,
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
  RowChangeSink,
  RowNodeDelta,
  SerializedState,
  SettingsPanelProps,
  Store,
  TransformContext,
  // Data port — `platform.data`, one surface over both row models.
  AggregateResult,
  CapabilityVerdict,
  CountResult,
  DataAggFunc,
  DataCapabilities,
  DataQuery,
  DataResult,
  DataRow,
  DataScope,
  DistinctOptions,
  DistinctResult,
  GridDataPort,
  MutationRejection,
  MutationResult,
  RowPatch,
  RowsByIdResult,
  RowsInRangeResult,
  ScanResult,
  SsrmDataBinding,
  SsrmDataSource,
} from './platform';

// ─── Store + auto-save ──────────────────────────────────────────────────────

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

// ─── History (framework-agnostic; the non-React core of useUndoRedo) ────────
export { HistoryStack, type HistoryStackOptions } from './history/HistoryStack';

// `GridStore` is a back-compat alias for `Store` — vanilla, stays here.
export type { Store as GridStore } from './platform/types';

// ─── Expression Engine ──────────────────────────────────────────────────────
export { ExpressionEngine, astUsesAggregateFunctions } from './expression';
export type { ExpressionNode } from './expression';

// ─── Types ──────────────────────────────────────────────────────────────────

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
  ColumnDataType,
  GridThemeMode,
  PresetId,
  ThemedCellStyleOverrides,
  ValueFormatterTemplate,
} from './colDef';
export {
  valueFormatterFromTemplate,
  isValidExcelFormat,
  getActiveTheme,
  migrateThemedStyle,
  patchActiveStyle,
  resolveActiveStyle,
  nestedField,
  defaultNullSafeComparator,
  buildAutoFormatPlan,
} from './colDef';
export type { NestedFieldOptions } from './colDef';
export type { AutoFormatColumn } from './colDef';

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
export {
  buildVirtualColDef,
  fillAllRowsSnapshot,
  getAllRowsSnapshot,
  invalidateAllRowsCache,
  applyAssignments,
  reinjectCSS,
  cssEscapeColId,
  applyFilterConfigToColDef,
  applyRowGroupingConfigToColDef,
  composeGroups,
  collectGroupIds,
  collectAssignedColIds,
  groupHeaderBorderOverlayCSS,
  groupHeaderStyleToCSS,
  hasHeaderBorders,
  hasHeaderStyle,
  resolveTemplates,
  INDICATOR_ICONS,
  findIndicatorIcon,
  toStyleEditorValue,
  fromStyleEditorValue,
  applyNumericOp,
  applySmartEditColDefTransforms,
  collectTargetCells,
  collectFocusedCell,
  bulkUpdateValueKind,
  collectBulkUpdateTargets,
  buildBulkUpdatePatchesFromRaw,
  compareDistinctValues,
  buildNudgePatches,
  applyPlusMinusColDefTransforms,
  buildShortcutPatches,
  applyShortcutsColDefTransforms,
  buildVisualExcelStyles,
  applyFormatExcelClasses,
  defaultVisualExcelFileName,
  INITIAL_CALCULATED_COLUMNS,
  INITIAL_COLUMN_CUSTOMIZATION,
  overrideKey,
  globalKey,
  stripUndefined,
  mergeOverrides,
  writeOverridesReducer,
  applyTypographyReducer,
  applyColorsReducer,
  applyAlignmentReducer,
  applyBordersReducer,
  applyHeaderNameReducer,
  applyEditableReducer,
  applyCellEditorKindReducer,
  applyCellEditorValuesReducer,
  applyFilterPrimaryKindReducer,
  applyFloatingFilterReducer,
  applyFormatterReducer,
  applyTemplateToColumnsReducer,
  removeTemplateRefFromAssignmentsReducer,
  clearAllStylesReducer,
  clearAllStylesInProfileReducer,
  applyAutoFormatPlanReducer,
  isColumnGroupsState,
  INITIAL_COLUMN_GROUPS,
  flattenGroups,
  updateGroupAtPath,
  deleteGroupAtPath,
  moveGroupAtPath,
  INITIAL_COLUMN_TEMPLATES,
  snapshotTemplate,
  pickTemplateFields,
  addTemplateReducer,
  snapshotTemplateUpdate,
  updateTemplateReducer,
  renameTemplateReducer,
  removeTemplateReducer,
  INITIAL_CONDITIONAL_STYLING,
  createTimedRuleStore,
  reinjectAllRules,
  extractTriggerColumns,
  buildRowClassPredicate,
  applyCellRulesToDefs,
  CONDITIONAL_DIFF_CACHE_KEY,
  CONDITIONAL_TIMED_RULE_CACHE_KEY,
  FLASH_PALETTE,
  INITIAL_GENERAL_SETTINGS,
  GRID_STATE_SCHEMA_VERSION,
  INITIAL_GRID_STATE,
  captureGridState,
  applyGridState,
  captureGridStateInto,
  deserializeAlertsState,
  capHistory,
  DEFAULT_ALERTS_SETTINGS,
  INITIAL_ALERTS,
  evaluateDataChangeRule,
  computeRelativeChange,
  detectRowChanges,
  renderMessage,
  deserializeEditingState,
  migrateLegacyEditingState,
  EDITING_MODULE_ID,
  EDITING_SCHEMA_VERSION,
  LEGACY_EDITING_MODULE_IDS,
  INITIAL_EDITING,
  INITIAL_SMART_EDIT,
  buildPatchesFromTargets,
  applyForwardPatches,
  previewPatches,
  assertSingleColumnSelection,
  EditJournal,
  deserializeDataChangeHistoryState,
  recordSourceKey,
  DATA_CHANGE_HISTORY_MODULE_ID,
  DATA_CHANGE_HISTORY_SCHEMA_VERSION,
  INITIAL_DATA_CHANGE_HISTORY,
  INITIAL_BULK_UPDATE,
  defaultPlusMinusNudge,
  INITIAL_PLUS_MINUS,
  defaultShortcut,
  INITIAL_SHORTCUTS,
  deserializeVisualExcelState,
  VISUAL_EXCEL_MODULE_ID,
  INITIAL_VISUAL_EXCEL,
} from './customizer';
export type {
  AllRowsEntry,
  IndicatorIconDef,
  TargetCell,
  BulkUpdateSelection,
  BulkUpdateTarget,
  BuildNudgePatchesOptions,
  NudgeDirection,
  VirtualColumnDef,
  CalculatedColumnsState,
  FilterKind,
  SetFilterOptions,
  MultiFilterEntry,
  ColumnFilterConfig,
  AggFuncName,
  RowGroupingConfig,
  CellEditorKind,
  ColumnCellEditorConfig,
  ColumnAssignment,
  ColumnCustomizationState,
  TargetKind,
  ScopeKind,
  FormatterKind,
  AutoFormatApplyOptions,
  GroupChildShow,
  ColumnGroupChild,
  GroupHeaderBorderSpec,
  GroupHeaderStyle,
  ColumnGroupNode,
  ColumnGroupsState,
  Path,
  RowGroupingTemplate,
  ColumnTemplate,
  ColumnTemplatesState,
  SnapshotTemplateDeps,
  RuleScope,
  FlashTarget,
  FlashMode,
  FlashColor,
  FlashConfig,
  IndicatorTarget,
  IndicatorPosition,
  RuleIndicator,
  AnimationKind,
  AnimationConfig,
  ConditionalRule,
  ConditionalStylingState,
  DiffCacheByApi,
  TimedRuleStateByApi,
  TimedRuleStore,
  GeneralSettingsState,
  SavedGridState,
  GridStateState,
  AlertSeverity,
  AlertChannel,
  RelativeChangeMode,
  RelativeChangeDirection,
  AlertTrigger,
  AlertRule,
  DataChangeRule,
  RelativeChangeRule,
  AlertNotification,
  EvaluationMode,
  AlertsSettings,
  AlertsState,
  AlertHit,
  EditingState,
  SmartEditOp,
  SmartEditSettings,
  SmartEditState,
  CellPatch,
  EditSource,
  EditJournalEntry,
  EditApplyResult,
  EditPlatform,
  DataChangeHistoryRecordSources,
  DataChangeHistorySettings,
  DataChangeHistoryState,
  BulkUpdateSettings,
  BulkUpdateState,
  PlusMinusNudge,
  PlusMinusSettings,
  PlusMinusState,
  ShortcutOperation,
  ShortcutDefinition,
  ShortcutsSettings,
  ShortcutsState,
  VisualExcelSettings,
  VisualExcelState,
} from './customizer';

// ─── Filter toolbar helpers ──────────────────────────────────────────────────
export {
  makeId,
  generateLabel,
  formatFilterModel,
  filterModelsEqual,
  mergeFilterModels,
  subtractFilterModel,
  isNewFilter,
  type SavedFilterShape,
} from './filters/filtersToolbarLogic';

// ─── The one filter predicate ────────────────────────────────────────────────
// Shared with the SharedWorker query plane (`@wellsfargo-starui/data`), which
// re-exports these rather than carrying a second implementation.
export {
  doesRowMatchFilterModel,
  doesValueMatchFilter,
  assertFilterModelSupported,
  compareValues,
} from './filters/filterPredicate';
export { UnsupportedQueryError } from './filters/UnsupportedQueryError';
