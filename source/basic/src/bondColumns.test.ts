import type { ValueFormatterParams } from 'ag-grid-community';
import { describe, expect, it } from 'vitest';
import { bondColumnDefs, bondDefaultColDef } from './bondColumns';
import type { Bond } from './mockBonds';

function fmt(field: string, value: unknown) {
  const col = bondColumnDefs.find((c) => c.field === field);
  expect(col?.valueFormatter).toBeDefined();
  const formatter = col!.valueFormatter!;
  if (typeof formatter === 'function') {
    return formatter({ value } as ValueFormatterParams<Bond>);
  }
  return undefined;
}

describe('bondColumnDefs', () => {
  it('defines expected columns', () => {
    expect(bondColumnDefs.length).toBeGreaterThan(30);
    expect(bondColumnDefs.map((c) => c.field)).toContain('ticker');
    expect(bondColumnDefs.map((c) => c.field)).toContain('pnlYtd');
  });

  it('bondDefaultColDef enables grid features', () => {
    expect(bondDefaultColDef.floatingFilter).toBe(true);
    expect(bondDefaultColDef.filter).toBe(true);
    expect(bondDefaultColDef.sortable).toBe(true);
    expect(bondDefaultColDef.resizable).toBe(true);
  });

  describe('value formatters', () => {
    it('fmtPx returns empty for null and formats price', () => {
      expect(fmt('bidPrice', null)).toBe('');
      expect(fmt('bidPrice', 99.125)).toBe('99.125');
    });

    it('fmtYield appends percent', () => {
      expect(fmt('bidYield', null)).toBe('');
      expect(fmt('bidYield', 4.567)).toBe('4.567%');
    });

    it('fmtBps formats spread values', () => {
      expect(fmt('oas', null)).toBe('');
      expect(fmt('oas', 125.4)).toBe('125.40');
    });

    it('fmtDuration formats duration and convexity', () => {
      expect(fmt('duration', null)).toBe('');
      expect(fmt('duration', 5.678)).toBe('5.68');
      expect(fmt('convexity', 12.3)).toBe('12.30');
    });

    it('fmtDv01 uses four decimal places', () => {
      expect(fmt('dv01', null)).toBe('');
      expect(fmt('dv01', 0.0456)).toBe('0.0456');
    });

    it('fmtMoney rounds notional values', () => {
      expect(fmt('notional', null)).toBe('');
      expect(fmt('notional', 1_234_567.89)).toBe('1,234,568');
    });

    it('fmtSize formats millions, thousands, and raw', () => {
      expect(fmt('size', null)).toBe('');
      expect(fmt('size', 2_500_000)).toBe('2.5MM');
      expect(fmt('size', 5_000)).toBe('5K');
      expect(fmt('size', 500)).toBe('500');
    });

    it('fmtPnl handles zero, positive, and negative', () => {
      expect(fmt('pnlDay', null)).toBe('0');
      expect(fmt('pnlDay', 0)).toBe('0');
      expect(fmt('pnlDay', 1500)).toBe('+1,500');
      expect(fmt('pnlDay', -2500)).toBe('−2,500');
    });

    it('fmtDate slices ISO date', () => {
      expect(fmt('maturity', null)).toBe('');
      expect(fmt('maturity', '2035-06-15T00:00:00.000Z')).toBe('2035-06-15');
    });

    it('fmtTime formats lastTradedAt', () => {
      expect(fmt('lastTradedAt', null)).toBe('');
      expect(fmt('lastTradedAt', '')).toBe('');
      const result = fmt('lastTradedAt', '2030-06-15T14:30:00.000Z');
      expect(result).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('coupon formatter handles null and numbers', () => {
      expect(fmt('coupon', null)).toBe('');
      expect(fmt('coupon', 5.25)).toBe('5.250');
    });
  });
});
