import { describe, expect, it } from 'vitest';
import { TICK_LABELS, TICK_SAMPLES, tickFormatter } from './tickFormatter';

describe('tickFormatter', () => {
  it('formats TICK32 with zero-padded ticks and handle carry', () => {
    expect(tickFormatter('TICK32')(101.5)).toBe('101-16');
    expect(tickFormatter('TICK32')(101.53125)).toBe('101-17');
    expect(tickFormatter('TICK32')(101.96875)).toBe('101-31');
    expect(tickFormatter('TICK32')(101.984375)).toBe('102-00');
  });

  it('formats negative prices with leading minus', () => {
    expect(tickFormatter('TICK32')(-101.5)).toBe('-101-16');
  });

  it('formats TICK32_PLUS with half-32nd plus suffix', () => {
    expect(tickFormatter('TICK32_PLUS')(101.5)).toBe('101-16');
    expect(tickFormatter('TICK32_PLUS')(101.515625)).toBe('101-16+');
    expect(tickFormatter('TICK32_PLUS')(101.5078125)).toBe('101-16+');
  });

  it('formats TICK64 with trailing quarter digit', () => {
    expect(tickFormatter('TICK64')(101.5)).toBe('101-160');
    expect(tickFormatter('TICK64')(101.515625)).toBe('101-161');
    expect(tickFormatter('TICK64')(101.5078125)).toBe('101-161');
    expect(tickFormatter('TICK64')(101.5234375)).toBe('101-170');
  });

  it('formats TICK128 with sub-tick slice digit', () => {
    expect(tickFormatter('TICK128')(101.5078125)).toMatch(/^101-\d{2}\d$/);
  });

  it('formats TICK256 with hex slice for values >= 10', () => {
    const fmt = tickFormatter('TICK256');
    const out = fmt(101.50390625);
    expect(out).toMatch(/^101-\d{2}[0-9A-F]$/);
  });

  it('returns empty string for null, undefined, empty, and non-finite values', () => {
    for (const token of ['TICK32', 'TICK32_PLUS', 'TICK64', 'TICK128', 'TICK256'] as const) {
      const fmt = tickFormatter(token);
      expect(fmt(null)).toBe('');
      expect(fmt(undefined)).toBe('');
      expect(fmt('')).toBe('');
      expect(fmt(Number.NaN)).toBe('');
      expect(fmt(Number.POSITIVE_INFINITY)).toBe('');
    }
  });

  it('exports labels and sample strings for every token', () => {
    for (const token of ['TICK32', 'TICK32_PLUS', 'TICK64', 'TICK128', 'TICK256'] as const) {
      expect(TICK_LABELS[token]).toBeTruthy();
      expect(TICK_SAMPLES[token]).toBeTruthy();
    }
  });

  it('default branch stringifies unknown future token values', () => {
    const fmt = tickFormatter('TICK32' as 'TICK32');
    // Force default via cast — runtime guard for exhaustive switch
    const unknown = tickFormatter('UNKNOWN' as 'TICK32');
    expect(unknown(null)).toBe('');
    expect(unknown(42)).toBe('42');
  });
});
