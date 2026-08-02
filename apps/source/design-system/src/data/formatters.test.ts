import { describe, expect, it } from 'vitest';
import { fmtBps, fmtMoney, fmtPrice, fmtQty, fmtSignedPct, fmtYield } from './formatters';

describe('formatters', () => {
  it('formats prices, yields, and bps', () => {
    expect(fmtPrice(99.125)).toBe('99.125');
    expect(fmtYield(3.456)).toBe('3.456%');
    expect(fmtBps(12.7)).toBe('13 bp');
  });

  it('formats quantities and signed percentages', () => {
    expect(fmtQty(1_000_000)).toBe('1,000,000');
    expect(fmtSignedPct(1.234)).toBe('+1.23%');
    expect(fmtSignedPct(-0.5)).toBe('-0.50%');
  });

  it('formats money as USD without decimals', () => {
    expect(fmtMoney(1234567)).toBe('$1,234,567');
  });
});
