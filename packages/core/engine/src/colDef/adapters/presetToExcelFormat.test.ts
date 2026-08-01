import { describe, expect, it } from 'vitest';
import { presetToExcelFormat } from './presetToExcelFormat';

describe('presetToExcelFormat', () => {
  it('returns empty for missing or expression templates', () => {
    expect(presetToExcelFormat(undefined)).toBe('');
    expect(presetToExcelFormat({ kind: 'expression', source: 'x * 2' })).toBe('');
  });

  it('passes through excelFormat templates', () => {
    expect(
      presetToExcelFormat({ kind: 'excelFormat', format: '#,##0.00' }),
    ).toBe('#,##0.00');
  });

  it('maps currency presets with sign and negative parentheses', () => {
    expect(
      presetToExcelFormat({
        kind: 'preset',
        preset: 'currency',
        options: { currency: 'USD', decimals: 2 },
      }),
    ).toBe('$#,##0.00;($#,##0.00)');
    expect(
      presetToExcelFormat({
        kind: 'preset',
        preset: 'currency',
        options: { currency: 'EUR', decimals: 0 },
      }),
    ).toBe('€#,##0;(€#,##0)');
  });

  it('maps number, percent, date, datetime, and duration presets', () => {
    expect(
      presetToExcelFormat({ kind: 'preset', preset: 'percent', options: { decimals: 2 } }),
    ).toBe('0.00%');
    expect(
      presetToExcelFormat({ kind: 'preset', preset: 'number', options: { thousands: false } }),
    ).toBe('0');
    expect(presetToExcelFormat({ kind: 'preset', preset: 'date' })).toBe('yyyy-mm-dd');
    expect(presetToExcelFormat({ kind: 'preset', preset: 'datetime' })).toBe('yyyy-mm-dd hh:mm:ss');
    expect(presetToExcelFormat({ kind: 'preset', preset: 'duration' })).toBe('[hh]:mm:ss');
  });

  it('returns empty for unknown preset kinds', () => {
    expect(
      presetToExcelFormat({ kind: 'preset', preset: 'unknown' as 'number' }),
    ).toBe('');
  });
});
