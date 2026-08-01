import { describe, expect, it } from 'vitest';
import { applyCurrencySymbol, CURRENCY_QUICK_INSERT } from './currencyQuickInsert';

describe('currencyQuickInsert', () => {
  it('seeds a default format when input is empty', () => {
    expect(applyCurrencySymbol('', '$')).toBe('$#,##0.00');
  });

  it('prepends symbol when format has no currency token', () => {
    expect(applyCurrencySymbol('#,##0.00', '€')).toBe('€#,##0.00');
  });

  it('swaps existing currency symbols in two-section formats', () => {
    expect(applyCurrencySymbol('$#,##0.00;($#,##0.00)', '€')).toBe(
      '€#,##0.00;(€#,##0.00)',
    );
  });

  it('exposes six quick-insert entries', () => {
    expect(CURRENCY_QUICK_INSERT.length).toBe(6);
    expect(CURRENCY_QUICK_INSERT[2]?.symbol).toBe('"£"');
  });
});
