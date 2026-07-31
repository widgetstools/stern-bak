import { afterEach, describe, expect, it } from 'vitest';
import {
  measureNativeScrollbarWidth,
  _resetNativeScrollbarWidthForTests,
} from './nativeScrollbarWidth';

describe('measureNativeScrollbarWidth', () => {
  afterEach(() => {
    _resetNativeScrollbarWidthForTests();
  });

  it('returns a non-negative number and leaves no probe behind', () => {
    const before = document.body.childElementCount;
    const width = measureNativeScrollbarWidth();
    // jsdom has no layout → 0 (overlay-scrollbar semantics); real
    // Chromium on Windows yields ~17. Both are valid AG inputs.
    expect(width).toBeGreaterThanOrEqual(0);
    expect(document.body.childElementCount).toBe(before);
  });

  it('memoizes — the probe runs once', () => {
    const first = measureNativeScrollbarWidth();
    const before = document.body.childElementCount;
    expect(measureNativeScrollbarWidth()).toBe(first);
    expect(document.body.childElementCount).toBe(before);
  });

  it('probe matches the design-system AG exemption (ag-root-wrapper class)', () => {
    // The measurement is only correct because the probe is exempt from
    // the global styled scrollbar exactly like real grid scrollers.
    // Guard the coupling: the class name must stay in the source.
    _resetNativeScrollbarWidthForTests();
    const observed: string[] = [];
    const origAppend = document.body.appendChild.bind(document.body);
    document.body.appendChild = ((node: Node) => {
      if (node instanceof HTMLElement) observed.push(node.className);
      return origAppend(node);
    }) as typeof document.body.appendChild;
    try {
      measureNativeScrollbarWidth();
    } finally {
      document.body.appendChild = origAppend;
    }
    expect(observed).toContain('ag-root-wrapper');
  });
});
