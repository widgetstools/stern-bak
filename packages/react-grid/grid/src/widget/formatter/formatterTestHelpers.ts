import { vi } from 'vitest';
import type { FormatterActions, FormatterState } from './state';
import type { ResolvedFormatting } from '../formattingToolbarHooks';
import { PERCENT_TEMPLATE, COMMA_TEMPLATE } from '../formatterPresets';

const emptyFmt: ResolvedFormatting = {
  bold: false,
  italic: false,
  underline: false,
  borders: {},
};

export function makeFormatterState(overrides: Partial<FormatterState> = {}): FormatterState {
  return {
    colIds: ['price'],
    colLabel: 'Price',
    pickerDataType: 'number',
    target: 'cell',
    scope: 'selected',
    disabled: false,
    isHeader: false,
    fmt: emptyFmt,
    previewText: '1234.57',
    templates: [],
    saveAsTplName: '',
    saveAsTplConfirmed: false,
    clearConfirmed: false,
    clearSelectedConfirmed: false,
    canUndo: false,
    canRedo: false,
    singleColumnSelected: true,
    cellsEditable: true,
    filterIsCustom: false,
    floatingFilterOn: false,
    capturableFields: [],
    headerCaseUppercase: false,
    showCellTooltips: false,
    ...overrides,
  };
}

export function makeFormatterActions(overrides: Partial<FormatterActions> = {}): FormatterActions {
  const noop = vi.fn();
  return {
    setTarget: noop,
    setScope: noop,
    toggleBold: noop,
    toggleItalic: noop,
    toggleUnderline: noop,
    setFontSizePx: noop,
    toggleAlign: noop,
    setTextColor: noop,
    setBgColor: noop,
    applyBordersMap: noop,
    doFormat: noop,
    decreaseDecimals: noop,
    increaseDecimals: noop,
    applyTemplate: noop,
    saveAsTemplate: noop,
    updateTemplate: noop,
    renameTemplate: noop,
    deleteTemplate: noop,
    setSaveAsTplName: noop,
    flashSaveAsTpl: noop,
    confirmClearAll: noop,
    confirmClearSelected: noop,
    undo: noop,
    redo: noop,
    setHeaderName: noop,
    toggleEditable: noop,
    setCellEditorKind: noop,
    setCellEditorValues: noop,
    setFilterPrimaryKind: noop,
    toggleFloatingFilter: noop,
    toggleHeaderCaseUppercase: noop,
    toggleCellTooltips: noop,
    ...overrides,
  };
}

export { PERCENT_TEMPLATE, COMMA_TEMPLATE, emptyFmt };
