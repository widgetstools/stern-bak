/**
 * bufferedDispatch — wrap a fanout sink with conflate-by-key and/or
 * trailing-edge throttle.
 *
 * Two knobs, both optional:
 *   • conflateKeyFn — when set, the buffer is keyed by `conflateKeyFn(row)`.
 *     A second update for the same key within the same throttle window
 *     replaces the first (last-write-wins upsert). Maps cleanly onto
 *     AG-Grid's `applyTransactionAsync({ update })`. Rows whose key
 *     resolves to `null`/`undefined` are kept un-conflated (appended).
 *   • throttleMs   — flush window in milliseconds. 0 / undefined →
 *     immediate flush (effectively a passthrough). When set, calls fill
 *     the buffer; a single timer scheduled on the first call of each
 *     window flushes everything at the trailing edge.
 *
 * Restored from the v1 data-plane fanout (commit 76c5113c); generalised
 * from `conflateByKey: string` to a key function so composite-key
 * providers can conflate via `composeRowId(row, keyColumn)`.
 *
 * The buffer is intentionally NOT bounded — we trust the throttle window
 * to keep memory in check. If a producer fires faster than conflation
 * can collapse, the buffer grows; that's a sign throttleMs is too high
 * for the data rate.
 */

export interface BufferedDispatchOpts<TRow> {
  /** Resolve a row's conflation key. Omit to disable conflation (order-preserving). */
  conflateKeyFn?: (row: TRow) => unknown;
  throttleMs?: number;
  /** Receives the flushed batch. Called with at least one row. */
  flush: (rows: TRow[]) => void;
  /** Optional clock injection for tests. Defaults to global setTimeout/clearTimeout. */
  setTimer?: (cb: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface BufferedDispatchHandle<TRow> {
  /** Push rows into the buffer. Triggers an immediate flush if no throttle is set. */
  push: (rows: readonly TRow[]) => void;
  /** Force-flush any pending rows now. */
  flushNow: () => void;
  /** Cancel any pending flush + drop the buffer. Idempotent. */
  teardown: () => void;
}

export function bufferedDispatch<TRow>(
  opts: BufferedDispatchOpts<TRow>,
): BufferedDispatchHandle<TRow> {
  const { conflateKeyFn, throttleMs, flush } = opts;
  const setTimer = opts.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));

  // Conflated mode keeps a Map keyed by conflateKeyFn(row); non-conflated
  // mode keeps an ordered list. Rows with a null/undefined key (or no
  // conflation at all) fall back to the ordered list.
  const conflated = typeof conflateKeyFn === 'function';
  const map = conflated ? new Map<unknown, TRow>() : null;
  const list: TRow[] = [];

  let timer: unknown = null;

  const drainAndFlush = (): void => {
    const payload: TRow[] = conflated && map ? [...map.values(), ...list] : [...list];
    if (payload.length === 0) return;
    if (map) map.clear();
    list.length = 0;
    flush(payload);
  };

  const scheduleFlush = (): void => {
    if (timer != null) return;
    timer = setTimer(() => {
      timer = null;
      drainAndFlush();
    }, throttleMs ?? 0);
  };

  const push = (rows: readonly TRow[]): void => {
    if (rows.length === 0) return;

    if (!throttleMs) {
      // Immediate-mode fast path: skip buffering entirely.
      flush([...rows]);
      return;
    }

    if (conflated && map && conflateKeyFn) {
      for (const row of rows) {
        const key = conflateKeyFn(row);
        // null/undefined keys can't be conflated — keep them in order.
        if (key == null) list.push(row);
        else map.set(key, row); // last write wins (upsert)
      }
    } else {
      // Indexed push — arg-spread copies the batch onto the call stack
      // and overflows past ~65k rows.
      for (let i = 0; i < rows.length; i++) list.push(rows[i]);
    }
    scheduleFlush();
  };

  const flushNow = (): void => {
    if (timer != null) {
      clearTimer(timer);
      timer = null;
    }
    drainAndFlush();
  };

  const teardown = (): void => {
    if (timer != null) {
      clearTimer(timer);
      timer = null;
    }
    if (map) map.clear();
    list.length = 0;
  };

  return { push, flushNow, teardown };
}
