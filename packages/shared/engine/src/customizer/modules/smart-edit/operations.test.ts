import { describe, expect, it } from 'vitest';
import { applyNumericOp } from './operations.js';

describe('applyNumericOp', () => {
  it('multiplies', () => {
    expect(applyNumericOp(100, 'multiply', 0.95)).toBe(95);
  });

  it('divides with zero guard', () => {
    expect(applyNumericOp(10, 'divide', 0)).toBeNull();
    expect(applyNumericOp(10, 'divide', 2)).toBe(5);
  });

  it('adds and subtracts', () => {
    expect(applyNumericOp(10, 'add', 3)).toBe(13);
    expect(applyNumericOp(10, 'subtract', 4)).toBe(6);
  });

  it('rejects non-numeric', () => {
    expect(applyNumericOp('x', 'add', 1)).toBeNull();
  });

  it('bulk set', () => {
    expect(applyNumericOp(999, 'set', 42)).toBe(42);
  });
});
