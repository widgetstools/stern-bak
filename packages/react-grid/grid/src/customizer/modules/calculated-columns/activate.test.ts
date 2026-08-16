import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpressionEngine } from '@wellsfargo-starui/core';
import { calculatedColumnsModule } from './index.js';
import type { AllRowsEntry } from '@wellsfargo-starui/core';

/**
 * Contract under test: the per-flush forced `refreshCells` over the
 * virtual columns must (a) run ONLY when some virtual column calls an
 * aggregate function — row-local columns ride AG-Grid's own change
 * detection — and (b) coalesce any number of same-frame flushes into a
 * single repaint. The snapshot refill runs on the data event either way.
 */

type VirtualCol = { colId: string; headerName: string; expression: string };

interface HarnessOptions {
  /** The port's answer to "do the ids I can walk span the dataset". False is
   *  a server-side grid: walking there would page the whole dataset across
   *  `postMessage` to rebuild a snapshot the source has already folded. */
  canAddressUnloadedRows?: boolean;
  /** Rows the port hands to the visitor, and whether it covered the scope. */
  rows?: Record<string, unknown>[];
  complete?: boolean;
}

function makeHarness(virtualColumns: VirtualCol[], options: HarnessOptions = {}) {
  const {
    canAddressUnloadedRows = true,
    rows = [{ price: 1, notional: 10 }, { price: 2, notional: 20 }],
    complete = true,
  } = options;
  const refreshCells = vi.fn();
  const api = { refreshCells };
  const listeners = new Map<string, () => void>();
  const readyHandlers: Array<() => void> = [];
  const cache = new WeakMap<object, AllRowsEntry>();
  const engine = new ExpressionEngine();

  // Mirrors CsrmDataAdapter: `scan` is async by signature but visits every
  // row synchronously inside the call. The module depends on that — it is
  // what keeps the first paint of an aggregate cell correct.
  const scan = vi.fn(async (visit: (row: { id: string; data: Record<string, unknown> }) => unknown) => {
    let scanned = 0;
    for (const data of rows) {
      scanned += 1;
      if (visit({ id: String(scanned), data }) === false) break;
    }
    return { scanned, stopped: false, complete };
  });

  const platform = {
    api: {
      api,
      onReady: (cb: () => void) => {
        readyHandlers.push(cb);
        return () => {};
      },
      on: (event: string, cb: () => void) => {
        listeners.set(event, cb);
        return () => listeners.delete(event);
      },
    },
    data: {
      capabilities: {
        canAddressUnloadedRows: { supported: canAddressUnloadedRows, reason: '' },
      },
      scan,
    },
    getState: () => ({ virtualColumns }),
    resources: {
      cache: () => cache,
      expression: () => engine,
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispose = calculatedColumnsModule.activate!(platform as any);
  const fire = (event = 'rowDataUpdated') => listeners.get(event)?.();
  return { refreshCells, cache, api, fire, dispose, scan, readyHandlers };
}

describe('calculatedColumnsModule.activate — refresh gating + coalescing', () => {
  let rafCallbacks: FrameRequestCallback[];

  beforeEach(() => {
    rafCallbacks = [];
    vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });
  afterEach(() => vi.unstubAllGlobals());

  const flushFrame = () => {
    const cbs = rafCallbacks.splice(0);
    cbs.forEach((cb) => cb(0));
  };

  it('row-local virtual columns never trigger a forced refresh', () => {
    const { refreshCells, fire, dispose } = makeHarness([
      { colId: 'net', headerName: 'Net', expression: '[price] * [qty]' },
    ]);
    fire();
    flushFrame();
    expect(refreshCells).not.toHaveBeenCalled();
    dispose();
  });

  it('aggregate virtual columns refresh once per frame, not once per flush', () => {
    const { refreshCells, fire, dispose } = makeHarness([
      { colId: 'net', headerName: 'Net', expression: '[price] * [qty]' },
      { colId: 'total', headerName: 'Total', expression: 'SUM([notional])' },
    ]);
    fire('rowDataUpdated');
    fire('cellValueChanged');
    fire('rowDataUpdated');
    expect(refreshCells).not.toHaveBeenCalled(); // deferred to the frame
    flushFrame();
    expect(refreshCells).toHaveBeenCalledTimes(1);
    // suppressFlash: true — force:true alone would flash every virtual
    // column cell's native "value changed" animation on every recompute,
    // even when the computed value is unchanged.
    expect(refreshCells).toHaveBeenCalledWith({
      columns: ['net', 'total'],
      force: true,
      suppressFlash: true,
    });
    dispose();
  });

  it('refills the allRows snapshot through the port, in time for the same tick', () => {
    const { cache, api, fire, dispose, scan } = makeHarness([
      { colId: 'total', headerName: 'Total', expression: 'SUM([notional])' },
    ]);
    const entry: AllRowsEntry = {
      rows: [{ price: 999 }],
      columnArrays: new Map([['price', [999]]]),
      aggregates: new Map(),
    };
    cache.set(api, entry);
    fire();
    // No await: a port holding every row visits synchronously, so the fresh
    // rows are readable by anything that runs before the frame — a sort, a
    // filter, an export, or the very first paint.
    expect(scan).toHaveBeenCalledTimes(1);
    expect(cache.get(api)?.rows).toEqual([{ price: 1, notional: 10 }, { price: 2, notional: 20 }]);
    expect(cache.get(api)?.columnArrays.size).toBe(0);
    dispose();
  });

  it('restores the previous snapshot when the port could not cover the scope', async () => {
    const { cache, api, fire, dispose } = makeHarness(
      [{ colId: 'total', headerName: 'Total', expression: 'SUM([notional])' }],
      { complete: false },
    );
    const previous = [{ price: 999, notional: 999 }];
    cache.set(api, { rows: previous, columnArrays: new Map(), aggregates: new Map() });
    fire();
    await Promise.resolve();
    await Promise.resolve();
    // An older total is not the defect; a total of a partial walk is.
    expect(cache.get(api)?.rows).toBe(previous);
    dispose();
  });

  it('does not page an unreachable dataset — the source has already folded it', () => {
    const { fire, dispose, scan } = makeHarness(
      [{ colId: 'total', headerName: 'Total', expression: 'SUM([notional])' }],
      { canAddressUnloadedRows: false },
    );
    fire();
    expect(scan).not.toHaveBeenCalled();
    dispose();
  });

  it('refills once the grid is ready, before any data event arrives', () => {
    const { readyHandlers, scan, dispose } = makeHarness([
      { colId: 'total', headerName: 'Total', expression: 'SUM([notional])' },
    ]);
    expect(scan).not.toHaveBeenCalled();
    readyHandlers.forEach((fn) => fn());
    expect(scan).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('never walks for a row-local column — those ride AG-Grid change detection', () => {
    const { fire, dispose, scan } = makeHarness([
      { colId: 'net', headerName: 'Net', expression: '[price] * [qty]' },
    ]);
    fire();
    expect(scan).not.toHaveBeenCalled();
    dispose();
  });

  it('clears the snapshot on dispose', () => {
    const { cache, api, fire, dispose } = makeHarness([
      { colId: 'total', headerName: 'Total', expression: 'SUM([notional])' },
    ]);
    fire();
    expect(cache.get(api)?.rows.length).toBe(2);
    dispose();
    expect(cache.get(api)?.rows).toEqual([]);
  });

  it('does nothing with zero virtual columns', () => {
    const { refreshCells, fire, dispose } = makeHarness([]);
    fire();
    flushFrame();
    expect(refreshCells).not.toHaveBeenCalled();
    dispose();
  });

  it('swallows parse errors when detecting aggregate columns', () => {
    const { refreshCells, fire, dispose } = makeHarness([
      { colId: 'bad', headerName: 'Bad', expression: '[[[invalid' },
    ]);
    fire();
    flushFrame();
    expect(refreshCells).not.toHaveBeenCalled();
    dispose();
  });

  it('falls back to setTimeout when requestAnimationFrame is unavailable', () => {
    vi.useFakeTimers();
    vi.unstubAllGlobals();
    vi.stubGlobal('requestAnimationFrame', undefined);
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const { refreshCells, fire, dispose } = makeHarness([
      { colId: 'total', headerName: 'Total', expression: 'SUM([notional])' },
    ]);
    fire();
    expect(setTimeoutSpy).toHaveBeenCalled();
    vi.runAllTimers();
    expect(refreshCells).toHaveBeenCalled();
    dispose();
    setTimeoutSpy.mockRestore();
    vi.useRealTimers();
  });

  it('cancels pending rAF on dispose', () => {
    const cancel = vi.fn();
    vi.stubGlobal('cancelAnimationFrame', cancel);
    const { fire, dispose } = makeHarness([
      { colId: 'total', headerName: 'Total', expression: 'SUM([notional])' },
    ]);
    fire();
    dispose();
    expect(cancel).toHaveBeenCalled();
  });

  it('no-ops refresh when api is detached', () => {
    const refreshCells = vi.fn();
    const listeners = new Map<string, () => void>();
    const platform = {
      api: {
        api: null,
        onReady: () => () => {},
        on: (event: string, cb: () => void) => {
          listeners.set(event, cb);
          return () => listeners.delete(event);
        },
      },
      data: {
        capabilities: { canAddressUnloadedRows: { supported: true, reason: '' } },
        scan: async () => ({ scanned: 0, stopped: false, complete: true }),
      },
      getState: () => ({
        virtualColumns: [{ colId: 'total', headerName: 'Total', expression: 'SUM([x])' }],
      }),
      resources: {
        cache: () => new WeakMap(),
        expression: () => new ExpressionEngine(),
      },
    };
    const dispose = calculatedColumnsModule.activate!(platform as never);
    listeners.get('rowDataUpdated')?.();
    flushFrame();
    expect(refreshCells).not.toHaveBeenCalled();
    dispose();
  });
});
