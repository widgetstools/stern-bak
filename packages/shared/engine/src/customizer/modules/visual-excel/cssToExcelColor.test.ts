import { describe, expect, it } from 'vitest';
import { cssToExcelColor } from './cssToExcelColor.js';

describe('cssToExcelColor', () => {
  it('normalises 3-digit hex', () => {
    expect(cssToExcelColor('#f00')).toBe('#FF0000');
  });

  it('passes through 6-digit hex', () => {
    expect(cssToExcelColor('#22C55E')).toBe('#22C55E');
  });

  it('parses rgb()', () => {
    expect(cssToExcelColor('rgb(34, 197, 94)')).toBe('#22C55E');
  });

  it('resolves design-system token fallbacks without DOM', () => {
    expect(cssToExcelColor('var(--ds-accent-negative)')).toBe('#EF4444');
  });
});
