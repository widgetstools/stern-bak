import { describe, expect, it } from 'vitest';

/**
 * Guards the `Range` geometry shims in `setup.ts`.
 *
 * Without them CodeMirror's hover timer throws an UNCAUGHT TypeError after its
 * test has torn down, which fails the whole Vitest run while every individual
 * test still reports green — a failure mode that is nearly unreadable from the
 * summary. It only reproduces under full-suite timing, so this asserts the shim
 * directly rather than leaving the flake as the only signal.
 */
describe('jsdom Range geometry shims', () => {
  it('answers getClientRects with an empty, indexable list instead of throwing', () => {
    const range = document.createRange();
    range.selectNodeContents(document.body);
    const rects = range.getClientRects();
    expect(rects.length).toBe(0);
    expect(rects.item(0)).toBeNull();
    // CodeMirror scans the list with Array.prototype.find.call.
    expect(Array.prototype.find.call(rects, () => true)).toBeUndefined();
  });

  it('answers getBoundingClientRect with a zero rect', () => {
    const range = document.createRange();
    range.selectNodeContents(document.body);
    const rect = range.getBoundingClientRect();
    expect(rect.width).toBe(0);
    expect(rect.height).toBe(0);
    expect(rect.toJSON()).toMatchObject({ x: 0, y: 0, width: 0, height: 0 });
  });
});
