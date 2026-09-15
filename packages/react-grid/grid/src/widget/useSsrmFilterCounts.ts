/**
 * Saved-filter pill counts for the server-side row model.
 *
 * The CSRM badge counts by walking row nodes. Under SSRM the grid only holds
 * the blocks it has loaded, so that walk reports how many LOADED rows match —
 * a number that changes as you scroll and jumps to the block size the moment
 * the pill goes active (every loaded row then matches by construction). It
 * looks like a row count and isn't one.
 *
 * So the count comes from the engine instead, which holds the whole dataset.
 * Each pill is one `getRowCount` call against its own filter model — pills
 * ignore each other, matching the CSRM badge, which counts against the full
 * dataset rather than the currently-filtered view.
 *
 * The feed is live, so the counts are polled rather than pushed: recomputing
 * on every stream tick would mean N view opens per tick in the WASM hub.
 */
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { SavedFilter } from './types';

/** Matched row count for one pill's filter model. */
export type SsrmRowCounter = (filterModel: Record<string, unknown>) => Promise<number>;

const SsrmRowCountContext = createContext<SsrmRowCounter | null>(null);

export const SsrmRowCountProvider = SsrmRowCountContext.Provider;

/** The counter when the grid is server-side, `null` under CSRM. */
export function useSsrmRowCounter(): SsrmRowCounter | null {
  return useContext(SsrmRowCountContext);
}

/**
 * Subscribe to "the engine may have moved" — provider ticks and refreshes.
 * When provided, the badge poll below runs only after one fired since the
 * last read, so an idle blotter costs zero counting RPCs. Without it the
 * poll runs on the plain cadence (the pre-gating behaviour).
 */
export type SsrmTickSubscribe = (handler: () => void) => () => void;

const SsrmTickContext = createContext<SsrmTickSubscribe | null>(null);

export const SsrmTickProvider = SsrmTickContext.Provider;

/** The tick subscription when the grid is server-side, `null` under CSRM. */
export function useSsrmTickSubscribe(): SsrmTickSubscribe | null {
  return useContext(SsrmTickContext);
}

/**
 * How often to re-read the counts. Fast enough to feel live on a streaming
 * blotter, slow enough that N pills don't open N views per publish window.
 */
export const SSRM_COUNT_REFRESH_MS = 1000;

function countsEqual(a: Record<string, number>, b: Record<string, number>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}

/**
 * Per-pill counts read from the engine. Returns `{}` when `counter` is null
 * (CSRM — the client-side walk owns the badges) or there are no pills.
 */
export function useSsrmFilterCounts(
  filters: readonly SavedFilter[],
  counter: SsrmRowCounter | null,
): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const countsRef = useRef<Record<string, number>>({});
  const subscribeTicks = useSsrmTickSubscribe();

  // Restart polling when the pills change, not when the caller happens to hand
  // over a fresh array. Keying on identity would re-arm the interval on every
  // render — and each refresh re-renders, so the poll would run flat out.
  const signature = JSON.stringify(filters.map((f) => [f.id, f.filterModel]));

  // Declared first so it lands before the polling effect below reads it.
  const filtersRef = useRef(filters);
  useEffect(() => { filtersRef.current = filters; }, [filters]);

  useEffect(() => {
    const pills = filtersRef.current;
    if (!counter || pills.length === 0) {
      if (Object.keys(countsRef.current).length > 0) {
        countsRef.current = {};
        setCounts({});
      }
      return;
    }

    let alive = true;
    let inFlight = false;

    const refresh = async (): Promise<void> => {
      // A query slower than the interval must not stack up behind itself.
      if (inFlight) return;
      inFlight = true;
      try {
        const entries = await Promise.all(pills.map(async (f) => {
          try {
            return [f.id, await counter(f.filterModel)] as const;
          } catch {
            // Keep the last known value rather than flashing 0 on a
            // transient worker error.
            return [f.id, countsRef.current[f.id] ?? 0] as const;
          }
        }));
        if (!alive) return;
        const next = Object.fromEntries(entries) as Record<string, number>;
        if (countsEqual(countsRef.current, next)) return;
        countsRef.current = next;
        setCounts(next);
      } finally {
        inFlight = false;
      }
    };

    // With a tick source, the cadence poll only fires after the engine
    // actually moved — an idle blotter's pills cost zero RPCs. The initial
    // read (and every pills change, via this effect's deps) is immediate.
    let tickDirty = !subscribeTicks;
    const offTicks = subscribeTicks?.(() => { tickDirty = true; });

    void refresh();
    const timer = setInterval(() => {
      if (subscribeTicks) {
        if (!tickDirty) return;
        tickDirty = false;
      }
      void refresh();
    }, SSRM_COUNT_REFRESH_MS);
    return () => {
      alive = false;
      offTicks?.();
      clearInterval(timer);
    };
  }, [counter, signature, subscribeTicks]);

  return counts;
}
