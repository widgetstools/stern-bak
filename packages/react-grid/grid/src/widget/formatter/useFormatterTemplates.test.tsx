import * as React from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Column, GridApi } from 'ag-grid-community';
import { GridPlatform } from '@wellsfargo-starui/core';
import {
  GridProvider,
  columnCustomizationModule,
  columnTemplatesModule,
  type ColumnCustomizationState,
  type ColumnTemplatesState,
} from '../../customizer/internal.js';
import { useFormatterTemplates } from './useFormatterTemplates';
import type { FormatterSelection } from './useFormatterSelection';

function makeSelection(overrides: Partial<FormatterSelection> = {}): FormatterSelection {
  const colIds = overrides.colIds ?? ['price'];
  return {
    colIds,
    colLabel: 'Price',
    pickerDataType: 'number',
    target: 'cell',
    setTarget: vi.fn(),
    scope: 'selected',
    setScope: vi.fn(),
    disabled: false,
    isHeader: false,
    fmt: { bold: false, italic: false, underline: false, borders: {} },
    singleColumnSelected: colIds.length === 1,
    refs: {
      colIds: { current: colIds },
      target: { current: 'cell' },
      scope: { current: 'selected' },
    },
    ...overrides,
  };
}

function makeFakeApi() {
  const api: Partial<GridApi> = {
    getColumn: ((id: string) => ({
      getColDef: () => ({ cellDataType: id === 'price' ? 'numeric' : 'text' }),
    }) as Column) as GridApi['getColumn'],
  };
  return api as GridApi;
}

function makePlatform() {
  return new GridPlatform({
    gridId: 'test-grid',
    modules: [columnCustomizationModule, columnTemplatesModule],
  });
}

describe('useFormatterTemplates', () => {
  let platform: GridPlatform;
  let custState: ColumnCustomizationState;
  let tplState: ColumnTemplatesState;
  let setTplState: ReturnType<typeof vi.fn>;
  let setCustStateWithHistory: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    platform = makePlatform();
    platform.onGridReady(makeFakeApi());
    custState = {
      assignments: {
        price: {
          colId: 'price',
          cellStyleOverrides: { dark: { typography: { bold: true } } },
          editable: true,
          filter: { kind: 'agTextColumnFilter' },
        },
      },
    };
    tplState = {
      templates: {
        t1: {
          id: 't1',
          name: 'Zebra',
          cellStyleOverrides: { dark: { typography: { bold: true } } },
          createdAt: 1,
          updatedAt: 1,
        },
        t2: {
          id: 't2',
          name: 'Alpha',
          cellStyleOverrides: { dark: { typography: { italic: true } } },
          createdAt: 2,
          updatedAt: 2,
        },
      },
      typeDefaults: {},
    };
    setTplState = vi.fn();
    setCustStateWithHistory = vi.fn((updater) => {
      custState = updater(custState);
    });
  });

  function renderTemplates(selection = makeSelection()) {
    return renderHook(
      () =>
        useFormatterTemplates({
          selection,
          custState,
          tplState,
          setTplState,
          setCustStateWithHistory,
        }),
      {
        wrapper: ({ children }) => (
          <GridProvider platform={platform}>{children}</GridProvider>
        ),
      },
    );
  }

  it('sorts templates alphabetically and resolves active template id', () => {
    custState.assignments.price.templateIds = ['t1'];
    const { result } = renderTemplates();
    expect(result.current.templates.map((t) => t.name)).toEqual(['Alpha', 'Zebra']);
    expect(result.current.activeTemplateId).toBe('t1');
  });

  it('builds capturable field labels from resolved assignment', () => {
    const { result } = renderTemplates();
    expect(result.current.capturableFields).toEqual(
      expect.arrayContaining(['Cell style', 'Behavior', 'Filter']),
    );
  });

  it('returns empty capturable fields when no column selected', () => {
    const { result } = renderTemplates(makeSelection({ colIds: [] }));
    expect(result.current.capturableFields).toEqual([]);
  });

  it('applyTemplate writes through history wrapper', () => {
    const { result } = renderTemplates();
    act(() => result.current.actions.applyTemplate('t1'));
    expect(setCustStateWithHistory).toHaveBeenCalled();
  });

  it('saveAsTemplate no-ops without columns', () => {
    const { result } = renderTemplates(makeSelection({ colIds: [] }));
    expect(result.current.actions.saveAsTemplate('New')).toBeUndefined();
  });

  it('updateTemplate returns false without columns', () => {
    const { result } = renderTemplates(makeSelection({ colIds: [] }));
    expect(result.current.actions.updateTemplate('t1')).toBe(false);
  });

  it('renameTemplate rejects blank and unchanged names', () => {
    const { result } = renderTemplates();
    expect(result.current.actions.renameTemplate('t1', '   ')).toBe(false);
    expect(result.current.actions.renameTemplate('t1', 'Zebra')).toBe(false);
  });

  it('renameTemplate updates template name when valid', () => {
    const { result } = renderTemplates();
    expect(result.current.actions.renameTemplate('t1', 'Renamed')).toBe(true);
    expect(setTplState).toHaveBeenCalled();
  });

  it('deleteTemplate removes template and assignment refs', () => {
    const { result } = renderTemplates();
    act(() => result.current.actions.deleteTemplate('t1'));
    expect(setTplState).toHaveBeenCalled();
    expect(setCustStateWithHistory).toHaveBeenCalled();
  });

  it('tracks save-as input draft and flash confirm', () => {
    const { result } = renderTemplates();
    act(() => result.current.actions.setSaveAsTplName('Draft'));
    expect(result.current.saveAsTplName).toBe('Draft');
    act(() => result.current.actions.flashSaveAsTpl());
    expect(result.current.saveAsTplConfirmed).toBe(true);
  });

  it('saveAsTemplate creates a template from the active column', () => {
    const { result } = renderTemplates();
    const id = result.current.actions.saveAsTemplate('Saved tpl');
    expect(id).toBeTruthy();
    expect(setTplState).toHaveBeenCalled();
  });

  it('updateTemplate writes snapshot fields onto an existing template', () => {
    const { result } = renderTemplates();
    expect(result.current.actions.updateTemplate('t1')).toBe(true);
    expect(setTplState).toHaveBeenCalled();
  });

  it('includes header, editor, renderer, and grouping labels when present', () => {
    custState.assignments.price = {
      ...custState.assignments.price,
      headerStyleOverrides: { dark: { typography: { bold: true } } },
      cellEditorName: 'agTextCellEditor',
      cellRendererName: 'agGroupCellRenderer',
      rowGrouping: true,
    };
    const { result } = renderTemplates();
    expect(result.current.capturableFields).toEqual(
      expect.arrayContaining(['Header style', 'Editor', 'Renderer']),
    );
  });

  it('renameTemplate returns false for unknown template id', () => {
    const { result } = renderTemplates();
    expect(result.current.actions.renameTemplate('missing', 'Name')).toBe(false);
  });

  it('returns empty capturable fields when assignment is missing', () => {
    custState.assignments = {};
    const { result } = renderTemplates();
    expect(result.current.capturableFields).toEqual([]);
  });

  it('labels formatter fields when present on assignment', () => {
    custState.assignments.price = {
      colId: 'price',
      valueFormatterTemplate: { kind: 'preset', preset: 'number', options: { decimals: 2 } },
      sortable: false,
    };
    const { result } = renderTemplates();
    expect(result.current.capturableFields).toEqual(
      expect.arrayContaining(['Formatter', 'Behavior']),
    );
  });

  it('updateTemplate returns false when snapshot yields no fields', () => {
    custState.assignments = {};
    const { result } = renderTemplates();
    expect(result.current.actions.updateTemplate('t1')).toBe(false);
  });

  it('includes editor params and renderer labels when configured', () => {
    custState.assignments.price = {
      colId: 'price',
      cellEditorParams: { maxLength: 10 },
      cellRendererName: 'agAnimateShowChangeCellRenderer',
      resizable: false,
    };
    const { result } = renderTemplates();
    expect(result.current.capturableFields).toEqual(
      expect.arrayContaining(['Editor', 'Renderer', 'Behavior']),
    );
  });
});
