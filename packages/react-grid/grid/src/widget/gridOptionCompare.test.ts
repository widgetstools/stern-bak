import { describe, expect, it } from 'vitest';
import { functionOptionValuesEqual, gridOptionValuesEqual } from './gridOptionCompare';

describe('functionOptionValuesEqual — function carriers compare shallowly, functions by reference', () => {
  const stableGetter = () => 'x';

  it('equal when object identity churns but every member (incl. functions) is the same reference', () => {
    const a = { resizable: true, tooltipValueGetter: stableGetter };
    const b = { resizable: true, tooltipValueGetter: stableGetter };
    expect(functionOptionValuesEqual(a, b)).toBe(true);
  });

  it('NOT equal when a function member is a fresh closure — rebuilt predicates must push', () => {
    const a = { rule: () => true };
    const b = { rule: () => true };
    expect(functionOptionValuesEqual(a, b)).toBe(false);
  });

  it('NOT equal when a scalar member changed', () => {
    const a = { resizable: true, tooltipValueGetter: stableGetter };
    const b = { resizable: false, tooltipValueGetter: stableGetter };
    expect(functionOptionValuesEqual(a, b)).toBe(false);
  });

  it('handles non-object shapes without throwing', () => {
    const fn = () => 1;
    expect(functionOptionValuesEqual(fn, fn)).toBe(true);
    expect(functionOptionValuesEqual(fn, () => 1)).toBe(false);
    expect(functionOptionValuesEqual(undefined, { a: 1 })).toBe(false);
    expect(functionOptionValuesEqual([stableGetter], [stableGetter])).toBe(false);
  });
});

describe('gridOptionValuesEqual — sanity on the existing shallow special-cases', () => {
  it('defaultColDef compares shallowly with function members by reference', () => {
    const getter = () => 'x';
    expect(
      gridOptionValuesEqual(
        'defaultColDef',
        { minWidth: 40, tooltipValueGetter: getter },
        { minWidth: 40, tooltipValueGetter: getter },
      ),
    ).toBe(true);
  });
});
