import { describe, expect, it } from 'vitest';
import { formatValue, formatCompact, formatNumberFallback } from './formatValue.js';

describe('formatValue — reuses the grid\'s own column formats', () => {
  it('keeps the precision a bond price is quoted in', () => {
    // compactNumber used to round this to 101.56 and lose the 32nds.
    expect(formatValue('midPrice', 101.5625)).toBe('101.5625');
  });

  it('gives a mid-range number its thousands separator', () => {
    expect(formatValue('dv01', 1234.5)).toBe('1,234.50');
  });

  it('scales a genuinely large measure', () => {
    expect(formatValue('marketValue', 1234567.89)).toBe('1.23M');
  });
});

/**
 * The catalogue matches on the column NAME, which misfires in ways that are
 * worse than not formatting at all. Each of these was found by probing real
 * field names.
 */
describe('formatValue — guards against the catalogue misfiring', () => {
  it('never renders a number as a 1970 date', () => {
    // `yieldToMaturity` matches the `maturity` → date entry; a yield of
    // 4.3271 rendered as "Jan 1, 1970" before the date template was refused.
    const out = formatValue('yieldToMaturity', 4.3271);
    expect(out).not.toMatch(/19[0-9]{2}|Jan/);
    expect(out).toBe('4.33');
  });

  it('never shows a non-zero value as zero', () => {
    // A 2-decimal format collapses 0.0042 to "0.00" — reporting a live
    // number as nothing.
    expect(formatValue('someRate', 0.0042)).toBe('0.0042');
  });

  it('does not scale a small value below one unit', () => {
    // A K-scaling format turns 700 into "0.7K", which is harder to read
    // than the number it replaced.
    expect(formatValue('sum_marketValue', 700)).toBe('700');
    expect(formatValue('sum_marketValue', 1500)).toBe('1,500');
  });

  it('formats an aggregate alias like the column it aggregates', () => {
    expect(formatValue('sum_marketValue', 1234567.89)).toBe(formatValue('marketValue', 1234567.89));
    expect(formatValue('avg_dv01', 1234.5)).toBe('1,234.50');
  });

  it('leaves a count as a plain integer whatever column it counted', () => {
    // Inheriting marketValue's M-scaling for a count of 420 would be wrong.
    expect(formatValue('count_marketValue', 420)).toBe('420');
  });
});

describe('formatValue — non-numeric input', () => {
  it('passes text through and renders blanks as empty', () => {
    expect(formatValue('ticker', 'T 4.5 2031')).toBe('T 4.5 2031');
    expect(formatValue('x', null)).toBe('');
    expect(formatValue('x', undefined)).toBe('');
  });

  it('does not pretend a non-finite number is a value', () => {
    expect(formatValue('x', NaN)).toBe('NaN');
    expect(formatValue('x', Infinity)).toBe('Infinity');
  });
});

describe('formatNumberFallback — consistent within a column', () => {
  /** `700.00` next to `1,500` in one column reads as sloppy; decimals follow
   *  the value's own shape instead of its magnitude. */
  it('keeps whole numbers whole and fractions at two places', () => {
    expect(formatNumberFallback(700)).toBe('700');
    expect(formatNumberFallback(1500)).toBe('1,500');
    expect(formatNumberFallback(1234.5678)).toBe('1,234.57');
  });

  it('keeps four places for a sub-unit value, where the decimals are the content', () => {
    expect(formatNumberFallback(0.0042)).toBe('0.0042');
  });
});

describe('formatCompact — axis ticks only', () => {
  it('abbreviates by magnitude', () => {
    expect(formatCompact(1_234_567)).toBe('1.23M');
    expect(formatCompact(12_345)).toBe('12.3K');
    expect(formatCompact(2_500_000_000)).toBe('2.50B');
  });

  it('separates a plain integer rather than abbreviating it', () => {
    expect(formatCompact(5000)).toBe('5,000');
  });
});
