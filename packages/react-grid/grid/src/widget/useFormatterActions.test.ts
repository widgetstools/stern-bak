/**
 * Hook tests for useFormatterActions — GridProvider + fake GridApi,
 * mirroring FormattingToolbar.test.tsx.
 */
import * as React from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Column, GridApi } from 'ag-grid-community';
import { GridPlatform } from '@wellsfargo-starui/core';
import {
  GridProvider,
  columnCustomizationModule,
  columnTemplatesModule,
  generalSettingsModule,
  type ColumnCustomizationState,
  type GeneralSettingsState,
  GENERAL_SETTINGS_MODULE_ID,
} from '@wellsfargo-starui/grid/customizer';
import { useFormatterActions } from './formatter/useFormatterActions';
import type { FormatterSelection } from './formatter/useFormatterSelection';

function makeFakeApi(cols: Array<{ id: string; headerName?: string; cellDataType?: string }>) {
  const toColumn = (c: { id: string; headerName?: string; cellDataType?: string }): Column =>
    ({
      getColId: () => c.id,
      getColDef: () => ({ headerName: c.headerName, cellDataType: c.cellDataType }),
    }) as Column;

  const api: Partial<GridApi> = {
    getColumns: () => cols.map(toColumn),
    getColumn: ((id: string) => {
      const c = cols.find((x) => x.id === id);
      return c ? toColumn(c) : null;
    }) as GridApi['getColumn'],
    getCellRanges: () => ([{ columns: [toColumn(cols[0])] }] as unknown as ReturnType<GridApi['getCellRanges']>),
    getDisplayedRowAtIndex: () => ({ data: { price: 1234.5678 } }) as ReturnType<GridApi['getDisplayedRowAtIndex']>,
    addEventListener: (() => {}) as GridApi['addEventListener'],
    removeEventListener: (() => {}) as GridApi['removeEventListener'],
  };
  return api as GridApi;
}

function makeSelection(overrides: Partial<FormatterSelection> = {}): FormatterSelection {
  const colIds = overrides.colIds ?? ['price'];
  const target = overrides.target ?? 'cell';
  const scope = overrides.scope ?? 'selected';
  return {
    colIds,
    colLabel: 'Price',
    pickerDataType: 'number',
    target,
    setTarget: () => {},
    scope,
    setScope: () => {},
    disabled: false,
    isHeader: target === 'header',
    fmt: overrides.fmt ?? { bold: false, italic: false, underline: false, borders: {} },
    singleColumnSelected: colIds.length === 1,
    refs: {
      colIds: { current: colIds },
      target: { current: target },
      scope: { current: scope },
    },
    ...overrides,
  };
}

function makePlatform() {
  return new GridPlatform({
    gridId: 'test-grid',
    modules: [generalSettingsModule, columnTemplatesModule, columnCustomizationModule],
  });
}

function wrapper(platform: GridPlatform) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(GridProvider, { platform }, children);
  };
}

describe('useFormatterActions', () => {
  let platform: GridPlatform;
  beforeEach(() => { platform = makePlatform(); });

  it('toggleBold writes typography.bold on the active column', () => {
    platform.onGridReady(makeFakeApi([{ id: 'price', headerName: 'Price', cellDataType: 'numeric' }]));
    const { result } = renderHook(
      () => useFormatterActions({ selection: makeSelection(), pickerDataType: 'number' }),
      { wrapper: wrapper(platform) },
    );

    act(() => result.current.actions.toggleBold());
    const cust = platform.store.getModuleState<ColumnCustomizationState>('column-customization');
    expect(cust?.assignments?.price?.cellStyleOverrides?.dark?.typography?.bold).toBe(true);
  });

  it('toggleHeaderCaseUppercase flips general settings flag', () => {
    platform.onGridReady(makeFakeApi([{ id: 'price' }]));
    const { result } = renderHook(
      () => useFormatterActions({ selection: makeSelection(), pickerDataType: 'number' }),
      { wrapper: wrapper(platform) },
    );

    act(() => result.current.actions.toggleHeaderCaseUppercase());
    const gs = platform.store.getModuleState<GeneralSettingsState>(GENERAL_SETTINGS_MODULE_ID);
    expect(gs?.headerCaseUppercase).toBe(true);
  });

  it('setHeaderName updates assignment headerName for single column', () => {
    platform.onGridReady(makeFakeApi([{ id: 'price', headerName: 'Price' }]));
    const { result } = renderHook(
      () => useFormatterActions({ selection: makeSelection(), pickerDataType: 'number' }),
      { wrapper: wrapper(platform) },
    );

    act(() => result.current.actions.setHeaderName('Notional'));
    const cust = platform.store.getModuleState<ColumnCustomizationState>('column-customization');
    expect(cust?.assignments?.price?.headerName).toBe('Notional');
  });

  it('setFilterPrimaryKind writes streamSafe filter kind', () => {
    platform.onGridReady(makeFakeApi([{ id: 'price' }]));
    const { result } = renderHook(
      () => useFormatterActions({ selection: makeSelection(), pickerDataType: 'number' }),
      { wrapper: wrapper(platform) },
    );

    act(() => result.current.actions.setFilterPrimaryKind('streamSafeMultiNumberColumnFilter'));
    const cust = platform.store.getModuleState<ColumnCustomizationState>('column-customization');
    expect(cust?.assignments?.price?.filter?.kind).toBe('streamSafeMultiNumberColumnFilter');
  });

  it('increaseDecimals bumps decimal places on number formatter', () => {
    platform.onGridReady(makeFakeApi([{ id: 'price', cellDataType: 'numeric' }]));
    const { result } = renderHook(
      () => useFormatterActions({ selection: makeSelection(), pickerDataType: 'number' }),
      { wrapper: wrapper(platform) },
    );

    act(() => result.current.actions.increaseDecimals());
    const cust = platform.store.getModuleState<ColumnCustomizationState>('column-customization');
    const tpl = cust?.assignments?.price?.valueFormatterTemplate;
    expect(tpl?.kind).toBe('preset');
  });

  it('confirmClearAll wipes assignments', () => {
    platform.onGridReady(makeFakeApi([{ id: 'price' }]));
    platform.store.setModuleState<ColumnCustomizationState>('column-customization', () => ({
      assignments: {
        price: { colId: 'price', cellStyleOverrides: { dark: { typography: { bold: true } } } },
      },
    }));
    const { result } = renderHook(
      () => useFormatterActions({ selection: makeSelection(), pickerDataType: 'number' }),
      { wrapper: wrapper(platform) },
    );

    act(() => result.current.actions.confirmClearAll());
    const cust = platform.store.getModuleState<ColumnCustomizationState>('column-customization');
    expect(cust?.assignments).toEqual({});
  });

  it('undo restores state after bold toggle', () => {
    platform.onGridReady(makeFakeApi([{ id: 'price' }]));
    const { result } = renderHook(
      () => useFormatterActions({ selection: makeSelection(), pickerDataType: 'number' }),
      { wrapper: wrapper(platform) },
    );

    act(() => result.current.actions.toggleBold());
    expect(
      platform.store.getModuleState<ColumnCustomizationState>('column-customization')
        ?.assignments?.price?.cellStyleOverrides?.dark?.typography?.bold,
    ).toBe(true);

    act(() => result.current.actions.undo());
    const cust = platform.store.getModuleState<ColumnCustomizationState>('column-customization');
    expect(cust?.assignments?.price?.cellStyleOverrides).toBeUndefined();
  });

  it('toggleItalic and toggleUnderline write typography flags', () => {
    platform.onGridReady(makeFakeApi([{ id: 'price' }]));
    const { result } = renderHook(
      () => useFormatterActions({ selection: makeSelection(), pickerDataType: 'number' }),
      { wrapper: wrapper(platform) },
    );

    act(() => result.current.actions.toggleItalic());
    act(() => result.current.actions.toggleUnderline());
    const cust = platform.store.getModuleState<ColumnCustomizationState>('column-customization');
    expect(cust?.assignments?.price?.cellStyleOverrides?.dark?.typography?.italic).toBe(true);
    expect(cust?.assignments?.price?.cellStyleOverrides?.dark?.typography?.underline).toBe(true);
  });

  it('setTextColor and setBgColor write color overrides', () => {
    platform.onGridReady(makeFakeApi([{ id: 'price' }]));
    const { result } = renderHook(
      () => useFormatterActions({ selection: makeSelection(), pickerDataType: 'number' }),
      { wrapper: wrapper(platform) },
    );

    act(() => result.current.actions.setTextColor('#111111'));
    act(() => result.current.actions.setBgColor('#222222'));
    const cust = platform.store.getModuleState<ColumnCustomizationState>('column-customization');
    expect(cust?.assignments?.price?.cellStyleOverrides?.dark?.colors?.text).toBe('#111111');
    expect(cust?.assignments?.price?.cellStyleOverrides?.dark?.colors?.background).toBe('#222222');
  });

  it('toggleAlign sets horizontal alignment from selection state', () => {
    platform.onGridReady(makeFakeApi([{ id: 'price' }]));
    const { result } = renderHook(
      () => useFormatterActions({
        selection: makeSelection({
          fmt: { bold: false, italic: false, underline: false, borders: {}, horizontal: 'center' },
        }),
        pickerDataType: 'number',
      }),
      { wrapper: wrapper(platform) },
    );

    act(() => result.current.actions.toggleAlign('center'));
    const cust = platform.store.getModuleState<ColumnCustomizationState>('column-customization');
    expect(cust?.assignments?.price?.cellStyleOverrides?.dark?.alignment).toBeUndefined();
  });

  it('toggleAlign sets horizontal alignment when not yet aligned', () => {
    platform.onGridReady(makeFakeApi([{ id: 'price' }]));
    const { result } = renderHook(
      () => useFormatterActions({ selection: makeSelection(), pickerDataType: 'number' }),
      { wrapper: wrapper(platform) },
    );

    act(() => result.current.actions.toggleAlign('center'));
    const cust = platform.store.getModuleState<ColumnCustomizationState>('column-customization');
    expect(cust?.assignments?.price?.cellStyleOverrides?.dark?.alignment?.horizontal).toBe('center');
  });

  it('decreaseDecimals reduces decimal count', () => {
    platform.onGridReady(makeFakeApi([{ id: 'price', cellDataType: 'numeric' }]));
    platform.store.setModuleState<ColumnCustomizationState>('column-customization', () => ({
      assignments: {
        price: {
          colId: 'price',
          valueFormatterTemplate: { kind: 'preset', preset: 'number', options: { decimals: 3 } },
        },
      },
    }));
    const { result } = renderHook(
      () => useFormatterActions({ selection: makeSelection(), pickerDataType: 'number' }),
      { wrapper: wrapper(platform) },
    );

    act(() => result.current.actions.decreaseDecimals());
    const tpl = platform.store.getModuleState<ColumnCustomizationState>('column-customization')
      ?.assignments?.price?.valueFormatterTemplate;
    expect((tpl?.options as { decimals?: number }).decimals).toBe(2);
  });

  it('confirmClearSelected clears only selected columns', () => {
    platform.onGridReady(makeFakeApi([{ id: 'price' }, { id: 'qty' }]));
    platform.store.setModuleState<ColumnCustomizationState>('column-customization', () => ({
      assignments: {
        price: { colId: 'price', cellStyleOverrides: { dark: { typography: { bold: true } } } },
        qty: { colId: 'qty', cellStyleOverrides: { dark: { typography: { bold: true } } } },
      },
    }));
    const { result } = renderHook(
      () => useFormatterActions({ selection: makeSelection({ colIds: ['price'] }), pickerDataType: 'number' }),
      { wrapper: wrapper(platform) },
    );

    act(() => result.current.actions.confirmClearSelected());
    const cust = platform.store.getModuleState<ColumnCustomizationState>('column-customization');
    expect(cust?.assignments?.price?.cellStyleOverrides).toBeUndefined();
    expect(cust?.assignments?.qty?.cellStyleOverrides?.dark?.typography?.bold).toBe(true);
  });

  it('toggleEditable flips editable flag on column', () => {
    platform.onGridReady(makeFakeApi([{ id: 'price' }]));
    const { result } = renderHook(
      () => useFormatterActions({ selection: makeSelection(), pickerDataType: 'number' }),
      { wrapper: wrapper(platform) },
    );

    act(() => result.current.actions.toggleEditable());
    const cust = platform.store.getModuleState<ColumnCustomizationState>('column-customization');
    expect(cust?.assignments?.price?.editable).toBe(true);
  });

  it('setCellEditorKind and setCellEditorValues write editor config', () => {
    platform.onGridReady(makeFakeApi([{ id: 'price' }]));
    const { result } = renderHook(
      () => useFormatterActions({ selection: makeSelection(), pickerDataType: 'number' }),
      { wrapper: wrapper(platform) },
    );

    act(() => result.current.actions.setCellEditorKind('agSelectCellEditor'));
    act(() => result.current.actions.setCellEditorValues({ values: ['BUY', 'SELL'] }));
    const cust = platform.store.getModuleState<ColumnCustomizationState>('column-customization');
    expect(cust?.assignments?.price?.cellEditor?.kind).toBe('agSelectCellEditor');
    expect(cust?.assignments?.price?.cellEditor?.values).toEqual(['BUY', 'SELL']);
  });

  it('toggleFloatingFilter enables floating filter on column', () => {
    platform.onGridReady(makeFakeApi([{ id: 'price' }]));
    const { result } = renderHook(
      () => useFormatterActions({ selection: makeSelection(), pickerDataType: 'number' }),
      { wrapper: wrapper(platform) },
    );

    act(() => result.current.actions.toggleFloatingFilter());
    const cust = platform.store.getModuleState<ColumnCustomizationState>('column-customization');
    expect(cust?.assignments?.price?.filter?.floatingFilter).toBe(true);
  });

  it('toggleCellTooltips flips general settings flag', () => {
    platform.onGridReady(makeFakeApi([{ id: 'price' }]));
    const { result } = renderHook(
      () => useFormatterActions({ selection: makeSelection(), pickerDataType: 'number' }),
      { wrapper: wrapper(platform) },
    );

    act(() => result.current.actions.toggleCellTooltips());
    const gs = platform.store.getModuleState<GeneralSettingsState>(GENERAL_SETTINGS_MODULE_ID);
    expect(gs?.showCellTooltips).toBe(true);
  });

  it('doFormat with scope all routes date kind to global date formatter', () => {
    platform.onGridReady(makeFakeApi([{ id: 'price' }]));
    const { result } = renderHook(
      () => useFormatterActions({
        selection: makeSelection({ scope: 'all', colIds: [] }),
        pickerDataType: 'date',
      }),
      { wrapper: wrapper(platform) },
    );

    act(() => result.current.actions.doFormat(
      { kind: 'preset', preset: 'date', options: { pattern: 'yyyy-MM-dd' } },
      'date',
    ));
    const cust = platform.store.getModuleState<ColumnCustomizationState>('column-customization');
    expect(cust?.globalCellDateFormatter?.kind).toBe('preset');
  });

  it('exposes previewText from active formatter template', () => {
    platform.onGridReady(makeFakeApi([{ id: 'price', cellDataType: 'numeric' }]));
    platform.store.setModuleState<ColumnCustomizationState>('column-customization', () => ({
      assignments: {
        price: {
          colId: 'price',
          valueFormatterTemplate: { kind: 'preset', preset: 'number', options: { decimals: 2 } },
        },
      },
    }));
    const { result } = renderHook(
      () => useFormatterActions({
        selection: makeSelection({
          fmt: {
            bold: false,
            italic: false,
            underline: false,
            borders: {},
            valueFormatterTemplate: { kind: 'preset', preset: 'number', options: { decimals: 2 } },
          },
        }),
        pickerDataType: 'number',
      }),
      { wrapper: wrapper(platform) },
    );

    expect(result.current.state.previewText).toBeTruthy();
    expect(result.current.state.cellsEditable).toBe(false);
  });

  it('toggleBold clears bold when already enabled', () => {
    platform.onGridReady(makeFakeApi([{ id: 'price' }]));
    platform.store.setModuleState<ColumnCustomizationState>('column-customization', () => ({
      assignments: {
        price: {
          colId: 'price',
          cellStyleOverrides: { dark: { typography: { bold: true } } },
        },
      },
    }));
    const { result } = renderHook(
      () => useFormatterActions({
        selection: makeSelection({
          fmt: { bold: true, italic: false, underline: false, borders: {} },
        }),
        pickerDataType: 'number',
      }),
      { wrapper: wrapper(platform) },
    );

    act(() => result.current.actions.toggleBold());
    const cust = platform.store.getModuleState<ColumnCustomizationState>('column-customization');
    expect(cust?.assignments?.price?.cellStyleOverrides?.dark?.typography?.bold).toBeUndefined();
  });

  it('setFontSizePx and setTextColor no-op without selected columns', () => {
    platform.onGridReady(makeFakeApi([{ id: 'price' }]));
    const { result } = renderHook(
      () => useFormatterActions({
        selection: makeSelection({ colIds: [], scope: 'selected' }),
        pickerDataType: 'number',
      }),
      { wrapper: wrapper(platform) },
    );

    act(() => result.current.actions.setFontSizePx(14));
    act(() => result.current.actions.setTextColor('#111111'));
    const cust = platform.store.getModuleState<ColumnCustomizationState>('column-customization');
    expect(cust?.assignments?.price).toBeUndefined();
  });

  it('applyBordersMap sets and clears border sides in one step', () => {
    platform.onGridReady(makeFakeApi([{ id: 'price' }]));
    const { result } = renderHook(
      () => useFormatterActions({
        selection: makeSelection({
          fmt: {
            bold: false,
            italic: false,
            underline: false,
            borders: { top: { width: 1, style: 'solid', color: '#000' } },
          },
        }),
        pickerDataType: 'number',
      }),
      { wrapper: wrapper(platform) },
    );

    act(() => result.current.actions.applyBordersMap({
      top: { width: 2, style: 'solid', color: '#111' },
      bottom: undefined,
    }));
    const cust = platform.store.getModuleState<ColumnCustomizationState>('column-customization');
    expect(cust?.assignments?.price?.cellStyleOverrides?.dark?.borders?.top?.width).toBe(2);
  });

  it('redo restores state after undo', () => {
    platform.onGridReady(makeFakeApi([{ id: 'price' }]));
    const { result } = renderHook(
      () => useFormatterActions({ selection: makeSelection(), pickerDataType: 'number' }),
      { wrapper: wrapper(platform) },
    );

    act(() => result.current.actions.toggleBold());
    act(() => result.current.actions.undo());
    act(() => result.current.actions.redo());
    const cust = platform.store.getModuleState<ColumnCustomizationState>('column-customization');
    expect(cust?.assignments?.price?.cellStyleOverrides?.dark?.typography?.bold).toBe(true);
  });

  it('increaseDecimals with scope all writes global number formatter', () => {
    platform.onGridReady(makeFakeApi([{ id: 'price' }]));
    const { result } = renderHook(
      () => useFormatterActions({
        selection: makeSelection({ scope: 'all', colIds: [] }),
        pickerDataType: 'number',
      }),
      { wrapper: wrapper(platform) },
    );

    act(() => result.current.actions.increaseDecimals());
    const cust = platform.store.getModuleState<ColumnCustomizationState>('column-customization');
    expect(cust?.globalCellNumberFormatter?.kind).toBe('preset');
  });

  it('surfaces disabled and custom filter states from assignment', () => {
    platform.onGridReady(makeFakeApi([{ id: 'price' }]));
    platform.store.setModuleState<ColumnCustomizationState>('column-customization', () => ({
      assignments: {
        price: {
          colId: 'price',
          filter: { enabled: false, kind: 'agTextColumnFilter' },
        },
      },
    }));
    const { result } = renderHook(
      () => useFormatterActions({ selection: makeSelection(), pickerDataType: 'number' }),
      { wrapper: wrapper(platform) },
    );
    expect(result.current.state.filterPrimaryKind).toBeUndefined();

    platform.store.setModuleState<ColumnCustomizationState>('column-customization', () => ({
      assignments: {
        price: {
          colId: 'price',
          filter: { kind: 'agTextColumnFilter', floatingFilter: true },
        },
      },
    }));
    const { result: custom } = renderHook(
      () => useFormatterActions({ selection: makeSelection(), pickerDataType: 'number' }),
      { wrapper: wrapper(platform) },
    );
    expect(custom.current.state.filterIsCustom).toBe(true);
    expect(custom.current.state.floatingFilterOn).toBe(true);
  });

  it('setHeaderName no-ops unless exactly one column is selected', () => {
    platform.onGridReady(makeFakeApi([{ id: 'price' }, { id: 'qty' }]));
    const { result } = renderHook(
      () => useFormatterActions({
        selection: makeSelection({ colIds: ['price', 'qty'] }),
        pickerDataType: 'number',
      }),
      { wrapper: wrapper(platform) },
    );

    act(() => result.current.actions.setHeaderName('Renamed'));
    const cust = platform.store.getModuleState<ColumnCustomizationState>('column-customization');
    expect(cust?.assignments?.price).toBeUndefined();
    expect(cust?.assignments?.qty).toBeUndefined();
  });

  it('confirmClearSelected no-ops without columns', () => {
    platform.onGridReady(makeFakeApi([{ id: 'price' }]));
    const { result } = renderHook(
      () => useFormatterActions({
        selection: makeSelection({ colIds: [] }),
        pickerDataType: 'number',
      }),
      { wrapper: wrapper(platform) },
    );

    act(() => result.current.actions.confirmClearSelected());
    expect(result.current.state.clearSelectedConfirmed).toBe(false);
  });

  it('renders preview text for date and boolean picker types', () => {
    platform.onGridReady(makeFakeApi([{ id: 'asOf', cellDataType: 'date' }]));
    const dateHook = renderHook(
      () => useFormatterActions({ selection: makeSelection({ colIds: ['asOf'] }), pickerDataType: 'date' }),
      { wrapper: wrapper(platform) },
    );
    expect(dateHook.result.current.state.previewText).toBe('2026-04-17');

    const boolHook = renderHook(
      () => useFormatterActions({ selection: makeSelection(), pickerDataType: 'boolean' }),
      { wrapper: wrapper(platform) },
    );
    expect(boolHook.result.current.state.previewText).toBe('true');
  });
});
