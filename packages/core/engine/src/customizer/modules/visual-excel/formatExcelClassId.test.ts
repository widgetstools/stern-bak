import { describe, expect, it } from 'vitest';
import { formatExcelClassId } from './formatExcelClassId.js';

describe('formatExcelClassId', () => {
  it('returns a stable id for the same format string', () => {
    expect(formatExcelClassId('#,##0.00')).toBe(formatExcelClassId('#,##0.00'));
  });

  it('prefixes ids with ds-xls-fmt-', () => {
    expect(formatExcelClassId('General')).toMatch(/^ds-xls-fmt-/);
  });

  it('produces different ids for different formats', () => {
    expect(formatExcelClassId('0.00')).not.toBe(formatExcelClassId('0.000'));
  });
});
