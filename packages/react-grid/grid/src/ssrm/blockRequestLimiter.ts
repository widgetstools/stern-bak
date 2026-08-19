/**
 * Hard cap on how many SSRM block requests actually dispatch per second,
 * regardless of how many times AG Grid's own row model decides it wants one.
 *
 * `blockLoadDebounceMillis` (an AG Grid grid option, set alongside this on
 * `MarketsGridSsrmSurface`) is a DEBOUNCE, not a rate limiter: it waits for
 * scrolling to go quiet before checking what blocks are needed, which means
 * it can either starve to zero (checks keep arriving faster than the debounce
 * window resets) or, once things DO go quiet, still fire in a burst — it
 * bounds nothing about steady-state throughput. This is a real sliding-window
 * limiter sitting at the single choke point every block request already
 * passes through (`createSsrmDatasource`'s `getRows`), so the cap holds
 * regardless of what's driving the requests — held-key repeat, scrollbar
 * drag, wheel scrolling, or AG Grid's own internal re-checks.
 *
 * Excess requests are QUEUED, never dropped: AG Grid expects every block it
 * asked for to eventually resolve via `params.success`/`params.fail`, and a
 * scrolled-past block still gets real data once its turn comes rather than
 * leaving a row permanently blank.
 */
export interface BlockRequestLimiter {
  /** Run `task` now if under the cap, otherwise queue it for the next open slot. */
  schedule(task: () => void): void;
}

export function createBlockRequestLimiter(maxPerSecond: number): BlockRequestLimiter {
  const windowMs = 1000;
  let dispatchedAt: number[] = [];
  const queue: Array<() => void> = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const pump = () => {
    timer = null;
    const now = Date.now();
    dispatchedAt = dispatchedAt.filter((t) => now - t < windowMs);
    while (queue.length > 0 && dispatchedAt.length < maxPerSecond) {
      dispatchedAt.push(now);
      queue.shift()!();
    }
    if (queue.length > 0) {
      const oldest = dispatchedAt[0] ?? now;
      timer = setTimeout(pump, Math.max(1, windowMs - (now - oldest)));
    }
  };

  return {
    schedule(task) {
      queue.push(task);
      if (timer == null) pump();
    },
  };
}
