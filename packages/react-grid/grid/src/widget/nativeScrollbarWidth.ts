/**
 * Measure the NATIVE scrollbar width for AG Grid's `scrollbarWidth`
 * grid option.
 *
 * AG Grid sizes its vertical/horizontal scroll gutters from a
 * one-time measurement probe appended to `document.body`. The
 * design-system's global scrollbar baseline styles that probe (10px
 * custom scrollbars) while AG Grid subtrees are exempt and render
 * NATIVE scrollbars (see design-system `styles/scrollbar.css` — the
 * exemption keeps grid scrolling on Chromium's composited path). The
 * mismatch clipped the native ~17px scrollbar inside a 10px gutter —
 * a truncated thumb.
 *
 * This probe carries the `ag-root-wrapper` class so it matches the
 * SAME exemption the real grid scrollers do, yielding the true native
 * width. Inline `border:none` defeats any theme border on
 * `.ag-root-wrapper` that would pollute `offsetWidth - clientWidth`.
 *
 * `0` is a legitimate result (overlay scrollbars — macOS, and any
 * jsdom test environment) — AG collapses the gutter, which is exactly
 * what overlay scrollbars need.
 */
let cachedWidth: number | null = null;

export function measureNativeScrollbarWidth(): number {
  if (cachedWidth !== null) return cachedWidth;
  if (typeof document === 'undefined') return 0;
  const probe = document.createElement('div');
  probe.className = 'ag-root-wrapper';
  probe.style.cssText =
    'position:absolute;top:-9999px;left:-9999px;width:100px;height:100px;' +
    'overflow:scroll;visibility:hidden;border:none;padding:0;';
  document.body.appendChild(probe);
  cachedWidth = Math.max(0, probe.offsetWidth - probe.clientWidth);
  document.body.removeChild(probe);
  return cachedWidth;
}

/** Test-only: clear the memoized measurement. */
export function _resetNativeScrollbarWidthForTests(): void {
  cachedWidth = null;
}
