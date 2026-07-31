/**
 * Background-freeze exemption for live data windows.
 *
 * Chromium freezes hidden/backgrounded pages (Page Lifecycle) — a
 * frozen page runs NO JavaScript: streaming blotters went blank on
 * inactive tabs / minimized windows until re-activated, and frozen
 * views' heartbeats stopped, so the hub evicted them and every wake
 * triggered a full-snapshot replay storm. Measured in OpenFin 43:
 * `backgroundThrottling: false` is inert at every level (manifest
 * defaults, platform-override stamping, runtime `updateOptions` —
 * accepted but never applied).
 *
 * Chromium's freeze-eligibility policy exempts pages holding a Web
 * Lock (same blocker list as active IndexedDB transactions / WebRTC).
 * Holding a never-released lock marks this page "do not freeze":
 * timers may still be throttled while hidden (grid flushes stretch —
 * fine; MessagePort delivery is not timer-gated, so data keeps
 * applying), but the page cannot be frozen into a blank shell.
 *
 * The acquisition RETRIES until the lock is actually GRANTED: a
 * one-shot request at early bootstrap can reject while the document
 * is not yet fully active (measured — the boot-time request failed
 * silently in OpenFin views while the identical request succeeded
 * seconds later), and `held` must only latch when the grant callback
 * runs, not when the request is issued. No-op where the Web Locks API
 * is unavailable.
 */

export const FREEZE_EXEMPTION_LOCK_NAME = 'starui-background-freeze-exemption';

const RETRY_DELAY_MS = 1_000;
const MAX_ATTEMPTS = 15;

let granted = false;
let started = false;

export function acquireBackgroundFreezeExemption(): void {
  if (started) return;
  if (typeof navigator === 'undefined' || !navigator.locks?.request) return;
  started = true;

  let attempts = 0;
  const tryAcquire = (): void => {
    attempts += 1;
    navigator.locks
      .request(FREEZE_EXEMPTION_LOCK_NAME, () => {
        granted = true;
        // Held for the lifetime of the document — never resolves.
        return new Promise<void>(() => {});
      })
      .catch(() => {
        // Request rejected (document not fully active yet, lock
        // manager transiently unavailable) — retry until granted.
        if (!granted && attempts < MAX_ATTEMPTS) {
          setTimeout(tryAcquire, RETRY_DELAY_MS);
        } else if (!granted) {
          // eslint-disable-next-line no-console
          console.warn(
            '[host-data] background-freeze exemption lock could not be acquired — '
            + 'this window may be frozen by Chromium while hidden',
          );
        }
      });
  };
  tryAcquire();
}

/** True once the lock grant callback has run (test/diagnostic hook). */
export function isBackgroundFreezeExemptionHeld(): boolean {
  return granted;
}

/** Test-only: reset module state. */
export function _resetBackgroundFreezeExemptionForTests(): void {
  granted = false;
  started = false;
}
