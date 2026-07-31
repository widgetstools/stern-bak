/**
 * SimpleBlotter Configuration Types
 * Types for the SimpleBlotter parent config and child layout configs.
 *
 * Architecture:
 * - SimpleBlotterConfig: Parent config (componentType: 'simple-blotter')
 * - SimpleBlotterLayoutConfig: Child config (componentType: 'simple-blotter-layout')
 * - Linked via parentId field in UnifiedConfig
 */

// ============================================================================
// Toolbar Types
// ============================================================================

export type ToolbarZone = 'start' | 'left' | 'center' | 'right' | 'end';
export type ToolbarButtonVariant = 'default' | 'outline' | 'ghost' | 'destructive';

export interface ToolbarMenuItem {
  id: string;
  label: string;
  icon?: string;
  action: string;
  actionData?: Record<string, unknown>;
  disabled?: boolean;
  separator?: boolean;
}

export interface ToolbarButton {
  id: string;
  label: string;
  icon?: string;
  tooltip?: string;
  action: string;
  actionData?: Record<string, unknown>;
  zone?: ToolbarZone;
  variant?: ToolbarButtonVariant;
  showLabel?: boolean;
  disabled?: boolean;
  visible?: boolean;
  menuItems?: ToolbarMenuItem[];
  order?: number;
}

export type ToolbarColor = 'blue' | 'green' | 'purple' | 'orange' | 'pink' | 'cyan' | 'red' | 'yellow';

export interface DynamicToolbar {
  id: string;
  name?: string;
  position: 'above' | 'below';
  order?: number;
  color?: ToolbarColor;
  defaultCollapsed?: boolean;
  defaultPinned?: boolean;
  buttons?: ToolbarButton[];
  componentRef?: string;
  componentProps?: Record<string, unknown>;
}

export interface BlotterToolbarConfig {
  showLayoutSelector?: boolean;
  showExportButton?: boolean;
  showFilterBar?: boolean;
  showColumnChooser?: boolean;
  showRefreshButton?: boolean;
  showSettingsButton?: boolean;
  customButtons?: ToolbarButton[];
  additionalToolbars?: DynamicToolbar[];
  toolbarStates?: ToolbarStatesMap;
}

// ============================================================================
// Action Registry Types
// ============================================================================

export interface ActionParameter {
  name: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'multiselect';
  required?: boolean;
  default?: unknown;
  options?: Array<{ label: string; value: unknown }>;
  description?: string;
}

export interface ActionMetadata {
  id: string;
  name: string;
  description?: string;
  category: string;
  icon?: string;
  parameters?: ActionParameter[];
}

export const BUILT_IN_ACTIONS = {
  REFRESH: 'grid:refresh',
  EXPORT_CSV: 'grid:exportCsv',
  EXPORT_EXCEL: 'grid:exportExcel',
  RESET_COLUMNS: 'grid:resetColumns',
  RESET_FILTERS: 'grid:resetFilters',
  AUTO_SIZE_COLUMNS: 'grid:autoSizeColumns',
  SELECT_ALL: 'selection:all',
  DESELECT_ALL: 'selection:none',
  COPY_SELECTED: 'selection:copy',
  COLUMN_CHOOSER: 'dialog:columnChooser',
  ADVANCED_FILTERS: 'dialog:advancedFilters',
  SETTINGS: 'dialog:settings',
} as const;

// ============================================================================
// Rule Type Definitions
// ============================================================================

export interface ConditionalFormatStyle {
  backgroundColor?: string;
  color?: string;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline' | 'line-through';
}

export type ConditionType =
  | 'equals'
  | 'notEquals'
  | 'greaterThan'
  | 'lessThan'
  | 'between'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'custom';

export interface ConditionalFormatRule {
  id: string;
  name: string;
  description?: string;
  field: string | '*';
  condition: ConditionType;
  value: unknown;
  value2?: unknown;
  customCondition?: string;
  style: ConditionalFormatStyle;
  priority: number;
}

export interface EditingCondition {
  field: string;
  operator: 'equals' | 'notEquals' | 'in' | 'notIn';
  value: unknown;
}

export interface EditingValidation {
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: string;
  customValidator?: string;
}

export interface EditingRule {
  id: string;
  name: string;
  description?: string;
  field: string;
  editable: boolean;
  condition?: EditingCondition;
  validation?: EditingValidation;
}

export interface ColumnGroup {
  id: string;
  name: string;
  description?: string;
  columns: string[];
  defaultExpanded: boolean;
}

export type FormatterType = 'number' | 'currency' | 'percentage' | 'date' | 'custom';

export interface FormatterOptions {
  decimals?: number;
  thousandsSeparator?: boolean;
  prefix?: string;
  suffix?: string;
  currency?: string;
  dateFormat?: string;
  customFormatter?: string;
}

export interface ValueFormatterDef {
  id: string;
  name: string;
  description?: string;
  field: string;
  type: FormatterType;
  options: FormatterOptions;
}

export type CalculatedColumnResultType = 'number' | 'string' | 'boolean' | 'date';

export interface CalculatedColumnDef {
  id: string;
  name: string;
  description?: string;
  field: string;
  headerName: string;
  expression: string;
  dependencies: string[];
  resultType: CalculatedColumnResultType;
}

// ============================================================================
// AG-Grid State Types
// ============================================================================

export interface ColumnState {
  colId: string;
  width?: number;
  hide?: boolean;
  pinned?: 'left' | 'right' | null;
  sort?: 'asc' | 'desc' | null;
  sortIndex?: number | null;
  aggFunc?: string | null;
  rowGroup?: boolean;
  rowGroupIndex?: number | null;
  pivot?: boolean;
  pivotIndex?: number | null;
  flex?: number | null;
}

export interface SortModelItem {
  colId: string;
  sort: 'asc' | 'desc';
}

export interface PinnedColumnsConfig {
  left: string[];
  right: string[];
}

// ============================================================================
// SimpleBlotter Config (Parent)
// ============================================================================

export type BlotterThemeMode = 'system' | 'light' | 'dark';

export interface SimpleBlotterConfig {
  dataProviderId: string;
  defaultLayoutId?: string;
  lastSelectedLayoutId?: string;
  toolbar: BlotterToolbarConfig;
  themeMode: BlotterThemeMode;
  title: string;
  autoRefreshInterval?: number;
  enableRealTimeUpdates: boolean;
  conditionalFormattingRules: ConditionalFormatRule[];
  editingRules: EditingRule[];
  columnGroups: ColumnGroup[];
  valueFormatters: ValueFormatterDef[];
  calculatedColumns: CalculatedColumnDef[];
}

// ============================================================================
// SimpleBlotter Layout Config (Child)
// ============================================================================

export interface BlotterToolbarState {
  isCollapsed: boolean;
  isPinned: boolean;
}

export interface ToolbarStatesMap {
  [toolbarId: string]: BlotterToolbarState;
}

export interface SimpleBlotterLayoutConfig {
  selectedProviderId?: string | null;
  toolbarState?: BlotterToolbarState;
  toolbarConfig?: BlotterToolbarConfig;
  toolbarStates?: ToolbarStatesMap;
  columnDefs: Record<string, unknown>[];
  columnState: ColumnState[];
  filterState: Record<string, unknown>;
  sortState: SortModelItem[];
  activeFormattingRuleIds: string[];
  activeEditingRuleIds: string[];
  activeColumnGroupIds: string[];
  activeFormatterIds: string[];
  activeCalculatedColumnIds: string[];
  rowHeight?: number;
  headerHeight?: number;
  pinnedColumns?: PinnedColumnsConfig;
  rowGroupColumns?: string[];
  pivotColumns?: string[];
  sideBarState?: SideBarState;
}

export interface SideBarState {
  visible: boolean;
  position?: 'left' | 'right';
  openToolPanel?: string | null;
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createDefaultBlotterConfig(overrides?: Partial<SimpleBlotterConfig>): SimpleBlotterConfig {
  return {
    dataProviderId: '',
    defaultLayoutId: undefined,
    toolbar: {
      showLayoutSelector: true,
      showExportButton: true,
      showFilterBar: true,
      showColumnChooser: true,
      showRefreshButton: true,
      showSettingsButton: true,
      customButtons: []
    },
    themeMode: 'system',
    title: 'Simple Blotter',
    autoRefreshInterval: 0,
    enableRealTimeUpdates: true,
    conditionalFormattingRules: [],
    editingRules: [],
    columnGroups: [],
    valueFormatters: [],
    calculatedColumns: [],
    ...overrides
  };
}

export function createDefaultLayoutConfig(overrides?: Partial<SimpleBlotterLayoutConfig>): SimpleBlotterLayoutConfig {
  return {
    columnDefs: [],
    columnState: [],
    filterState: {},
    sortState: [],
    activeFormattingRuleIds: [],
    activeEditingRuleIds: [],
    activeColumnGroupIds: [],
    activeFormatterIds: [],
    activeCalculatedColumnIds: [],
    rowHeight: undefined,
    headerHeight: undefined,
    pinnedColumns: undefined,
    rowGroupColumns: [],
    pivotColumns: [],
    sideBarState: { visible: false, openToolPanel: null },
    ...overrides
  };
}
