import { describe, expect, it } from 'vitest';
import { INITIAL_CONDITIONAL_STYLING, type ConditionalStylingState } from '../conditional-styling/state.js';
import { INITIAL_COLUMN_CUSTOMIZATION, type ColumnCustomizationState } from '../column-customization/state.js';
import { applyFormatExcelClasses, buildVisualExcelStyles } from './buildVisualExcelStyles.js';
import { formatExcelClassId } from './formatExcelClassId.js';

describe('buildVisualExcelStyles', () => {
  it('includes header, cell, format, and conditional rule styles', () => {
    const columnCustomization: ColumnCustomizationState = {
      ...INITIAL_COLUMN_CUSTOMIZATION,
      assignments: {
        bidPrice: {
          colId: 'bidPrice',
          valueFormatterTemplate: { kind: 'excelFormat', format: '#,##0.00' },
        },
      },
    };
    const conditionalStyling: ConditionalStylingState = {
      ...INITIAL_CONDITIONAL_STYLING,
      rules: [{
        id: 'r1',
        name: 'High yield',
        enabled: true,
        priority: 0,
        expression: 'yieldToMaturity > 8',
        scope: { type: 'cell', columns: ['yieldToMaturity'] },
        style: {
          light: { color: '#EF4444', fontWeight: '700' },
        },
      }],
    };

    const styles = buildVisualExcelStyles({ columnCustomization, conditionalStyling });
    const ids = styles.map((s) => s.id);

    expect(ids).toContain('header');
    expect(ids).toContain('cell');
    expect(ids).toContain(formatExcelClassId('#,##0.00'));
    expect(ids).toContain('ds-rule-r1');
  });

  it('uses dark theme styles and skips disabled or empty rules', () => {
    const conditionalStyling: ConditionalStylingState = {
      ...INITIAL_CONDITIONAL_STYLING,
      rules: [
        {
          id: 'off',
          name: 'Off',
          enabled: false,
          priority: 0,
          expression: 'true',
          scope: { type: 'cell', columns: ['x'] },
          style: { light: { color: '#111' } },
        },
        {
          id: 'dark-only',
          name: 'Dark',
          enabled: true,
          priority: 1,
          expression: 'true',
          scope: { type: 'cell', columns: ['x'] },
          style: { dark: { color: '#FFF' } },
        },
      ],
    };
    const styles = buildVisualExcelStyles({
      columnCustomization: INITIAL_COLUMN_CUSTOMIZATION,
      conditionalStyling,
      themeMode: 'dark',
    });
    expect(styles.some((s) => s.id === 'ds-rule-dark-only')).toBe(true);
    expect(styles.some((s) => s.id === 'ds-rule-off')).toBe(false);
  });
});

describe('applyFormatExcelClasses', () => {
  it('adds always-on format class rule for formatted columns', () => {
    const state: ColumnCustomizationState = {
      ...INITIAL_COLUMN_CUSTOMIZATION,
      assignments: {
        bidPrice: {
          colId: 'bidPrice',
          valueFormatterTemplate: { kind: 'excelFormat', format: '0.00%' },
        },
      },
    };
    const [out] = applyFormatExcelClasses(
      [{ field: 'bidPrice', colId: 'bidPrice' }],
      state,
    );
    const rules = (out as { cellClassRules?: Record<string, unknown> }).cellClassRules ?? {};
    expect(Object.keys(rules)).toContain(formatExcelClassId('0.00%'));
  });

  it('recurses nested column groups and no-ops columns without format', () => {
    const state: ColumnCustomizationState = {
      ...INITIAL_COLUMN_CUSTOMIZATION,
      assignments: {
        bidPrice: {
          colId: 'bidPrice',
          valueFormatterTemplate: { kind: 'excelFormat', format: '0.00%' },
        },
      },
    };
    const nested = applyFormatExcelClasses([
      {
        headerName: 'Group',
        children: [{ field: 'bidPrice', colId: 'bidPrice' }],
      },
      { field: 'plain', colId: 'plain' },
    ], state);
    const childRules = (nested[0] as { children: Array<{ cellClassRules?: Record<string, unknown> }> })
      .children[0]?.cellClassRules ?? {};
    expect(Object.keys(childRules)).toContain(formatExcelClassId('0.00%'));
    expect((nested[1] as { cellClassRules?: unknown }).cellClassRules).toBeUndefined();
  });
});
