import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetExpressionCacheForTests,
  valueFormatterFromTemplate,
} from './valueFormatterFromTemplate';
import type { FormatterParams } from './formatterTypes';

const p = (value: unknown, data?: unknown): FormatterParams =>
  ({ value, data } as FormatterParams);

describe('valueFormatterFromTemplate — presets', () => {
  it('formats currency with custom options and rejects non-finite numbers', () => {
    const fmt = valueFormatterFromTemplate({
      kind: 'preset',
      preset: 'currency',
      options: { currency: 'EUR', decimals: 0 },
    });
    expect(fmt(p(1234.5))).toContain('1,235');
    expect(fmt(p(null))).toBe('');
    expect(fmt(p('not-a-number'))).toBe('');
  });

  it('formats percent and number presets', () => {
    const pct = valueFormatterFromTemplate({
      kind: 'preset',
      preset: 'percent',
      options: { decimals: 2 },
    });
    expect(pct(p(0.125))).toBe('12.50%');

    const num = valueFormatterFromTemplate({
      kind: 'preset',
      preset: 'number',
      options: { decimals: 2, thousands: false },
    });
    expect(num(p(1234.5))).toBe('1234.50');
  });

  it('formats duration as mm:ss or hh:mm:ss', () => {
    const fmt = valueFormatterFromTemplate({ kind: 'preset', preset: 'duration' });
    expect(fmt(p(65_000))).toBe('01:05');
    expect(fmt(p(3_665_000))).toBe('01:01:05');
    expect(fmt(p(null))).toBe('');
    expect(fmt(p('bad'))).toBe('');
  });

  it('accepts epoch-ms, Date, and numeric date strings', () => {
    const epoch = Date.UTC(2026, 5, 14);
    const fmt = valueFormatterFromTemplate({
      kind: 'preset',
      preset: 'date',
      options: { locale: 'en-US', dateStyle: 'short' },
    });
    expect(fmt(p(epoch))).toContain('6');
    expect(fmt(p(new Date(epoch)))).toContain('6');
    expect(fmt(p(String(epoch)))).toContain('6');
  });

  it('formats datetime with custom date and time styles', () => {
    const epoch = Date.UTC(2026, 5, 14, 13, 5);
    const fmt = valueFormatterFromTemplate({
      kind: 'preset',
      preset: 'datetime',
      options: { locale: 'en-US', dateStyle: 'full', timeStyle: 'medium' },
    });
    expect(fmt(p(epoch))).toMatch(/2026/);
  });

  it('uses navigator.language when locale option omitted', () => {
    const original = navigator.language;
    Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true });
    const fmt = valueFormatterFromTemplate({ kind: 'preset', preset: 'date' });
    expect(fmt(p(Date.UTC(2026, 0, 1)))).toContain('2026');
    Object.defineProperty(navigator, 'language', { value: original, configurable: true });
  });
});

describe('valueFormatterFromTemplate — tick and expression', () => {
  beforeEach(() => {
    __resetExpressionCacheForTests();
  });

  afterEach(() => {
    __resetExpressionCacheForTests();
  });

  it('tick formatter short-circuits null values', () => {
    const fmt = valueFormatterFromTemplate({ kind: 'tick', tick: 'TICK32' });
    expect(fmt(p(null))).toBe('');
    expect(fmt(p(101.5))).toBe('101-16');
  });

  it('compiles expressions and caches by source string', () => {
    const fmt1 = valueFormatterFromTemplate({ kind: 'expression', expression: 'x * 2' });
    const fmt2 = valueFormatterFromTemplate({ kind: 'expression', expression: 'x * 2' });
    expect(fmt1).toBe(fmt2);
    expect(fmt1(p(3))).toBe('6');
    expect(fmt1(p(null))).toBe('0');
  });

  it('falls back to identity on compile and runtime expression errors', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const badCompile = valueFormatterFromTemplate({ kind: 'expression', expression: '{' });
    expect(badCompile(p(7))).toBe('7');
    expect(warn).toHaveBeenCalled();

    const badRuntime = valueFormatterFromTemplate({ kind: 'expression', expression: 'x.foo.bar' });
    expect(badRuntime(p({ foo: null }))).toBe('[object Object]');
    warn.mockRestore();
  });
});
