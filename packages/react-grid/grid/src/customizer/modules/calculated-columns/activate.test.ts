import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExpressionEngine } from '@wellsfargo-starui/engine';
import { calculatedColumnsModule } from './index.js';
import type { AllRowsEntry } from './virtualColumn.js';

/**
 * Contract under test: the per-flush forced `refreshCells` over the
 * virtual columns must (a) run ONLY when some virtual column calls an
 * aggregate function — row-local columns ride AG-Grid's own change
 * detection — and (b) coalesce any number of same-frame flushes into a
 * single repaint. Snapshot invalidation stays synchronous either way.
 */

type VirtualCol = { colId: string; headerName: string; expression: string };

function makeHarness(virtualColumns: VirtualCol[]) {
  const refreshCells = vi.fn();
  const api = { refreshCells };
  const listeners = new Map<string, () => void>();
  const cache = new WeakMap<object, AllRowsEntry>();
  const engine = new ExpressionEngine();

  const platform = {
    api: {
      api,
      on: (event: string, cb: () => void) => {
        listeners.set(event, cb);
        return () => listeners.delete(event);
      },
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
  return { refreshCells, cache, api, fire, dispose };
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
    expect(refreshCells).toHaveBeenCalledWith({ columns: ['net', 'total'], force: true });
    dispose();
  });

  it('invalidates the allRows snapshot synchronously on every flush', () => {
    const { cache, api, fire, dispose } = makeHarness([
      { colId: 'net', headerName: 'Net', expression: '[price] * [qty]' },
    ]);
    const entry: AllRowsEntry = {
      rows: [{ price: 1 }],
      columnArrays: new Map([['price', [1]]]),
    };
    cache.set(api, entry);
    fire();
    expect(entry.rows).toEqual([]);
    expect(entry.columnArrays.size).toBe(0);
    dispose();
  });

  it('does nothing with zero virtual columns', () => {
    const { refreshCells, fire, dispose } = makeHarness([]);
    fire();
    flushFrame();
    expect(refreshCells).not.toHaveBeenCalled();
    dispose();
  });
});
