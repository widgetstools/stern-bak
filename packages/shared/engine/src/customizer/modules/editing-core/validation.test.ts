import { describe, expect, it } from 'vitest';
import { combineValidators, defaultEditValidator } from './validation.js';

describe('defaultEditValidator', () => {
  it('always returns valid', () => {
    const validate = defaultEditValidator();
    expect(validate({ rowId: 'r1', field: 'x', oldValue: 1, newValue: 2 })).toBe('valid');
  });
});

describe('combineValidators', () => {
  const patch = { rowId: 'r1', field: 'x', oldValue: 1, newValue: 2 };

  it('returns invalid on first invalid result', () => {
    const combined = combineValidators([
      () => 'valid',
      () => 'invalid',
      () => 'warning',
    ]);
    expect(combined(patch)).toBe('invalid');
  });

  it('returns warning when any validator warns and none invalidates', () => {
    const combined = combineValidators([
      () => 'valid',
      () => 'warning',
    ]);
    expect(combined(patch)).toBe('warning');
  });

  it('returns valid when all validators pass', () => {
    const combined = combineValidators([() => 'valid', () => 'valid']);
    expect(combined(patch)).toBe('valid');
  });
});
