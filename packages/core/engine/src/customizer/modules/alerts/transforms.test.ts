import { describe, expect, it } from 'vitest';
import { applyAlertGridOptions, applyAlertTransforms } from './transforms.js';

describe('alert transforms', () => {
  it('passes column defs through unchanged', () => {
    const defs = [{ field: 'price' }, { field: 'qty' }];
    expect(applyAlertTransforms(defs)).toBe(defs);
  });

  it('passes grid options through unchanged', () => {
    const opts = { animateRows: false, pagination: true };
    expect(applyAlertGridOptions(opts)).toBe(opts);
  });
});
