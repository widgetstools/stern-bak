/**
 * Vitest global setup for @wellsfargo-starui/grid/customizer.
 *
 * Mirrors the core-package setup (cmdk needs ResizeObserver +
 * Element.scrollIntoView shims under jsdom 29) and wires
 * @testing-library/jest-dom + cleanup between tests.
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

// Radix Select + @testing-library/user-event call `hasPointerCapture` /
// `setPointerCapture` on pointer down — jsdom's Element omits them.
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
  try { localStorage.clear(); } catch { /* noop */ }
});
