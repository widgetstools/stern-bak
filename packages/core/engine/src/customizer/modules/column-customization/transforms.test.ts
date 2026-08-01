import { describe, expect, it, vi } from 'vitest';
import { ExpressionEngine } from '../../../expression/index.js';
import type { CssHandle } from '../../../platform/types';
import {
  applyAssignments,
  applyFilterConfigToColDef,
  applyRowGroupingConfigToColDef,
  cellDataTypeToDomain,
  cssEscapeColId,
  reinjectCSS,
} from './transforms.js';
import type { ColumnCustomizationState } from './state.js';
import { INITIAL_COLUMN_TEMPLATES } from '../column-templates/state.js';

const engine = new ExpressionEngine();

function cssHandle(): CssHandle & { rules: Map<string, string> } {
  const rules = new Map<string, string>();
  return {
    rules,
    clear: () => rules.clear(),
    addRule: (id, css) => rules.set(id, css),
  };
}

describe('cssEscapeColId', () => {
  it('leaves safe ids unchanged', () => {
    expect(cssEscapeColId('price')).toBe('price');
  });

  // Dotted colIds would break chained CSS selectors without encoding.
  it('encodes dots and brackets for CSS class safety', () => {
    expect(cssEscapeColId('ratings.sp')).toBe('ratings_2esp');
    expect(cssEscapeColId('position[0].qty')).toBe('position_5b0_5d_2eqty');
  });
});

describe('cellDataTypeToDomain', () => {
  it('maps known AG Grid types to template domain types', () => {
    expect(cellDataTypeToDomain('numeric')).toBe('numeric');
    expect(cellDataTypeToDomain('date')).toBe('date');
  });

  it('returns undefined for unknown types', () => {
    expect(cellDataTypeToDomain('object')).toBeUndefined();
  });
});

describe('applyFilterConfigToColDef', () => {
  it('disables filtering when enabled is false', () => {
    const merged = { filter: true, filterParams: { buttons: ['apply'] } };
    applyFilterConfigToColDef(merged, { enabled: false, floatingFilter: true });
    expect(merged.filter).toBe(false);
    expect(merged.filterParams).toBeUndefined();
    expect(merged.floatingFilter).toBe(true);
  });

  it('coerces floating set-filter default to text filter', () => {
    const merged: { filter?: unknown; floatingFilter?: boolean } = { filter: true };
    applyFilterConfigToColDef(merged, { floatingFilter: true });
    expect(merged.filter).toBe('agTextColumnFilter');
  });

  it('maps streamSafe multi filters to agMultiColumnFilter with custom floater', () => {
    const merged: Record<string, unknown> = {};
    applyFilterConfigToColDef(merged, {
      kind: 'streamSafeMultiNumberColumnFilter',
      floatingFilter: true,
      multiFilters: [{ filter: 'agNumberColumnFilter' }],
    });
    expect(merged.filter).toBe('agMultiColumnFilter');
    expect(merged.floatingFilterComponent).toBe('streamSafeNumber');
    expect((merged.filterParams as { filters: unknown[] }).filters).toHaveLength(1);
  });

  it('maps streamSafe date multi filters', () => {
    const merged: Record<string, unknown> = {};
    applyFilterConfigToColDef(merged, {
      kind: 'streamSafeMultiDateColumnFilter',
      floatingFilter: true,
    });
    expect(merged.floatingFilterComponent).toBe('streamSafeDate');
  });
});

describe('applyRowGroupingConfigToColDef', () => {
  it('installs custom agg func when expression parses', () => {
    const merged: { aggFunc?: unknown } = {};
    applyRowGroupingConfigToColDef(
      merged,
      { aggFunc: 'custom', customAggExpression: 'SUM([value])' },
      engine,
    );
    expect(typeof merged.aggFunc).toBe('function');
  });

  it('leaves aggFunc untouched when custom expression is empty', () => {
    const merged = { aggFunc: 'sum' as const };
    applyRowGroupingConfigToColDef(merged, { aggFunc: 'custom', customAggExpression: '   ' }, engine);
    expect(merged.aggFunc).toBe('sum');
  });

  it('swallows custom aggregation parse errors', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const merged: { aggFunc?: unknown } = {};
    applyRowGroupingConfigToColDef(
      merged,
      { aggFunc: 'custom', customAggExpression: '((((' },
      engine,
    );
    expect(merged.aggFunc).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('reinjectCSS', () => {
  it('emits global and per-column themed rules', () => {
    const cells = cssHandle();
    const headers = cssHandle();
    const state: ColumnCustomizationState = {
      assignments: {
        price: {
          colId: 'price',
          cellStyleOverrides: { dark: { colors: { text: 'red' } } },
        },
      },
      globalCellStyle: { dark: { typography: { bold: true } } },
    };
    reinjectCSS(cells, headers, state, INITIAL_COLUMN_TEMPLATES, [
      { colId: 'price', cellDataType: 'number' },
    ]);
    expect([...cells.rules.values()].some((css) => css.includes('.ag-cell'))).toBe(true);
    expect([...cells.rules.values()].some((css) => css.includes('ds-col-c-price'))).toBe(true);
  });

  it('emits border overlays and header alignment for both themes', () => {
    const cells = cssHandle();
    const headers = cssHandle();
    const state: ColumnCustomizationState = {
      assignments: {
        'ratings.sp': {
          colId: 'ratings.sp',
          cellStyleOverrides: {
            dark: {
              borders: { top: { width: 2, style: 'dashed', color: '#f00' } },
              alignment: { horizontal: 'right' },
            },
          },
          headerStyleOverrides: { light: { typography: { italic: true } } },
        },
      },
      globalHeaderStyle: { dark: { alignment: { horizontal: 'center' } } },
    };
    reinjectCSS(cells, headers, state, INITIAL_COLUMN_TEMPLATES, [
      { colId: 'ratings.sp', cellDataType: 'number' },
    ]);
    expect([...cells.rules.values()].some((css) => css.includes('::after'))).toBe(true);
    expect([...headers.rules.values()].some((css) => css.includes('justify-content'))).toBe(true);
    expect([...cells.rules.keys()].some((k) => k.includes('light'))).toBe(true);
  });
});

describe('applyAssignments', () => {
  it('returns the original def reference when nothing applies', () => {
    const def = { colId: 'price', field: 'price' };
    expect(applyAssignments([def], { assignments: {} }, INITIAL_COLUMN_TEMPLATES, engine)[0])
      .toBe(def);
  });

  it('applies global number formatter to typed number columns', () => {
    const def = { colId: 'price', field: 'price', cellDataType: 'number' as const };
    const state: ColumnCustomizationState = {
      assignments: {},
      globalCellNumberFormatter: { kind: 'preset', preset: 'currency' },
    };
    const out = applyAssignments([def], state, INITIAL_COLUMN_TEMPLATES, engine)[0] as {
      valueFormatter?: unknown;
    };
    expect(typeof out.valueFormatter).toBe('function');
  });

  it('installs runtime dispatcher for untyped columns with global formatters', () => {
    const def = { colId: 'mixed', field: 'mixed' };
    const state: ColumnCustomizationState = {
      assignments: {},
      globalCellNumberFormatter: { kind: 'preset', preset: 'number' },
      globalCellDateFormatter: { kind: 'preset', preset: 'date' },
    };
    const out = applyAssignments([def], state, INITIAL_COLUMN_TEMPLATES, engine)[0] as {
      valueFormatter?: (p: { value: unknown }) => string;
    };
    expect(out.valueFormatter?.({ value: 42 })).toBeTruthy();
    expect(out.valueFormatter?.({ value: 'Apple' })).toBe('Apple');
  });

  it('memoises column def output across identical transform passes', () => {
    const def = { colId: 'price', field: 'price', cellDataType: 'number' as const };
    const state: ColumnCustomizationState = {
      assignments: {},
      globalCellNumberFormatter: { kind: 'preset', preset: 'number' },
    };
    const first = applyAssignments([def], state, INITIAL_COLUMN_TEMPLATES, engine)[0];
    const second = applyAssignments([def], state, INITIAL_COLUMN_TEMPLATES, engine)[0];
    expect(second).toBe(first);
  });

  it('walks column groups and updates children when formatting applies', () => {
    const child = { colId: 'price', field: 'price', cellDataType: 'number' as const };
    const group = { groupId: 'g', children: [child] };
    const state: ColumnCustomizationState = {
      assignments: {},
      globalCellNumberFormatter: { kind: 'preset', preset: 'number' },
    };
    const out = applyAssignments([group], state, INITIAL_COLUMN_TEMPLATES, engine)[0] as {
      children: Array<{ valueFormatter?: unknown }>;
    };
    expect(typeof out.children[0].valueFormatter).toBe('function');
  });

  it('applies excel color tags, editors, and renderer config from assignments', () => {
    const def = { colId: 'pnl', field: 'pnl', cellDataType: 'number' as const };
    const state: ColumnCustomizationState = {
      assignments: {
        pnl: {
          colId: 'pnl',
          valueFormatterTemplate: {
            kind: 'excelFormat',
            format: '[Green]#,##0.00;[Red]-#,##0.00',
          },
          cellEditor: { kind: 'agSelectCellEditor', values: ['A', 'B'] },
          cellRendererId: 'sparkline',
          cellRendererConfig: { kind: 'sparkline', config: { color: 'blue' } },
          cellStyleOverrides: { dark: { alignment: { horizontal: 'right' } } },
        },
      },
    };
    const out = applyAssignments([def], state, INITIAL_COLUMN_TEMPLATES, engine)[0] as {
      valueFormatter?: unknown;
      cellStyle?: (p: { value: number }) => Record<string, string>;
      cellEditor?: string;
      cellEditorParams?: { values?: string[] };
      cellRenderer?: string;
      cellRendererParams?: { color?: string };
      cellClass?: string | string[];
    };
    expect(typeof out.valueFormatter).toBe('function');
    expect(out.cellStyle?.({ value: 1 }).color).toBeTruthy();
    expect(out.cellEditor).toBe('agSelectCellEditor');
    expect(out.cellEditorParams?.values).toEqual(['A', 'B']);
    expect(out.cellRenderer).toBe('sparkline');
    expect(out.cellRendererParams?.color).toBe('blue');
    expect(out.cellClass).toContain('ds-col-c-pnl');
  });

  it('dispatches global formatters by cell data type and runtime value shape', () => {
    const dateDef = { colId: 'when', field: 'when', cellDataType: 'dateString' as const };
    const dateState: ColumnCustomizationState = {
      assignments: {},
      globalCellDateFormatter: { kind: 'preset', preset: 'date' },
    };
    expect(
      typeof applyAssignments([dateDef], dateState, INITIAL_COLUMN_TEMPLATES, engine)[0]
        .valueFormatter,
    ).toBe('function');

    const untyped = { colId: 'mixed', field: 'mixed' };
    const mixedState: ColumnCustomizationState = {
      assignments: {},
      globalCellNumberFormatter: { kind: 'preset', preset: 'number' },
      globalCellDateFormatter: { kind: 'preset', preset: 'date' },
    };
    const fmt = applyAssignments([untyped], mixedState, INITIAL_COLUMN_TEMPLATES, engine)[0] as {
      valueFormatter?: (p: { value: unknown }) => string;
    };
    expect(fmt.valueFormatter?.({ value: null })).toBe('');
    expect(fmt.valueFormatter?.({ value: new Date('2020-01-01') })).toBeTruthy();
    expect(fmt.valueFormatter?.({ value: '2020-01-15' })).toBeTruthy();
    expect(fmt.valueFormatter?.({ value: true })).toBe('true');
  });

  it('resolves select editor values from AppData bindings', () => {
    const def = { colId: 'side', field: 'side', cellDataType: 'text' as const };
    const state: ColumnCustomizationState = {
      assignments: {
        side: {
          colId: 'side',
          cellEditor: {
            kind: 'agRichSelectCellEditor',
            valuesSource: '{{providers.sides}}',
          },
        },
      },
    };
    const appData = {
      get: (_name: string, key: string) =>
        key === 'sides' ? 'BUY,SELL' : '["X"]',
    };
    const rich = applyAssignments([def], state, INITIAL_COLUMN_TEMPLATES, engine, appData)[0] as {
      cellEditorParams?: { values?: () => string[] };
    };
    expect(typeof rich.cellEditorParams?.values).toBe('function');
    expect(rich.cellEditorParams?.values?.()).toEqual(['BUY', 'SELL']);

    const selectState: ColumnCustomizationState = {
      assignments: {
        side: {
          colId: 'side',
          cellEditor: {
            kind: 'agSelectCellEditor',
            valuesSource: '{{providers.sides}}',
          },
        },
      },
    };
    const select = applyAssignments([def], selectState, INITIAL_COLUMN_TEMPLATES, engine, appData)[0] as {
      cellEditorParams?: { values?: string[] };
    };
    expect(select.cellEditorParams?.values).toEqual(['BUY', 'SELL']);
  });

  it('clears excel inline color when switching to a plain preset formatter', () => {
    const def = {
      colId: 'qty',
      field: 'qty',
      cellDataType: 'number' as const,
      cellStyle: (p: { value: number }) => ({ color: 'blue' }),
    };
    const state: ColumnCustomizationState = {
      assignments: {
        qty: {
          colId: 'qty',
          valueFormatterTemplate: { kind: 'preset', preset: 'number' },
        },
      },
    };
    const out = applyAssignments([def], state, INITIAL_COLUMN_TEMPLATES, engine)[0] as {
      cellStyle?: unknown;
    };
    expect(out.cellStyle).toBe(def.cellStyle);
  });
});

describe('applyRowGroupingConfigToColDef', () => {
  it('swallows custom aggregation runtime errors', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const merged: { aggFunc?: (p: { values?: unknown[] }) => unknown } = {};
    applyRowGroupingConfigToColDef(
      merged,
      { aggFunc: 'custom', customAggExpression: 'NOPE([value])' },
      engine,
    );
    expect(merged.aggFunc?.({ values: [1, 2] })).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
