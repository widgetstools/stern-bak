import { describe, expect, it } from 'vitest';
import { applyPlusMinusColDefTransforms } from './transforms.js';

describe('applyPlusMinusColDefTransforms', () => {
  it('suppresses +/- keys on editable numeric columns', () => {
    const defs = [{ field: 'quantityFace', editable: true, cellDataType: 'number' }];
    const out = applyPlusMinusColDefTransforms(defs);
    const suppress = (out[0] as { suppressKeyboardEvent?: (p: { event: KeyboardEvent; editing: boolean }) => boolean })
      .suppressKeyboardEvent;
    expect(suppress?.({ event: { key: '=' } as KeyboardEvent, editing: false })).toBe(true);
    expect(suppress?.({ event: { key: '-' } as KeyboardEvent, editing: false })).toBe(true);
    expect(suppress?.({ event: { key: 'a' } as KeyboardEvent, editing: false })).toBe(false);
    expect(suppress?.({ event: { key: '=' } as KeyboardEvent, editing: true })).toBe(false);
  });

  it('skips non-editable and non-numeric columns', () => {
    const defs = [
      { field: 'ticker', editable: true, cellDataType: 'text' },
      { field: 'qty', editable: false, cellDataType: 'number' },
    ];
    const out = applyPlusMinusColDefTransforms(defs);
    expect((out[0] as { suppressKeyboardEvent?: unknown }).suppressKeyboardEvent).toBeUndefined();
    expect((out[1] as { suppressKeyboardEvent?: unknown }).suppressKeyboardEvent).toBeUndefined();
  });
});
