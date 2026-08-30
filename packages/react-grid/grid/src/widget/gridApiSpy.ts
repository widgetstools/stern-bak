/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * gridApiSpy — dev-only instrumentation that answers "what are the layers
 * above AG Grid actually doing to it, and how often?"
 *
 * When armed, wraps the mutating/scanning `GridApi` methods with counters
 * (call count + cumulative self-time, `setGridOption` broken down per key)
 * and counts every grid event via `addGlobalListener`. The tallies are
 * exposed on `window.__gridSpy` so a console or automation harness can
 * read them:
 *
 *   __gridSpy.report()  → { sinceMs, calls: {...}, events: {...} } sorted
 *                         by count, descending
 *   __gridSpy.reset()   → zero the tallies (start of a measurement window)
 *
 * Inert by default. Two ways to arm, mirroring the `nofeed` hook in
 * `useProviderDataWiring`:
 *   • `?gridspy` in the window's query string (before the `#` on hash routes)
 *   • `localStorage['starui:gridApiSpy'] = '1'` + reload
 *
 * Diagnostic use: a healthy streaming blotter shows ~N `modelUpdated`
 * events per second (one per async-transaction flush) and near-zero
 * everything else while idle. Recurring `setGridOption:columnDefs`,
 * `gridColumnsChanged`, `displayedColumnsChanged`, `filterChanged`, or
 * forced `refreshCells` at idle mean an upper layer is re-evaluating the
 * whole grid — exactly the class of bug this spy exists to catch.
 */
import type { GridApi } from 'ag-grid-community';

const ARM_STORAGE_KEY = 'starui:gridApiSpy';

/** Methods whose invocation frequency/cost we want on the scoreboard. */
const WRAPPED_METHODS = [
  'setGridOption',
  'updateGridOptions',
  'refreshCells',
  'redrawRows',
  'refreshHeader',
  'onFilterChanged',
  'setFilterModel',
  'applyColumnState',
  'applyTransaction',
  'applyTransactionAsync',
  'flushAsyncTransactions',
  'forEachNode',
  'forEachNodeAfterFilterAndSort',
  'forEachLeafNode',
  'getColumnState',
  'getColumnDefs',
  'ensureIndexVisible',
  'ensureColumnVisible',
  'autoSizeColumns',
  'sizeColumnsToFit',
  'resetRowHeights',
  'refreshClientSideRowModel',
  'getRenderedNodes',
] as const;

interface Tally {
  count: number;
  totalMs: number;
}

interface GridSpy {
  calls: Map<string, Tally>;
  events: Map<string, number>;
  startedAt: number;
  /** Live GridApi of the most recently spied grid — lets a console /
   *  harness read live options (`__gridSpy.api.getGridOption(...)`). */
  api?: GridApi;
  reset(): void;
  report(): { sinceMs: number; calls: Record<string, string>; events: Record<string, number> };
}

function isArmed(): boolean {
  try {
    if (typeof location !== 'undefined' && /[?&]gridspy\b/.test(location.search)) return true;
    return typeof localStorage !== 'undefined' && localStorage.getItem(ARM_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function getOrCreateSpy(): GridSpy {
  const w = globalThis as any;
  if (w.__gridSpy) return w.__gridSpy as GridSpy;
  const spy: GridSpy = {
    calls: new Map(),
    events: new Map(),
    startedAt: performance.now(),
    reset() {
      spy.calls.clear();
      spy.events.clear();
      spy.startedAt = performance.now();
    },
    report() {
      const calls: Record<string, string> = {};
      for (const [k, t] of [...spy.calls.entries()].sort((a, b) => b[1].count - a[1].count)) {
        calls[k] = `${t.count}x ${t.totalMs.toFixed(0)}ms`;
      }
      const events: Record<string, number> = {};
      for (const [k, n] of [...spy.events.entries()].sort((a, b) => b[1] - a[1])) {
        events[k] = n;
      }
      return { sinceMs: Math.round(performance.now() - spy.startedAt), calls, events };
    },
  };
  w.__gridSpy = spy;
  return spy;
}

function bump(map: Map<string, Tally>, key: string, ms: number): void {
  const t = map.get(key);
  if (t) {
    t.count += 1;
    t.totalMs += ms;
  } else {
    map.set(key, { count: 1, totalMs: ms });
  }
}

/**
 * Install the spy on a live GridApi. No-op unless armed (see module doc).
 * Multiple grids in one window share the scoreboard — per-grid split has
 * not been needed yet; add a prefix here if it ever is.
 */
export function installGridApiSpy(api: GridApi): void {
  if (!isArmed()) return;
  const target = api as any;
  if (target.__gridSpyInstalled) return;
  target.__gridSpyInstalled = true;

  const spy = getOrCreateSpy();
  spy.api = api;

  for (const name of WRAPPED_METHODS) {
    const original = target[name];
    if (typeof original !== 'function') continue;
    target[name] = function spied(...args: unknown[]) {
      // Per-key breakdown for option pushes — 'setGridOption:columnDefs'
      // is the classic whole-grid re-evaluation trigger and must be
      // distinguishable from a cheap 'setGridOption:quickFilterText'.
      const key =
        name === 'setGridOption' && typeof args[0] === 'string'
          ? `setGridOption:${args[0]}`
          : name;
      const t0 = performance.now();
      try {
        return original.apply(this, args);
      } finally {
        bump(spy.calls, key, performance.now() - t0);
      }
    };
  }

  try {
    api.addGlobalListener((eventType: string) => {
      spy.events.set(eventType, (spy.events.get(eventType) ?? 0) + 1);
    });
  } catch {
    /* grid mid-teardown — method counters still work */
  }

  // eslint-disable-next-line no-console
  console.warn(
    '[gridApiSpy] ARMED — grid API calls and events are being counted. ' +
      'Read window.__gridSpy.report(); disarm by removing ?gridspy / ' +
      `localStorage '${ARM_STORAGE_KEY}' and reloading.`,
  );
}
