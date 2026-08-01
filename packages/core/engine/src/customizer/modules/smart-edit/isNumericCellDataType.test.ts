import { describe, expect, it } from 'vitest';
import { isNumericCellDataType } from './isNumericCellDataType.js';

describe('isNumericCellDataType', () => {
  it('accepts number and numeric', () => {
    expect(isNumericCellDataType('number')).toBe(true);
    expect(isNumericCellDataType('numeric')).toBe(true);
    expect(isNumericCellDataType('NUMBER')).toBe(true);
  });

  it('rejects other types', () => {
    expect(isNumericCellDataType('text')).toBe(false);
    expect(isNumericCellDataType(undefined)).toBe(false);
  });
});
