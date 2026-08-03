/**
 * Vitest global setup for @wellsfargo-starui/grid (widget + customizer).
 *
 * Wires jest-dom matchers, jsdom shims for cmdk/Radix (ResizeObserver,
 * scrollIntoView, pointer capture) and for CodeMirror (Range geometry), plus
 * per-test cleanup.
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

// CodeMirror measures text through `Range` geometry, and jsdom implements
// neither `Range` method (it has the `Element` ones, which is why only the
// editor hits this). The crash is a TEARDOWN race, not a test failure: the
// ExpressionEditor's hover plugin schedules `checkHover` on a timer, and when
// that timer outlives the test, `TextTile.coordsIn` calls
// `textRange(...).getClientRects()` on a detached editor and throws an uncaught
// TypeError — which fails the whole Vitest run while every test still passes.
// It surfaces only under full-suite load, so the file passes in isolation.
//
// Empty geometry is the right answer rather than a fake rect: jsdom performs no
// layout, so every rect would be a lie, and CodeMirror already treats an empty
// list as "not measurable" (`if (!rects.length) return null`) and unwinds to the
// same no-coords path a zero-size element takes in a real browser.
if (typeof Range !== 'undefined' && !Range.prototype.getClientRects) {
  Range.prototype.getClientRects = function () {
    return Object.assign([] as DOMRect[], { item: () => null }) as unknown as DOMRectList;
  };
}
if (typeof Range !== 'undefined' && !Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = function () {
    const rect = { x: 0, y: 0, width: 0, height: 0, top: 0, right: 0, bottom: 0, left: 0 };
    return { ...rect, toJSON: () => rect } as DOMRect;
  };
}

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    /* noop */
  }
});
