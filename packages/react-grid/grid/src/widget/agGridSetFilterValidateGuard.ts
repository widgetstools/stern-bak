/**
 * AG-Grid 35.1 bug — `SetFilterHandler.validateModel` iterates
 * `model.values` after a `model == null` early-return; an internal model
 * shape like `{ filterType: 'set' }` (no `values` key) slips past that
 * null-check and crashes with `model.values is not iterable`. The crash
 * lands inside an `AgPromise.then` callback, so it surfaces in React as
 * an "Uncaught" error and unmounts the `<AgGridReactUi>` subtree via the
 * error boundary.
 *
 * We can't reach `SetFilterHandler` directly (not in the public API), so
 * we install a window-level `error` listener that recognises this exact
 * AG-Grid bug and prevents it from propagating. The grid stays usable
 * and our own sanitisation paths continue to scrub stored models. Other
 * errors flow through unchanged.
 *
 * Idempotent — guarded by a window-scoped flag so multiple grid mounts
 * register at most one listener pair.
 */

export function installAgGridSetFilterValidateGuard(): void {
  if (typeof window === 'undefined') return;
  if ((window as Window & { __agSetFilterValidateGuard?: boolean }).__agSetFilterValidateGuard) {
    return;
  }
  (window as Window & { __agSetFilterValidateGuard?: boolean }).__agSetFilterValidateGuard = true;

  const matchesAgBug = (err: unknown): boolean => {
    if (!err) return false;
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('model.values is not iterable')) return false;
    const stack = err instanceof Error ? err.stack ?? '' : '';
    return (
      stack.includes('SetFilterHandler') ||
      stack.includes('ag-grid-enterprise') ||
      stack.includes('validateModel')
    );
  };

  window.addEventListener(
    'error',
    (event) => {
      if (matchesAgBug(event.error ?? event.message)) {
        // eslint-disable-next-line no-console
        console.warn(
          '[MarketsGrid] Swallowed AG-Grid SetFilterHandler.validateModel bug — `model.values is not iterable`. The grid stays usable; this is a known AG-Grid 35.1 issue triggered by internal multi-filter slot validation.',
        );
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true,
  );

  window.addEventListener('unhandledrejection', (event) => {
    if (matchesAgBug(event.reason)) {
      // eslint-disable-next-line no-console
      console.warn(
        '[MarketsGrid] Swallowed AG-Grid SetFilterHandler.validateModel unhandled rejection.',
      );
      event.preventDefault();
    }
  });
}
