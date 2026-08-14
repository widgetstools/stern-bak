/**
 * Actions slice of useFormatter() — owns history (undo/redo) and every
 * mutation callback the formatter UI dispatches.
 *
 * Groups by feature inside the file:
 *   - History wrapper
 *   - Typography + alignment + colour writers
 *   - Number / date format writers (incl. decimals up/down)
 *   - Border multi-side diff writer
 *   - Clear-all + clear-selected (state + actions)
 *   - Editor + filter quick-pick (state + actions)
 *   - General settings toggles (header case, cell tooltips)
 *   - Header-name + editable toggle on the active column
 *   - Live-formatted preview text
 *
 * Templates live in `useFormatterTemplates` — keeps the template / column
 * write paths in one place. The composer in ./state.ts merges this hook's
 * output with the selection + templates slices into the public bundle.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  valueFormatterFromTemplate,
  type BorderSpec,
  type ValueFormatterTemplate,
} from '@wellsfargo-starui/core';
import {
  applyAlignmentReducer,
  applyBordersReducer,
  applyCellEditorKindReducer,
  applyCellEditorValuesReducer,
  applyColorsReducer,
  applyEditableReducer,
  applyFilterPrimaryKindReducer,
  applyFloatingFilterReducer,
  applyFormatterReducer,
  applyHeaderNameReducer,
  applyTypographyReducer,
  clearAllStylesInProfileReducer,
  clearAllStylesReducer,
  GENERAL_SETTINGS_MODULE_ID,
  INITIAL_GENERAL_SETTINGS,
  useModuleState,
  useUndoRedo,
  type CellEditorKind,
  type ColumnCustomizationState,
  type FilterKind,
  type GeneralSettingsState,
} from '../../customizer/internal.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import {
  numberTemplate,
  templateDecimals,
} from '../formatterPresets';
import {
  resolveTemplates,
  type ColumnTemplatesState,
} from '../../customizer/internal.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import {
  readFirstRowValue,
  useFlashConfirm,
  type TargetKind,
} from '../formattingToolbarHooks';
import type { FormatterSelection } from './useFormatterSelection';
import type { PickerDataType } from './state';
import { useGridPlatform } from '../../customizer/internal.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)

export interface FormatterActionsSlice {
  /** Bundle of state values owned by this slice (clear flags, editor /
   *  filter quick-pick reads, general settings flags, preview text,
   *  undo/redo availability, global formatters). */
  state: {
    clearConfirmed: boolean;
    clearSelectedConfirmed: boolean;
    canUndo: boolean;
    canRedo: boolean;
    cellsEditable: boolean;
    cellEditorKind?: CellEditorKind;
    cellEditorValues?: ReadonlyArray<string | number>;
    cellEditorValuesSource?: string;
    filterPrimaryKind?: FilterKind;
    filterIsCustom: boolean;
    floatingFilterOn: boolean;
    headerCaseUppercase: boolean;
    showCellTooltips: boolean;
    globalNumberFormatter?: ValueFormatterTemplate;
    globalDateFormatter?: ValueFormatterTemplate;
    previewText: string;
  };
  actions: {
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
    confirmClearAll: () => void;
    confirmClearSelected: () => void;
    undo: () => void;
    redo: () => void;
    setHeaderName: (name: string) => void;
    toggleEditable: () => void;
    setCellEditorKind: (kind: CellEditorKind | undefined) => void;
    setCellEditorValues: (
      patch: { values?: Array<string | number> | undefined; valuesSource?: string | undefined },
    ) => void;
    setFilterPrimaryKind: (kind: FilterKind | undefined) => void;
    toggleFloatingFilter: () => void;
    toggleHeaderCaseUppercase: () => void;
    toggleCellTooltips: () => void;
  };
  /** Surfaces shared with the templates hook so it can route writes
   *  through the same history wrapper / module-state dispatcher. */
  shared: {
    custState: ColumnCustomizationState | undefined;
    tplState: ColumnTemplatesState | undefined;
    setTplState: (
      updater: (prev: ColumnTemplatesState | undefined) => ColumnTemplatesState | undefined,
    ) => void;
    setCustStateWithHistory: (
      updater: (
        prev: ColumnCustomizationState | undefined,
      ) => ColumnCustomizationState,
    ) => void;
  };
}

export interface FormatterActionsDeps {
  selection: FormatterSelection;
  pickerDataType: PickerDataType;
}

export function useFormatterActions(deps: FormatterActionsDeps): FormatterActionsSlice {
  const { selection, pickerDataType } = deps;
  const { colIds: colIdsRef, target: targetRef, scope: scopeRef } = selection.refs;
  const fmt = selection.fmt;
  const platform = useGridPlatform();

  const [custState, setCustState] = useModuleState<ColumnCustomizationState>('column-customization');
  const [tplState, setTplState] = useModuleState<ColumnTemplatesState>('column-templates');
  const [generalSettingsState, setGeneralSettingsState] = useModuleState<GeneralSettingsState>(
    GENERAL_SETTINGS_MODULE_ID,
  );
  const headerCaseUppercase = !!generalSettingsState?.headerCaseUppercase;
  const showCellTooltips = !!generalSettingsState?.showCellTooltips;

  // ─── History wrapper ────────────────────────────────────────────────
  const undoRedo = useUndoRedo<ColumnCustomizationState | undefined>(
    custState,
    (next) => setCustState(() => next as ColumnCustomizationState),
    { limit: 50 },
  );
  const setCustStateWithHistory = useCallback<typeof setCustState>(
    (updater) => {
      undoRedo.push();
      setCustState(updater);
    },
    [setCustState, undoRedo],
  );

  // ─── Clear-all + clear-selected state ────────────────────────────────
  const [clearConfirmed, flashClear] = useFlashConfirm();
  const [clearSelectedConfirmed, flashClearSelected] = useFlashConfirm();

  // ─── Typography + alignment + colours ────────────────────────────────

  const toggleBold = useCallback(() => {
    setCustStateWithHistory(applyTypographyReducer(colIdsRef.current, targetRef.current, { bold: fmt.bold ? undefined : true }, scopeRef.current));
  }, [setCustStateWithHistory, fmt.bold, colIdsRef, targetRef, scopeRef]);

  const toggleItalic = useCallback(() => {
    setCustStateWithHistory(applyTypographyReducer(colIdsRef.current, targetRef.current, { italic: fmt.italic ? undefined : true }, scopeRef.current));
  }, [setCustStateWithHistory, fmt.italic, colIdsRef, targetRef, scopeRef]);

  const toggleUnderline = useCallback(() => {
    setCustStateWithHistory(applyTypographyReducer(colIdsRef.current, targetRef.current, { underline: fmt.underline ? undefined : true }, scopeRef.current));
  }, [setCustStateWithHistory, fmt.underline, colIdsRef, targetRef, scopeRef]);

  const setFontSizePx = useCallback((px: number) => {
    if (scopeRef.current === 'selected' && colIdsRef.current.length === 0) return;
    setCustStateWithHistory(applyTypographyReducer(colIdsRef.current, targetRef.current, { fontSize: px }, scopeRef.current));
  }, [setCustStateWithHistory, colIdsRef, targetRef, scopeRef]);

  const toggleAlign = useCallback((h: 'left' | 'center' | 'right') => {
    const next = fmt.horizontal === h ? undefined : h;
    setCustStateWithHistory(applyAlignmentReducer(colIdsRef.current, targetRef.current, { horizontal: next }, scopeRef.current));
  }, [setCustStateWithHistory, fmt.horizontal, colIdsRef, targetRef, scopeRef]);

  const setTextColor = useCallback((c: string | undefined) => {
    if (scopeRef.current === 'selected' && colIdsRef.current.length === 0) return;
    setCustStateWithHistory(applyColorsReducer(colIdsRef.current, targetRef.current, { text: c || undefined }, scopeRef.current));
  }, [setCustStateWithHistory, colIdsRef, targetRef, scopeRef]);

  const setBgColor = useCallback((c: string | undefined) => {
    setCustStateWithHistory(applyColorsReducer(colIdsRef.current, targetRef.current, { background: c || undefined }, scopeRef.current));
  }, [setCustStateWithHistory, colIdsRef, targetRef, scopeRef]);

  // ─── Number / date format + decimals ─────────────────────────────────

  const doFormat = useCallback(
    (t: ValueFormatterTemplate | undefined, kind: 'number' | 'date' = 'number') => {
      // Global scope routes by `kind` — number presets land on the
      // global number-formatter slot, date presets on the date slot.
      // Per-column writes ignore `kind` and use the column's single
      // `valueFormatterTemplate` slot.
      setCustStateWithHistory(
        applyFormatterReducer(colIdsRef.current, t, scopeRef.current, kind),
      );
    },
    [setCustStateWithHistory, colIdsRef, scopeRef],
  );

  // Decimals — read the live state so consecutive clicks compound on
  // the latest committed formatter.
  //
  // Scope-aware:
  //   - `'selected'` reads the active column's resolved template; falls
  //     back to inspecting the first row's value when the column has no
  //     formatter yet.
  //   - `'all'` reads `globalCellNumberFormatter` (writes from the
  //     +/- buttons land there too). Default to `2` when no global
  //     number formatter has been authored yet.
  const getCurrentDecimals = useCallback((): number => {
    if (scopeRef.current === 'all') {
      const d = templateDecimals(custState?.globalCellNumberFormatter);
      return d ?? 2;
    }
    const ids = colIdsRef.current;
    if (!ids.length) return 2;
    const a = custState?.assignments?.[ids[0]];
    if (a) {
      const resolved = resolveTemplates(a, tplState ?? { templates: {}, typeDefaults: {} }, undefined);
      const d = templateDecimals(resolved.valueFormatterTemplate);
      if (d !== null) return d;
    }
    const val = readFirstRowValue(platform.api.api, ids[0]);
    if (typeof val === 'number') {
      const s = String(val);
      const dot = s.indexOf('.');
      return dot >= 0 ? s.length - dot - 1 : 0;
    }
    return 2;
  }, [custState, tplState, platform, colIdsRef, scopeRef]);

  const decreaseDecimals = useCallback(() => {
    // SELECTED requires at least one column focused; ALL never does.
    if (scopeRef.current === 'selected' && !colIdsRef.current.length) return;
    doFormat(numberTemplate(getCurrentDecimals() - 1));
  }, [doFormat, getCurrentDecimals, colIdsRef, scopeRef]);

  const increaseDecimals = useCallback(() => {
    if (scopeRef.current === 'selected' && !colIdsRef.current.length) return;
    doFormat(numberTemplate(getCurrentDecimals() + 1));
  }, [doFormat, getCurrentDecimals, colIdsRef, scopeRef]);

  // ─── Borders — multi-side diff routed through one undoable step ───
  const applyBordersMap = useCallback(
    (next: { top?: BorderSpec; right?: BorderSpec; bottom?: BorderSpec; left?: BorderSpec }) => {
      const sides: Array<'top' | 'right' | 'bottom' | 'left'> = ['top', 'right', 'bottom', 'left'];
      const current = fmt.borders;
      const toSet: Partial<Record<'top' | 'right' | 'bottom' | 'left', BorderSpec>> = {};
      const toClear: Array<'top' | 'right' | 'bottom' | 'left'> = [];
      for (const s of sides) {
        const cur = current[s];
        const nxt = next[s];
        if (!cur && !nxt) continue;
        if (!nxt) {
          toClear.push(s);
        } else if (
          !cur ||
          cur.width !== nxt.width ||
          cur.color !== nxt.color ||
          cur.style !== nxt.style
        ) {
          toSet[s] = nxt;
        }
      }
      const hasAny = toClear.length > 0 || Object.keys(toSet).length > 0;
      if (hasAny) undoRedo.push();
      if (toClear.length) {
        setCustState(applyBordersReducer(colIdsRef.current, targetRef.current, toClear, undefined, scopeRef.current));
      }
      const bySpec = new Map<string, Array<'top' | 'right' | 'bottom' | 'left'>>();
      for (const [side, spec] of Object.entries(toSet) as Array<[
        'top' | 'right' | 'bottom' | 'left',
        BorderSpec,
      ]>) {
        const key = `${spec.width}|${spec.style}|${spec.color}`;
        const list = bySpec.get(key) ?? [];
        list.push(side);
        bySpec.set(key, list);
      }
      for (const [, list] of bySpec) {
        if (list.length) {
          setCustState(applyBordersReducer(colIdsRef.current, targetRef.current, list, toSet[list[0]]!, scopeRef.current));
        }
      }
    },
    [fmt.borders, setCustState, undoRedo, colIdsRef, targetRef, scopeRef],
  );

  // ─── Clear-all + clear-selected actions ──────────────────────────────

  const confirmClearAll = useCallback(() => {
    setCustStateWithHistory(clearAllStylesInProfileReducer());
    flashClear();
  }, [setCustStateWithHistory, flashClear]);

  const confirmClearSelected = useCallback(() => {
    if (!colIdsRef.current.length) return;
    setCustStateWithHistory(clearAllStylesReducer(colIdsRef.current));
    flashClearSelected();
  }, [setCustStateWithHistory, flashClearSelected, colIdsRef]);

  // ─── Header name + editable ──────────────────────────────────────────

  const setHeaderName = useCallback((name: string) => {
    if (colIdsRef.current.length !== 1) return;
    setCustStateWithHistory(applyHeaderNameReducer(colIdsRef.current, name));
  }, [setCustStateWithHistory, colIdsRef]);

  const toggleEditable = useCallback(() => {
    if (!colIdsRef.current.length) return;
    const current = !!fmt.editable;
    setCustStateWithHistory(applyEditableReducer(colIdsRef.current, !current));
  }, [setCustStateWithHistory, fmt.editable, colIdsRef]);

  // ─── Editor + filter quick-pick reads ────────────────────────────────
  //
  // Filter dropdown shows the streamSafe wrappers as Text/Number. Any
  // other kind (raw agText/agNumber/agDate, plain agMulti, custom
  // multiFilters list) is surfaced as "Custom" so the dropdown won't
  // silently overwrite tuned config when the user touches it — the
  // column-settings panel stays the source of truth for those.
  const editorAndFilter = useMemo(() => {
    const colId = selection.colIds[0];
    const a = colId ? custState?.assignments?.[colId] : undefined;
    const cellEditorKind = a?.cellEditor?.kind;
    const cellEditorValues = a?.cellEditor?.values;
    const cellEditorValuesSource = a?.cellEditor?.valuesSource;
    const filter = a?.filter;
    let filterPrimaryKind: FilterKind | undefined;
    let filterIsCustom = false;
    if (filter?.enabled === false) {
      filterPrimaryKind = undefined;
    } else if (filter?.kind === 'streamSafeMultiColumnFilter'
            || filter?.kind === 'streamSafeMultiNumberColumnFilter') {
      filterPrimaryKind = filter.kind;
    } else if (filter?.kind) {
      filterIsCustom = true;
    }
    const floatingFilterOn = filter?.floatingFilter === true;
    return {
      cellEditorKind,
      cellEditorValues,
      cellEditorValuesSource,
      filterPrimaryKind,
      filterIsCustom,
      floatingFilterOn,
    };
  }, [selection.colIds, custState]);

  const setCellEditorKind = useCallback(
    (kind: CellEditorKind | undefined) => {
      if (!colIdsRef.current.length) return;
      setCustStateWithHistory(applyCellEditorKindReducer(colIdsRef.current, kind));
    },
    [setCustStateWithHistory, colIdsRef],
  );

  const setCellEditorValues = useCallback(
    (patch: { values?: Array<string | number> | undefined; valuesSource?: string | undefined }) => {
      if (!colIdsRef.current.length) return;
      setCustStateWithHistory(applyCellEditorValuesReducer(colIdsRef.current, patch));
    },
    [setCustStateWithHistory, colIdsRef],
  );

  const setFilterPrimaryKind = useCallback(
    (kind: FilterKind | undefined) => {
      if (!colIdsRef.current.length) return;
      setCustStateWithHistory(applyFilterPrimaryKindReducer(colIdsRef.current, kind));
    },
    [setCustStateWithHistory, colIdsRef],
  );

  const toggleFloatingFilter = useCallback(() => {
    if (!colIdsRef.current.length) return;
    setCustStateWithHistory(
      applyFloatingFilterReducer(colIdsRef.current, !editorAndFilter.floatingFilterOn),
    );
  }, [setCustStateWithHistory, editorAndFilter.floatingFilterOn, colIdsRef]);

  // ─── General settings toggles ────────────────────────────────────────

  const toggleHeaderCaseUppercase = useCallback(() => {
    setGeneralSettingsState((prev) => {
      const base = prev ?? INITIAL_GENERAL_SETTINGS;
      return { ...base, headerCaseUppercase: !base.headerCaseUppercase };
    });
  }, [setGeneralSettingsState]);

  const toggleCellTooltips = useCallback(() => {
    setGeneralSettingsState((prev) => {
      const base = prev ?? INITIAL_GENERAL_SETTINGS;
      return { ...base, showCellTooltips: !base.showCellTooltips };
    });
  }, [setGeneralSettingsState]);

  // ─── Live preview ────────────────────────────────────────────────────

  const previewSample: unknown =
    pickerDataType === 'number'   ? 1234.5678
    : pickerDataType === 'date'     ? new Date('2026-04-17T00:00:00Z')
    : pickerDataType === 'datetime' ? new Date('2026-04-17T09:30:00Z')
    : pickerDataType === 'boolean'  ? true
    :                                 'sample';

  const vft = fmt.valueFormatterTemplate;
  const previewText = useMemo(() => {
    if (!vft) {
      return String(previewSample instanceof Date
        ? previewSample.toISOString().slice(0, 10)
        : previewSample);
    }
    try { return valueFormatterFromTemplate(vft)({ value: previewSample }); }
    catch { return '—'; }
  }, [vft, previewSample]);

  return {
    state: {
      clearConfirmed,
      clearSelectedConfirmed,
      canUndo: undoRedo.canUndo,
      canRedo: undoRedo.canRedo,
      cellsEditable: !!fmt.editable,
      cellEditorKind: editorAndFilter.cellEditorKind,
      cellEditorValues: editorAndFilter.cellEditorValues,
      cellEditorValuesSource: editorAndFilter.cellEditorValuesSource,
      filterPrimaryKind: editorAndFilter.filterPrimaryKind,
      filterIsCustom: editorAndFilter.filterIsCustom,
      floatingFilterOn: editorAndFilter.floatingFilterOn,
      headerCaseUppercase,
      showCellTooltips,
      globalNumberFormatter: custState?.globalCellNumberFormatter,
      globalDateFormatter: custState?.globalCellDateFormatter,
      previewText,
    },
    actions: {
      toggleBold,
      toggleItalic,
      toggleUnderline,
      setFontSizePx,
      toggleAlign,
      setTextColor,
      setBgColor,
      applyBordersMap,
      doFormat,
      decreaseDecimals,
      increaseDecimals,
      confirmClearAll,
      confirmClearSelected,
      undo: undoRedo.undo,
      redo: undoRedo.redo,
      setHeaderName,
      toggleEditable,
      setCellEditorKind,
      setCellEditorValues,
      setFilterPrimaryKind,
      toggleFloatingFilter,
      toggleHeaderCaseUppercase,
      toggleCellTooltips,
    },
    shared: {
      custState,
      tplState,
      setTplState: setTplState as (
        updater: (prev: ColumnTemplatesState | undefined) => ColumnTemplatesState | undefined,
      ) => void,
      setCustStateWithHistory: setCustStateWithHistory as (
        updater: (
          prev: ColumnCustomizationState | undefined,
        ) => ColumnCustomizationState,
      ) => void,
    },
  };
}

/** Local TargetKind re-export to keep the actions hook self-contained for
 *  module readers — the type itself comes from formattingToolbarHooks. */
export type { TargetKind };
