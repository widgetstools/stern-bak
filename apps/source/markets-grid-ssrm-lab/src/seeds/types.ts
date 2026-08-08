/**
 * Tab seed envelope — pre-baked module state we push into the platform's
 * store the first time a tab's grid mounts. Reuses the engine's own state
 * types (re-exported via `@wellsfargo-starui/grid/customizer` or `@wellsfargo-starui/core`) so
 * the shapes stay byte-compatible with the customizer UI.
 */
import type {
  CalculatedColumnsState,
  ColumnCustomizationState,
  ColumnGroupsState,
  ConditionalStylingState,
  GeneralSettingsState,
  SavedFiltersState,
} from '@wellsfargo-starui/grid/customizer';
import type { AlertsState, BulkUpdateState, DataChangeHistoryState, PlusMinusState, ShortcutsState, SmartEditState, VisualExcelState } from '@wellsfargo-starui/core';

export interface TabSeed {
  'conditional-styling'?: ConditionalStylingState;
  'column-customization'?: ColumnCustomizationState;
  'column-groups'?: ColumnGroupsState;
  'calculated-columns'?: CalculatedColumnsState;
  'general-settings'?: Partial<GeneralSettingsState>;
  'saved-filters'?: SavedFiltersState;
  alerts?: AlertsState;
  'smart-edit'?: SmartEditState;
  'bulk-update'?: BulkUpdateState;
  'plus-minus'?: PlusMinusState;
  shortcuts?: ShortcutsState;
  'data-change-history'?: DataChangeHistoryState;
  'visual-excel'?: VisualExcelState;
}
