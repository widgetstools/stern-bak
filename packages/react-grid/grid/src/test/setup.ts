/**
 * Vitest global setup for @wellsfargo-starui/grid (widget + customizer).
 *
 * Wires jest-dom matchers, jsdom shims for cmdk/Radix (ResizeObserver,
 * scrollIntoView, pointer capture), and per-test cleanup.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverShim {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverShim as unknown as typeof ResizeObserver;
}

if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function () {};
}

// @codemirror/view (ExpressionEditor) measures text asynchronously via
// `textRange(node, …).getClientRects()` on a rAF/timeout AFTER the test that
// mounted it finished — jsdom's Range has neither getClientRects nor
// getBoundingClientRect, so the whole run exits 1 with an unhandled
// TypeError while every test passes. Empty geometry is what jsdom reports
// for elements anyway; CodeMirror treats it as "nothing to measure".
if (typeof Range !== 'undefined' && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
}
if (typeof Range !== 'undefined' && !Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () =>
    ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }) as DOMRect;
}

// Radix Select/Dropdown + @testing-library/user-event call pointer capture APIs.
if (typeof Element !== 'undefined' && !Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
}
if (typeof Element !== 'undefined' && !Element.prototype.setPointerCapture) {
  Element.prototype.setPointerCapture = function () {};
}
if (typeof Element !== 'undefined' && !Element.prototype.releasePointerCapture) {
  Element.prototype.releasePointerCapture = function () {};
}

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    /* noop */
  }
});
