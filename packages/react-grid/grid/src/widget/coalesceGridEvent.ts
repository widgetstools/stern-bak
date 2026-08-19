/**
 * Coalesce high-frequency grid events (key-repeat `cellFocused` is ~30/sec)
 * into at most one callback per animation frame — same pattern as
 * `useGridHost`'s store subscription.
 */
export function createRafCoalescedCallback(fn: () => void): {
  schedule: () => void;
  cancel: () => void;
} {
  let rafId = 0;
  let cancelled = false;
  return {
    schedule: () => {
      if (rafId) return;
      cancelled = false;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        if (cancelled) return;
        fn();
      });
    },
    cancel: () => {
      cancelled = true;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    },
  };
}
