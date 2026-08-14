/**
 * Unified formatter state — public surface.
 *
 * Single hook (`useFormatter`) that returns every piece of state + every
 * action the two formatter surfaces (in-grid `<FormattingToolbar />` and
 * popped-out `<FormattingPropertiesPanel />`) need. Both surfaces consume
 * the same `useFormatter()` shape so behavioural drift is impossible —
 * change a reducer in one place and both surfaces pick it up.
 *
 * Implementation is decomposed across three feature-focused hooks
 * composed here:
 *
 *   ./useFormatterSelection.ts   colIds / target / scope + derived state
 *                                (fmt, disabled, isHeader, colLabel,
 *                                pickerDataType, singleColumnSelected)
 *   ./useFormatterActions.ts     history (undo/redo) + every mutation
 *                                callback (style, format, clear, editor,
 *                                filter, general settings, header name,
 *                                preview text)
 *   ./useFormatterTemplates.ts   templates list + save / update / rename
 *                                / delete actions
 *
 * The composer is intentionally thin: it just wires the slices together
 * and reshapes into the public `state` + `actions` bundle that hasn't
 * changed since the original monolithic version.
 */

import {
  type BorderSpec,
  type ValueFormatterTemplate,
} from '@wellsfargo-starui/core';
import type {
  CellEditorKind,
  FilterKind,
} from '../../customizer/internal.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import type {
  ResolvedFormatting,
  ScopeKind,
  TargetKind,
} from '../formattingToolbarHooks';
import { useFormatterSelection } from './useFormatterSelection';
import { useFormatterActions } from './useFormatterActions';
import { useFormatterTemplates } from './useFormatterTemplates';

export type PickerDataType = 'number' | 'date' | 'datetime' | 'boolean' | 'string';

export interface FormatterState {
  /** Currently-targeted columns. Empty when no column is focused. */
  colIds: string[];
  /** Single-column display label (header name or fallback id). */
  colLabel: string;
  /** Per-call site `cellDataType` of the first targeted column. */
  pickerDataType: PickerDataType;
  /** Cell vs header — drives whether type/colour writes go into
   *  cellStyleOverrides or headerStyleOverrides. Formatters are
   *  always cell-scope (headers have no formatter). */
  target: TargetKind;
  /** Selected-column override vs global baseline. `'all'` writes to
   *  `globalCellStyle` / `globalHeaderStyle`; `'selected'` writes per-
   *  column. Per-column wins over global at render time. */
  scope: ScopeKind;
  /** True when no column is selected. Modules use this to disable. */
  disabled: boolean;
  /** True when target = 'header'. Format module disables itself. */
  isHeader: boolean;
  /** Resolved styling + formatter view of the active assignment. */
  fmt: ResolvedFormatting;
  /** Formatted output of `fmt.valueFormatterTemplate` against a
   *  representative sample value for the picker data type. */
  previewText: string;
  /** Column templates — sorted alphabetically. */
  templates: Array<{ id: string; name: string }>;
  /** First template id chained on the active column, when any. */
  activeTemplateId?: string;
  /** Save-as-template input draft + flash-confirm flag. */
  saveAsTplName: string;
  saveAsTplConfirmed: boolean;
  /** Clear-all flash (check icon) after a direct clear. */
  clearConfirmed: boolean;
  /** Clear-selected (current column scope) flash after a direct clear. */
  clearSelectedConfirmed: boolean;
  /** Undo / redo affordances bound to column-customization. */
  canUndo: boolean;
  canRedo: boolean;
  /** True only when exactly one column is selected — gates the
   *  inline column-caption rename UI. */
  singleColumnSelected: boolean;
  /** True when the resolved assignment forces cells to be editable.
   *  Drives the editable-toggle pill's active state. */
  cellsEditable: boolean;
  /** Currently-configured cell editor kind on the active column.
   *  Undefined when the column has no structured cellEditor override. */
  cellEditorKind?: CellEditorKind;
  /** Static value list used by select / rich-select editors. Undefined
   *  when in AppData mode or when no values were authored. */
  cellEditorValues?: ReadonlyArray<string | number>;
  /** AppData binding for select / rich-select editor values. Format:
   *  `{{providerName.key}}`. Undefined when in static-list mode. */
  cellEditorValuesSource?: string;
  /** "Primary" filter kind shown by the formatter dropdown — when the
   *  column's filter is an `agMultiColumnFilter`, this is sub-1. When
   *  it's a non-multi single kind, that kind is reflected directly.
   *  Undefined when filtering is off / not configured. */
  filterPrimaryKind?: FilterKind;
  /** True when the active column has a non-quick-pickable filter
   *  configuration (e.g. streamSafe wrappers, custom multiFilters list
   *  with non-default sub-2). Drives a "Custom" badge on the dropdown
   *  so the user knows the granular config lives in the settings panel
   *  and the quick-pick would overwrite it. */
  filterIsCustom: boolean;
  /** Floating filter row visibility on the active column. */
  floatingFilterOn: boolean;
  /** Human-readable list of template categories the active column has
   *  authored that would be captured if "Save as new" / "Update" fired
   *  right now (e.g. `['Cell style', 'Formatter', 'Filter']`). Drives
   *  the TemplateManager's "what will be saved" hint. Empty when the
   *  column has nothing template-eligible. */
  capturableFields: ReadonlyArray<string>;
  /** Grid-wide header caption presentation toggle. */
  headerCaseUppercase: boolean;
  /** Grid-wide cell-tooltip toggle. When on, every cell shows its
   *  displayed value as a hover tooltip via AG-Grid's
   *  `defaultColDef.tooltipValueGetter`. */
  showCellTooltips: boolean;
  /** Global number-formatter for the CELLS + ALL scope. Surfaces the
   *  current `globalCellNumberFormatter` slot so the toolbar's number
   *  dropdown can highlight what's already applied. */
  globalNumberFormatter?: ValueFormatterTemplate;
  /** Global date-formatter for the CELLS + ALL scope. */
  globalDateFormatter?: ValueFormatterTemplate;
}

export interface FormatterActions {
  setTarget: (t: TargetKind) => void;
  setScope: (s: ScopeKind) => void;
  toggleBold: () => void;
  toggleItalic: () => void;
  toggleUnderline: () => void;
  setFontSizePx: (px: number) => void;
  toggleAlign: (h: 'left' | 'center' | 'right') => void;
  setTextColor: (c: string | undefined) => void;
  setBgColor: (c: string | undefined) => void;
  applyBordersMap: (
    next: { top?: BorderSpec; right?: BorderSpec; bottom?: BorderSpec; left?: BorderSpec },
  ) => void;
  doFormat: (t: ValueFormatterTemplate | undefined, kind?: 'number' | 'date') => void;
  decreaseDecimals: () => void;
  increaseDecimals: () => void;
  applyTemplate: (tplId: string) => void;
  saveAsTemplate: (name: string) => string | undefined;
  /** Re-snapshot the active column and overwrite an existing template's
   *  data fields. Identity (id, name, description, createdAt) is
   *  preserved; updatedAt bumps. Returns true on a successful write,
   *  false when the column has nothing template-eligible to capture. */
  updateTemplate: (tplId: string) => boolean;
  /** Rename an existing template. Empty / whitespace-only names are
   *  rejected (returns false). Unknown id is also a no-op (returns
   *  false). */
  renameTemplate: (tplId: string, name: string) => boolean;
  deleteTemplate: (tplId: string) => void;
  setSaveAsTplName: (v: string) => void;
  flashSaveAsTpl: () => void;
  /** Clear every column's styling in the active layout (fires immediately). */
  confirmClearAll: () => void;
  /** Reset every targeted column's assignment to a bare `{ colId }` (fires
   *  immediately; no-op when nothing is selected). */
  confirmClearSelected: () => void;
  undo: () => void;
  redo: () => void;
  /** Rename the single targeted column's display caption. Empty / blank
   *  clears the override so the host's original headerName takes over. */
  setHeaderName: (name: string) => void;
  /** Toggle the `editable` override on every targeted column. Active
   *  state writes `true`, inactive writes `false` (explicit lock). */
  toggleEditable: () => void;
  /** Set or clear the structured cellEditor kind on every targeted
   *  column. Pass `undefined` to remove the override entirely. */
  setCellEditorKind: (kind: CellEditorKind | undefined) => void;
  /** Patch the static `values` and / or `valuesSource` on the targeted
   *  columns' cellEditor config. No-op when no kind is set. Either
   *  field can be cleared by passing `undefined`. */
  setCellEditorValues: (
    patch: { values?: Array<string | number> | undefined; valuesSource?: string | undefined },
  ) => void;
  /** Set or clear the primary filter kind. When set, writes an
   *  `agMultiColumnFilter` envelope with the chosen kind as sub-1 and
   *  `agSetColumnFilter` as the implicit sub-2. Pass `undefined` to
   *  drop the filter config entirely. */
  setFilterPrimaryKind: (kind: FilterKind | undefined) => void;
  /** Toggle the floating-filter row on every targeted column. */
  toggleFloatingFilter: () => void;
  /** Toggle every column header caption between natural case and UPPERCASE. */
  toggleHeaderCaseUppercase: () => void;
  toggleCellTooltips: () => void;
}

export interface UseFormatterResult {
  state: FormatterState;
  actions: FormatterActions;
}

/**
 * Returns the unified state + action bundle. Call once at the
 * orchestrator level (the wrapper component that hosts both the
 * toolbar and the popped panel) and pass `state` + `actions` down to
 * the modules.
 *
 * Internally composes three sibling hooks — see ./useFormatterSelection,
 * ./useFormatterActions, ./useFormatterTemplates for each slice's
 * implementation.
 */
export function useFormatter(): UseFormatterResult {
  const selection = useFormatterSelection();
  const actions = useFormatterActions({
    selection,
    pickerDataType: selection.pickerDataType,
  });
  const templates = useFormatterTemplates({
    selection,
    custState: actions.shared.custState,
    tplState: actions.shared.tplState,
    setTplState: actions.shared.setTplState,
    setCustStateWithHistory: actions.shared.setCustStateWithHistory,
  });

  return {
    state: {
      // Selection slice
      colIds: selection.colIds,
      colLabel: selection.colLabel,
      pickerDataType: selection.pickerDataType,
      target: selection.target,
      scope: selection.scope,
      disabled: selection.disabled,
      isHeader: selection.isHeader,
      fmt: selection.fmt,
      singleColumnSelected: selection.singleColumnSelected,
      // Templates slice
      templates: templates.templates,
      activeTemplateId: templates.activeTemplateId,
      capturableFields: templates.capturableFields,
      saveAsTplName: templates.saveAsTplName,
      saveAsTplConfirmed: templates.saveAsTplConfirmed,
      // Actions slice (state half)
      previewText: actions.state.previewText,
      clearConfirmed: actions.state.clearConfirmed,
      clearSelectedConfirmed: actions.state.clearSelectedConfirmed,
      canUndo: actions.state.canUndo,
      canRedo: actions.state.canRedo,
      cellsEditable: actions.state.cellsEditable,
      cellEditorKind: actions.state.cellEditorKind,
      cellEditorValues: actions.state.cellEditorValues,
      cellEditorValuesSource: actions.state.cellEditorValuesSource,
      filterPrimaryKind: actions.state.filterPrimaryKind,
      filterIsCustom: actions.state.filterIsCustom,
      floatingFilterOn: actions.state.floatingFilterOn,
      headerCaseUppercase: actions.state.headerCaseUppercase,
      showCellTooltips: actions.state.showCellTooltips,
      globalNumberFormatter: actions.state.globalNumberFormatter,
      globalDateFormatter: actions.state.globalDateFormatter,
    },
    actions: {
      setTarget: selection.setTarget,
      setScope: selection.setScope,
      ...actions.actions,
      ...templates.actions,
    },
  };
}
