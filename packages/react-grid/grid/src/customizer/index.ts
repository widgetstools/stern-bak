/**
 * @wellsfargo-starui/grid/customizer — React UI for the MarketsUI grid customizer.
 *
 * Hosts every React surface that previously lived under
 * `@wellsfargo-starui/core/src/{ui,hooks,modules}` (extracted in PR-8). Consumers
 * are `@wellsfargo-starui/markets-grid` and any host app that needs the
 * settings-panel primitives, hooks, or module definitions.
 *
 * `@wellsfargo-starui/core` remains framework-agnostic vanilla TS: GridPlatform,
 * ProfileManager, expression engine, persistence adapters, etc.
 */

// ─── React bindings ──────────────────────────────────────────────────────
export { GridProvider, useGridPlatform } from './hooks/GridProvider';
export { useModuleState } from './hooks/useModuleState';
export { useGridApi, useGridEvent } from './hooks/useGridApi';
export { useProfileManager } from './hooks/useProfileManager';
export type { UseProfileManagerResult } from './hooks/useProfileManager';
export type { GridCoreLike } from './hooks/GridContext';
export { useDirty, useDirtyCount, type DirtyHandle } from './hooks/useDirty';
export {
  useGridColumns,
  type GridColumnInfo,
} from './hooks/useGridColumns';
export {
  useModuleDraft,
  type UseModuleDraftOptions,
  type UseModuleDraftResult,
} from './hooks/useModuleDraft';
export { useUndoRedo, type UseUndoRedoResult } from './hooks/useUndoRedo';
export { useEditJournal, useSyncJournalSuspend } from './hooks/useEditJournal';
export { useActiveThemeMode } from './hooks/useActiveThemeMode';

// Back-compat alias — preserved from the old core barrel. Some
// markets-grid helpers still thread `GridCore` (the minimal
// `{ getGridApi, gridId }` shape) through their props.
export type { GridCoreLike as GridCore } from './hooks/GridContext';

// ─── ColDef helpers ──────────────────────────────────────────────────────
// See docs/PUBLIC_API_SPEC.md §2.5 — nestedField() is the sanctioned
// authoring API for every ColDef whose data path contains a dot.
export {
  nestedField,
  defaultNullSafeComparator,
  type NestedFieldOptions,
} from './coldef';

// ─── ExpressionEditor ────────────────────────────────────────────────────
export { ExpressionEditor } from './ui/ExpressionEditor';
export type {
  ExpressionEditorProps,
  ExpressionEditorHandle,
} from './ui/ExpressionEditor';

// ─── Popout window primitives ────────────────────────────────────────────
export { PopoutPortal } from './ui/PopoutPortal';
export type { PopoutPortalProps } from './ui/PopoutPortal';
export { Poppable } from './ui/Poppable';
export type {
  PoppableProps,
  PoppableHandle,
  PoppableRenderProps,
  PopoutButtonProps,
} from './ui/Poppable';
export {
  PortalContainerProvider,
  usePortalContainer,
  useResolvedPortalContainer,
} from './ui/PortalContainer';
export type { PortalContainerProviderProps } from './ui/PortalContainer';

// ─── Settings-panel primitives ───────────────────────────────────────────
export {
  DirtyDot,
  LedBar,
  GhostIcon,
  SubLabel,
  IconInput,
  PillToggleGroup,
  PillToggleBtn,
  PairRow,
  FigmaPanelSection,
  ItemCard,
  ObjectTitleRow,
  TitleInput,
  PanelChrome,
  TabStrip,
  Caps,
  Mono,
  SharpBtn,
  TGroup,
  TBtn,
  TDivider,
  Band,
  MetaCell,
  Stepper,
} from './ui/SettingsPanel';
export type {
  DirtyDotProps,
  LedBarProps,
  GhostIconProps,
  SubLabelProps,
  IconInputProps,
  PillToggleGroupProps,
  PillToggleBtnProps,
  PairRowProps,
  FigmaPanelSectionProps,
  ItemCardProps,
  ObjectTitleRowProps,
  TitleInputProps,
  PanelChromeProps,
  TabStripProps,
  TabItem,
  CapsProps,
  MonoProps,
  SharpBtnProps,
  SharpBtnVariant,
  TGroupProps,
  TBtnProps,
  BandProps,
  MetaCellProps,
  StepperProps,
} from './ui/SettingsPanel';

// ─── shadcn primitives (@wellsfargo-starui/react) + grid-specific adapters ───────────────
export {
  Button,
  buttonVariants,
  Input,
  Textarea,
  Switch,
  Label,
  Separator,
  ToggleGroup,
  ToggleGroupItem,
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPortal,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
  cn,
} from '@wellsfargo-starui/react';
export type { ButtonProps } from '@wellsfargo-starui/react';
export { GhostIconButton } from './ui/GhostIconButton';
export {
  ChromeButton,
  CHROME_BUTTON_RESET,
  type ChromeButtonProps,
} from './ui/ChromeButton';
export type {
  GhostIconButtonProps,
  GhostIconButtonVariant,
  GhostIconButtonSize,
  GhostIconButtonReveal,
} from './ui/GhostIconButton';
export { Select, NativeOptionsSelect } from './ui/NativeOptionsSelect';
export type { NativeOptionsSelectProps } from './ui/NativeOptionsSelect';
export { PopoverCompat } from './ui/PopoverCompat';
export { Tooltip } from './ui/HoverTooltip';
export { ColorPicker, ColorPickerPopover } from './ui/GridColorPickerPopover';
export type { ColorPickerProps, ColorPickerPopoverProps } from './ui/GridColorPickerPopover';

// ─── StyleEditor + ColorPicker + FormatterPicker ─────────────────────────
export {
  StyleEditor,
  TextSection,
  ColorSection,
  BorderSection,
  FormatSection,
  BorderStyleEditor,
} from './ui/StyleEditor';
export type {
  StyleEditorProps,
  StyleEditorValue,
  StyleEditorSection,
  StyleEditorVariant,
  StyleEditorDataType,
  TextAlign,
  FontWeight,
  BorderStyleEditorProps,
  BordersValue,
} from './ui/StyleEditor';
export { CompactColorField } from './ui/ColorPicker';
export type { CompactColorFieldProps } from './ui/ColorPicker';
export {
  FormatterPicker,
  inferPickerDataType,
  presetsForDataType,
  findMatchingPreset,
  defaultSampleValue,
  EXCEL_EXAMPLES,
} from './ui/FormatterPicker';
export type {
  FormatterPickerProps,
  FormatterPreset,
  FormatterPickerDataType,
  ExcelExample,
  ExcelExampleCategory,
} from './ui/FormatterPicker';

// ─── Format editor primitives ────────────────────────────────────────────
export {
  FormatPopover,
  FormatDropdown,
  FormatColorPicker,
  registerPopoverRoot,
  clickIsInsideAnyOpenPopover,
  EDGE_ORDER,
  defaultSideSpec,
  makeDefaultSides,
} from './ui/format-editor';
export type {
  BorderSide,
  BorderStyle,
  BorderMode,
  SideSpec,
} from './ui/format-editor';

// ─── Modules ─────────────────────────────────────────────────────────────
export {
  generalSettingsModule,
  GENERAL_SETTINGS_MODULE_ID,
  INITIAL_GENERAL_SETTINGS,
  type GeneralSettingsState,
} from './modules/general-settings';
export {
  columnTemplatesModule,
  COLUMN_TEMPLATES_MODULE_ID,
  INITIAL_COLUMN_TEMPLATES,
  resolveTemplates,
  snapshotTemplate,
  snapshotTemplateUpdate,
  pickTemplateFields,
  addTemplateReducer,
  removeTemplateReducer,
  updateTemplateReducer,
  renameTemplateReducer,
  type ColumnTemplate,
  type ColumnTemplatesState,
  type RowGroupingTemplate,
  type SnapshotTemplateDeps,
} from './modules/column-templates';
export {
  columnCustomizationModule,
  COLUMN_CUSTOMIZATION_MODULE_ID,
  INITIAL_COLUMN_CUSTOMIZATION,
  applyFilterConfigToColDef,
  applyRowGroupingConfigToColDef,
  useAppDataLookup,
  useAppDataProviders,
  useAppDataKeys,
  parseValuesSource,
  overrideKey,
  stripUndefined,
  mergeOverrides,
  writeOverridesReducer,
  applyTypographyReducer,
  applyColorsReducer,
  applyAlignmentReducer,
  applyBordersReducer,
  clearAllBordersReducer,
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
  type TargetKind,
  type ColumnAssignment,
  type ColumnCustomizationAssignment,
  type ColumnCustomizationState,
  type ColumnFilterConfig,
  type RowGroupingConfig,
  type FilterKind,
  type CellEditorKind,
  type ColumnCellEditorConfig,
  type AggFuncName,
  type SetFilterOptions,
  type MultiFilterEntry,
} from './modules/column-customization';
export {
  conditionalStylingModule,
  CONDITIONAL_STYLING_MODULE_ID,
  INITIAL_CONDITIONAL_STYLING,
  INDICATOR_ICONS,
  findIndicatorIcon,
  toStyleEditorValue,
  fromStyleEditorValue,
  type ConditionalRule,
  type ConditionalStylingState,
  type FlashConfig,
  type FlashTarget,
  type IndicatorPosition,
  type IndicatorTarget,
  type RuleIndicator,
  type RuleScope,
  type IndicatorIconDef,
} from './modules/conditional-styling';
export {
  smartEditModule,
  SMART_EDIT_MODULE_ID,
  SmartEditToolbarBody,
  useSmartEditSelection,
} from './modules/smart-edit';
export {
  bulkUpdateModule,
  BULK_UPDATE_MODULE_ID,
  BulkUpdateToolbarBody,
  useBulkUpdateSelection,
} from './modules/bulk-update';
export {
  plusMinusModule,
  PLUS_MINUS_MODULE_ID,
} from './modules/plus-minus';
export {
  shortcutsModule,
  SHORTCUTS_MODULE_ID,
} from './modules/shortcuts';
export {
  dataChangeHistoryModule,
  DATA_CHANGE_HISTORY_MODULE_ID,
  EditHistoryToolbarBody,
} from './modules/data-change-history';
export {
  alertsModule,
  ALERTS_MODULE_ID,
  AlertsBadge,
  useAlertsToastBridge,
  useAlertsOpenFinBridge,
} from './modules/alerts';
export {
  calculatedColumnsModule,
  CALCULATED_COLUMNS_MODULE_ID,
  INITIAL_CALCULATED_COLUMNS,
  type CalculatedColumnsState,
  type VirtualColumnDef,
} from './modules/calculated-columns';
export {
  savedFiltersModule,
  SAVED_FILTERS_MODULE_ID,
  INITIAL_SAVED_FILTERS,
  type SavedFiltersState,
} from './modules/saved-filters';
export {
  visualExcelModule,
  VISUAL_EXCEL_MODULE_ID,
  exportVisualExcel,
  type VisualExcelExportOptions,
} from './modules/visual-excel';
export type { VisualExcelState } from '@wellsfargo-starui/core';
export {
  toolbarVisibilityModule,
  TOOLBAR_VISIBILITY_MODULE_ID,
  INITIAL_TOOLBAR_VISIBILITY,
  type ToolbarVisibilityState,
} from './modules/toolbar-visibility';
export {
  toolbarDateSettingsModule,
  TOOLBAR_DATE_SETTINGS_MODULE_ID,
  INITIAL_TOOLBAR_DATE_SETTINGS,
  ToolbarDateSettingsPanel,
  applyHistoricalToolbarDateToAppData,
  isHistoricalToolbarDate,
  resolveToolbarDateHistoryEnabled,
  useToolbarDateSettingsBridge,
  type ToolbarDateSettingsState,
} from './modules/toolbar-date-settings';
export {
  ProviderGridHostProvider,
  useProviderGridHost,
  type ProviderGridHostApi,
  type ProviderGridHostMode,
} from './providerGridHost/ProviderGridHostContext';
export {
  GridEventBindingsHostProvider,
  useGridEventBindingsHost,
  type GridEventBindingsHostApi,
} from './gridEventBindingsHost/GridEventBindingsHostContext';
export {
  gridStateModule,
  GRID_STATE_MODULE_ID,
  GRID_STATE_SCHEMA_VERSION,
  INITIAL_GRID_STATE,
  captureGridState,
  applyGridState,
  captureGridStateInto,
  type GridStateState,
  type SavedGridState,
} from './modules/grid-state';
export {
  columnGroupsModule,
  COLUMN_GROUPS_MODULE_ID,
  INITIAL_COLUMN_GROUPS,
  composeGroups,
  collectGroupIds,
  collectAssignedColIds,
  type ColumnGroupsState,
  type ColumnGroupNode,
  type ColumnGroupChild,
  type GroupChildShow,
  type GroupHeaderStyle,
  type GroupHeaderBorderSpec,
} from './modules/column-groups';
export {
  summaryPanelModule,
  SUMMARY_PANEL_MODULE_ID,
  INITIAL_SUMMARY_PANEL,
  useSummaryPanelData,
  SummaryWidgetContent,
  DigestCard,
  QueryCard,
  DataChart,
  compactNumber,
  AnalysisTable,
  compact,
  type SummaryPanelState,
  type SummaryWidget,
  type SummaryWidgetKind,
} from './modules/summary-panel/index.js';
