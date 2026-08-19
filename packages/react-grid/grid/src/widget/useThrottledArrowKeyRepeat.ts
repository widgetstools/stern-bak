import { useEffect, type RefObject } from 'react';

/** After this many ms of continuous auto-repeat, start throttling. */
const DEFAULT_HOLD_THRESHOLD_MS = 200;
/** Once throttling, let at most one repeat through per this many ms. */
const DEFAULT_THROTTLE_INTERVAL_MS = 80;

const THROTTLED_KEYS = new Set(['ArrowDown', 'ArrowUp']);

/** Is the event's target a place arrow keys mean "move a text cursor", not "navigate rows"? */
function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

/**
 * Caps how many ArrowDown/ArrowUp keydowns reach AG Grid's own native
 * keyboard handler while a key is held.
 *
 * AG Grid's default per-keydown handling runs a synchronous
 * `ensureIndexVisible` -> `redraw` -> React `flushSync` cycle — expensive
 * enough on a large SSRM grid that raw OS auto-repeat (~30-60/sec) saturates
 * the main thread under sustained holding. A custom `navigateToNextCell`
 * override that replayed navigation itself (accumulating deltas, driving
 * `setFocusedCell`/`ensureIndexVisible` manually) was tried and reverted —
 * it bypassed AG Grid's own focus/selection/scroll-pinning machinery for the
 * throttled case and produced a jumpy ring and intermittent hangs.
 *
 * This does the opposite: every event that gets through is handled by AG
 * Grid completely untouched, in `capture` phase before AG Grid's own
 * listener (attached lower in the DOM, in `RowContainerEventsFeature`) ever
 * sees it. Only the EXCESS repeat events within one held-key burst are
 * dropped (`stopPropagation` + `preventDefault`), converting a continuous
 * ~30-60/sec native repeat into discrete, evenly-spaced presses — the same
 * shape a user rapidly tapping the key by hand would produce, just faster.
 *
 * The first `holdThresholdMs` of a hold pass through unthrottled (matches
 * how a normal tap or a brief hold already feels); only a SUSTAINED hold
 * gets capped, and it self-resets on every keyup.
 */
export function useThrottledArrowKeyRepeat(
  rootRef: RefObject<HTMLElement | null>,
  holdThresholdMs: number = DEFAULT_HOLD_THRESHOLD_MS,
  throttleIntervalMs: number = DEFAULT_THROTTLE_INTERVAL_MS,
): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const holdStartedAt = new Map<string, number>();
    const lastAllowedAt = new Map<string, number>();

    const onKeyDown = (event: KeyboardEvent) => {
      if (!THROTTLED_KEYS.has(event.key) || isTextEditingTarget(event.target)) return;

      const now = Date.now();
      if (!event.repeat) {
        holdStartedAt.set(event.key, now);
        lastAllowedAt.set(event.key, now);
        return;
      }

      const heldFor = now - (holdStartedAt.get(event.key) ?? now);
      if (heldFor <= holdThresholdMs) {
        lastAllowedAt.set(event.key, now);
        return;
      }

      const sinceLastAllowed = now - (lastAllowedAt.get(event.key) ?? 0);
      if (sinceLastAllowed >= throttleIntervalMs) {
        lastAllowedAt.set(event.key, now);
        return;
      }

      event.preventDefault();
      event.stopPropagation();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      holdStartedAt.delete(event.key);
      lastAllowedAt.delete(event.key);
    };

    root.addEventListener('keydown', onKeyDown, { capture: true });
    root.addEventListener('keyup', onKeyUp, { capture: true });
    return () => {
      root.removeEventListener('keydown', onKeyDown, { capture: true });
      root.removeEventListener('keyup', onKeyUp, { capture: true });
    };
  }, [rootRef, holdThresholdMs, throttleIntervalMs]);
}
