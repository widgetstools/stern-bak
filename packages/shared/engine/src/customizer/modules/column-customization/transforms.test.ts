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
});
