import { describe, it, expect } from 'vitest';
import { applyAutoFormatPlanReducer } from './formattingActions';
import type { ColumnCustomizationState } from './state';
import type { AutoFormatAssignment } from '../../../colDef/fieldFormatCatalog/types.js';

const PNL_FORMAT = { kind: 'excelFormat', format: '[Green]#,##0.00;[Red]-#,##0.00;#,##0.00' } as const;

const plan: Record<string, AutoFormatAssignment> = {
  bidPrice: {
    alignment: 'right',
    valueFormatterTemplate: { kind: 'preset', preset: 'number', options: { decimals: 4, thousands: false } },
  },
  // Sign-coloured P&L is now native (excelFormat colour tags), not a renderer.
  unrealizedPnl: { alignment: 'right', valueFormatterTemplate: { ...PNL_FORMAT } },
  // Ticker is bold typography + left align.
  symbol: { alignment: 'left', typography: { bold: true } },
};

describe('applyAutoFormatPlanReducer', () => {
  it('applies formatter, alignment + typography (both theme slots) to a fresh state', () => {
    const next = applyAutoFormatPlanReducer(plan)(undefined);
    const price = next.assignments['bidPrice'];
    expect(price.valueFormatterTemplate).toEqual({ kind: 'preset', preset: 'number', options: { decimals: 4, thousands: false } });
    expect(price.cellStyleOverrides?.dark?.alignment?.horizontal).toBe('right');
    expect(price.cellStyleOverrides?.light?.alignment?.horizontal).toBe('right');

    const pnl = next.assignments['unrealizedPnl'];
    expect(pnl.valueFormatterTemplate).toEqual(PNL_FORMAT);
    expect(pnl.cellStyleOverrides?.dark?.alignment?.horizontal).toBe('right');
    // native-only — never assigns a cell renderer
    expect(pnl.cellRendererId).toBeUndefined();

    const sym = next.assignments['symbol'];
    expect(sym.cellStyleOverrides?.dark?.typography?.bold).toBe(true);
    expect(sym.cellStyleOverrides?.light?.typography?.bold).toBe(true);
    expect(sym.cellStyleOverrides?.dark?.alignment?.horizontal).toBe('left');
  });

  it('is non-destructive by default — skips already-formatted columns', () => {
    const prev: ColumnCustomizationState = {
      assignments: {
        bidPrice: { colId: 'bidPrice', valueFormatterTemplate: { kind: 'excelFormat', format: '0.00' } },
      },
    };
    const next = applyAutoFormatPlanReducer(plan)(prev);
    // existing formatting preserved
    expect(next.assignments['bidPrice'].valueFormatterTemplate).toEqual({ kind: 'excelFormat', format: '0.00' });
    expect(next.assignments['bidPrice'].cellStyleOverrides).toBeUndefined();
    // the other column still gets formatted
    expect(next.assignments['unrealizedPnl'].valueFormatterTemplate).toEqual(PNL_FORMAT);
  });

  it('formats structural-only assignments (width/pin are not "formatting")', () => {
    const prev: ColumnCustomizationState = {
      assignments: { bidPrice: { colId: 'bidPrice', initialWidth: 120 } },
    };
    const next = applyAutoFormatPlanReducer(plan)(prev);
    expect(next.assignments['bidPrice'].initialWidth).toBe(120);
    expect(next.assignments['bidPrice'].valueFormatterTemplate).toBeDefined();
  });

  it('overwrites existing formatting when onlyUnstyled is false', () => {
    const prev: ColumnCustomizationState = {
      assignments: { bidPrice: { colId: 'bidPrice', valueFormatterTemplate: { kind: 'excelFormat', format: '0.00' } } },
    };
    const next = applyAutoFormatPlanReducer(plan, { onlyUnstyled: false })(prev);
    expect(next.assignments['bidPrice'].valueFormatterTemplate).toEqual({ kind: 'preset', preset: 'number', options: { decimals: 4, thousands: false } });
  });

  it('clears any prior cell renderer so the native formatter shows', () => {
    // A column auto-formatted by an older (renderer-based) catalog, or one the
    // user gave a renderer to. Re-running Auto Format must drop the opaque
    // renderer so the native value formatter / colour tags actually paint.
    const prev: ColumnCustomizationState = {
      assignments: {
        unrealizedPnl: {
          colId: 'unrealizedPnl',
          cellRendererId: 'pnl-value',
          cellRendererConfig: { kind: 'pnl-value', config: {} },
        },
      },
    };
    const next = applyAutoFormatPlanReducer(plan, { onlyUnstyled: false })(prev);
    const pnl = next.assignments['unrealizedPnl'];
    expect(pnl.cellRendererId).toBeUndefined();
    expect(pnl.cellRendererConfig).toBeUndefined();
    expect(pnl.valueFormatterTemplate).toEqual(PNL_FORMAT);
  });

  it('overwrite preserves user fields the catalog does not own (e.g. colours)', () => {
    const prev: ColumnCustomizationState = {
      assignments: {
        bidPrice: {
          colId: 'bidPrice',
          cellStyleOverrides: { dark: { colors: { text: '#abcdef' } }, light: { colors: { text: '#abcdef' } } },
        },
      },
    };
    const next = applyAutoFormatPlanReducer(plan, { onlyUnstyled: false })(prev);
    const price = next.assignments['bidPrice'];
    expect(price.valueFormatterTemplate).toBeDefined();
    expect(price.cellStyleOverrides?.dark?.colors?.text).toBe('#abcdef');
    expect(price.cellStyleOverrides?.dark?.alignment?.horizontal).toBe('right');
  });

  it('returns the same reference for an empty plan', () => {
    const prev: ColumnCustomizationState = { assignments: {} };
    expect(applyAutoFormatPlanReducer({})(prev)).toBe(prev);
  });
});
