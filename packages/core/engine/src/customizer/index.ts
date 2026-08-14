/**
 * Customizer module logic — framework-agnostic state, transforms, and helpers.
 * React panel registration stays in `@wellsfargo-starui/grid`.
 */

export * from './modules/calculated-columns/state.js';
export { buildVirtualColDef, invalidateAllRowsCache, type AllRowsEntry } from './modules/calculated-columns/virtualColumn.js';

export { INITIAL_COLUMN_CUSTOMIZATION } from './modules/column-customization/state.js';
export type {
  BorderSpec,
  CellStyleOverrides,
  PresetId,
  ThemedCellStyleOverrides,
  ValueFormatterTemplate,
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
} from './modules/column-customization/state.js';
export {
  applyAssignments,
  reinjectCSS,
  cssEscapeColId,
  applyFilterConfigToColDef,
  applyRowGroupingConfigToColDef,
} from './modules/column-customization/transforms.js';
export {
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
} from './modules/column-customization/formattingActions.js';
export type { TargetKind, ScopeKind, FormatterKind, AutoFormatApplyOptions } from './modules/column-customization/formattingActions.js';

export * from './modules/column-groups/state.js';
export {
  composeGroups,
  collectGroupIds,
  collectAssignedColIds,
  groupHeaderBorderOverlayCSS,
  groupHeaderStyleToCSS,
  hasHeaderBorders,
  hasHeaderStyle,
} from './modules/column-groups/composeGroups.js';
export { flattenGroups, updateGroupAtPath, deleteGroupAtPath, moveGroupAtPath } from './modules/column-groups/treeOps.js';
export type { Path } from './modules/column-groups/treeOps.js';

export * from './modules/column-templates/state.js';
export { resolveTemplates } from './modules/column-templates/resolveTemplates.js';
export * from './modules/column-templates/snapshotTemplate.js';

export { INITIAL_CONDITIONAL_STYLING } from './modules/conditional-styling/state.js';
export type {
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
} from './modules/conditional-styling/state.js';
export {
  createTimedRuleStore,
  reinjectAllRules,
  extractTriggerColumns,
  buildRowClassPredicate,
  applyCellRulesToDefs,
  CONDITIONAL_DIFF_CACHE_KEY,
  CONDITIONAL_TIMED_RULE_CACHE_KEY,
  FLASH_PALETTE,
} from './modules/conditional-styling/transforms.js';
export type { DiffCacheByApi, TimedRuleStateByApi, TimedRuleStore } from './modules/conditional-styling/transforms.js';
export { INDICATOR_ICONS, findIndicatorIcon } from './modules/conditional-styling/indicatorIcons.js';
export type { IndicatorIconDef } from './modules/conditional-styling/indicatorIcons.js';
export { toStyleEditorValue, fromStyleEditorValue } from './modules/conditional-styling/styleBridge.js';

export { INITIAL_GENERAL_SETTINGS } from './modules/general-settings/state.js';
export type { GeneralSettingsState } from './modules/general-settings/state.js';

export * from './modules/grid-state/state.js';
export * from './modules/grid-state/helpers.js';

export { deserializeAlertsState, capHistory, DEFAULT_ALERTS_SETTINGS, INITIAL_ALERTS } from './modules/alerts/state.js';
export type {
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
} from './modules/alerts/state.js';
export { evaluateDataChangeRule, computeRelativeChange, detectRowChanges, renderMessage } from './modules/alerts/evaluator.js';
export type { AlertHit } from './modules/alerts/evaluator.js';

export * from './modules/editing/state.js';

export { INITIAL_SMART_EDIT } from './modules/smart-edit/state.js';
export type { SmartEditOp, SmartEditSettings, SmartEditState } from './modules/smart-edit/state.js';
export { applyNumericOp } from './modules/smart-edit/operations.js';

export { applySmartEditColDefTransforms } from './modules/smart-edit/transforms.js';

export { collectTargetCells, collectFocusedCell, type TargetCell } from './modules/smart-edit/collectTargetCells.js';

export {
  buildPatchesFromTargets,
  applyForwardPatches,
  previewPatches,
  assertSingleColumnSelection,
  EditJournal,
} from './modules/editing-core/index.js';
export type { CellPatch, EditSource, EditJournalEntry, EditGridWriter } from './modules/editing-core/index.js';

export {
  deserializeDataChangeHistoryState,
  recordSourceKey,
  DATA_CHANGE_HISTORY_MODULE_ID,
  DATA_CHANGE_HISTORY_SCHEMA_VERSION,
  INITIAL_DATA_CHANGE_HISTORY,
} from './modules/data-change-history/state.js';
export type {
  DataChangeHistoryRecordSources,
  DataChangeHistorySettings,
  DataChangeHistoryState,
} from './modules/data-change-history/state.js';

export { INITIAL_BULK_UPDATE } from './modules/bulk-update/state.js';
export type { BulkUpdateSettings, BulkUpdateState } from './modules/bulk-update/state.js';
export { bulkUpdateValueKind } from './modules/bulk-update/isBulkUpdateCellType.js';
export { collectBulkUpdateTargets, type BulkUpdateTarget } from './modules/bulk-update/collectBulkUpdateTargets.js';
export { buildBulkUpdatePatchesFromRaw } from './modules/bulk-update/applyBulkUpdate.js';
export { resolveColumnDistinctValues } from './modules/bulk-update/resolveColumnDistinctValues.js';

export { defaultPlusMinusNudge, INITIAL_PLUS_MINUS } from './modules/plus-minus/state.js';
export type { PlusMinusNudge, PlusMinusSettings, PlusMinusState } from './modules/plus-minus/state.js';

export {
  buildNudgePatches,
  type BuildNudgePatchesOptions,
  type NudgeDirection,
} from './modules/plus-minus/buildNudgePatches.js';
export { applyPlusMinusColDefTransforms } from './modules/plus-minus/transforms.js';

export { defaultShortcut, INITIAL_SHORTCUTS } from './modules/shortcuts/state.js';
export type { ShortcutOperation, ShortcutDefinition, ShortcutsSettings, ShortcutsState } from './modules/shortcuts/state.js';

export { buildShortcutPatches } from './modules/shortcuts/buildShortcutPatches.js';
export { applyShortcutsColDefTransforms } from './modules/shortcuts/transforms.js';

export { deserializeVisualExcelState, VISUAL_EXCEL_MODULE_ID, INITIAL_VISUAL_EXCEL } from './modules/visual-excel/state.js';
export type { VisualExcelSettings, VisualExcelState } from './modules/visual-excel/state.js';
export { buildVisualExcelStyles, applyFormatExcelClasses, defaultVisualExcelFileName } from './modules/visual-excel/buildVisualExcelStyles.js';

