import { describe, expect, it } from 'vitest';
import { applySmartEditColDefTransforms } from './transforms.js';

describe('applySmartEditColDefTransforms', () => {
  it('passes through when disabled', () => {
    const defs = [{ field: 'qty', editable: true, cellDataType: 'number' }];
    expect(applySmartEditColDefTransforms(defs, false)).toBe(defs);
  });

  it('wraps editable numeric columns with valueParser', () => {
    const defs = [{ field: 'qty', editable: true, cellDataType: 'number' }];
    const out = applySmartEditColDefTransforms(defs, true);
    expect(out[0].valueParser).toBeTypeOf('function');
    const parsed = out[0].valueParser!({ newValue: '1.5M' } as never);
    expect(parsed).toBe(1_500_000);
  });

  it('chains existing valueParser', () => {
    const defs = [{
      field: 'qty',
      editable: true,
      cellDataType: 'number',
      valueParser: () => 99,
    }];
    const out = applySmartEditColDefTransforms(defs, true);
    const parsed = out[0].valueParser!({ newValue: 'not-a-suffix' } as never);
    expect(parsed).toBe(99);
  });

  it('skips non-editable and non-numeric', () => {
    const defs = [
      { field: 'a', editable: false, cellDataType: 'number' },
      { field: 'b', editable: true, cellDataType: 'text' },
    ];
    const out = applySmartEditColDefTransforms(defs, true);
    expect(out[0].valueParser).toBeUndefined();
    expect(out[1].valueParser).toBeUndefined();
  });
});
