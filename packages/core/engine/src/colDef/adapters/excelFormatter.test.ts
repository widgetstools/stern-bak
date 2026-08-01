import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  excelFormatter,
  excelFormatColorResolver,
  isValidExcelFormat,
  __resetExcelFormatterCacheForTests,
} from './excelFormatter';

describe('excelFormatter', () => {
  beforeEach(() => {
    __resetExcelFormatterCacheForTests();
  });

  it('formats valid numeric patterns and caches by format string', () => {
    const fmt = excelFormatter('#,##0.00');
    expect(fmt({ value: 1234.5 })).toBe('1,234.50');
    expect(excelFormatter('#,##0.00')).toBe(fmt);
  });

  it('falls back to string rendering for invalid format strings', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fmt = excelFormatter('[[[[');
    expect(fmt.isValid).toBe(false);
    expect(fmt({ value: 42 })).toBe('42');
    expect(isValidExcelFormat('[[[[')).toBe(false);
    warn.mockRestore();
  });

  it('sanitizes unquoted unicode literals for SSF', () => {
    const fmt = excelFormatter('▲ #,##0.00');
    expect(fmt({ value: 1 })).toContain('1.00');
  });

  it('coerces ISO date strings for date formats', () => {
    const fmt = excelFormatter('yyyy-mm-dd');
    const out = fmt({ value: '2026-04-17T05:37:16.092Z' });
    expect(out).toMatch(/2026-04-17/);
  });

  it('exposes color resolvers for conditional color tags', () => {
    const format = '[Red]-#,##0.00;[Green]#,##0.00';
    const fmt = excelFormatter(format) as ReturnType<typeof excelFormatter> & {
      colorForValue?: (v: unknown) => string | undefined;
    };
    expect(fmt.hasColors).toBe(true);
    expect(excelFormatColorResolver(format)?.(-1)).toContain('positive');
    expect(excelFormatColorResolver(format)?.(1)).toContain('negative');
  });

  it('returns empty string for nullish cell values', () => {
    const fmt = excelFormatter('#,##0');
    expect(fmt({ value: null })).toBe('');
    expect(fmt({ value: '' })).toBe('');
  });
});
