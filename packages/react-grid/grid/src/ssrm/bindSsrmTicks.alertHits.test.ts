/**
 * The dedupe, which is the whole reason this lives in the tick binding.
 *
 * A hit on a row the grid HOLDS must not be forwarded: that row arrives in the
 * same tick as a transaction, and the platform's own row-change delta
 * evaluates it against this session's baselines. Forwarding it too would count
 * every visible hit twice. What is left is exactly what the bell was missing.
 */
import { describe, expect, it, vi } from 'vitest';
import { bindSsrmTicks } from './bindSsrmTicks.js';

type TickHandler = (payload: {
  event: { type: string; keys?: string[]; columns?: string[]; rows?: unknown[] };
  interestedKeys: string[];
  alerts?: ReadonlyArray<{ key: string; ruleId: string }>;
}) => void;

/** `held` is the set of row keys this grid has loaded. */
function harness(held: string[] = []) {
  let tick: TickHandler | null = null;
  const heldSet = new Set(held);
  const provider = {
    onSsrmTick: (h: TickHandler) => {
      tick = h;
      return () => {};
    },
    onStatus: () => () => {},
  };
  const api = {
    getRowNode: (id: string) => (heldSet.has(id) ? { id } : undefined),
    getDisplayedRowCount: () => heldSet.size,
    getRowGroupColumns: () => [],
    getColumnState: () => [],
    getColumns: () => [],
    getFilterModel: () => null,
    applyServerSideTransaction: () => ({ status: 'Applied' }),
    refreshServerSide: () => {},
    flashCells: () => {},
    isDestroyed: () => false,
  };
  const onAlertHits = vi.fn();
  const unbind = bindSsrmTicks(provider as never, api as never, {
    keyColumn: 'id',
    onAlertHits,
  });
  return {
    onAlertHits,
    unbind,
    emit: (alerts: ReadonlyArray<{ key: string; ruleId: string }> | undefined) =>
      tick?.({ event: { type: 'rows', keys: [], columns: [], rows: [] }, interestedKeys: [], alerts }),
  };
}

describe('alert hits from the plane', () => {
  it('forwards a hit on a row this grid has never loaded', () => {
    const fx = harness([]);
    fx.emit([{ key: 'far-away', ruleId: 'r1' }]);
    expect(fx.onAlertHits).toHaveBeenCalledWith([{ rowId: 'far-away', ruleId: 'r1' }]);
  });

  it('DROPS a hit on a row this grid holds — the client finds that one itself', () => {
    const fx = harness(['loaded']);
    fx.emit([{ key: 'loaded', ruleId: 'r1' }]);
    expect(fx.onAlertHits).not.toHaveBeenCalled();
  });

  it('splits a mixed batch, forwarding only the unloaded half', () => {
    const fx = harness(['loaded']);
    fx.emit([
      { key: 'loaded', ruleId: 'r1' },
      { key: 'far-away', ruleId: 'r1' },
      { key: 'also-far', ruleId: 'r2' },
    ]);
    expect(fx.onAlertHits).toHaveBeenCalledWith([
      { rowId: 'far-away', ruleId: 'r1' },
      { rowId: 'also-far', ruleId: 'r2' },
    ]);
  });

  it('says nothing when the tick carries no alerts', () => {
    const fx = harness([]);
    fx.emit(undefined);
    fx.emit([]);
    expect(fx.onAlertHits).not.toHaveBeenCalled();
  });

  it('says nothing when every hit is on a held row', () => {
    const fx = harness(['a', 'b']);
    fx.emit([{ key: 'a', ruleId: 'r1' }, { key: 'b', ruleId: 'r1' }]);
    expect(fx.onAlertHits).not.toHaveBeenCalled();
  });

  it('treats a grid mid-teardown as not holding the row rather than losing the hit', () => {
    let tick: TickHandler | null = null;
    const onAlertHits = vi.fn();
    bindSsrmTicks(
      {
        onSsrmTick: (h: TickHandler) => {
          tick = h;
          return () => {};
        },
        onStatus: () => () => {},
      } as never,
      {
        getRowNode: () => {
          throw new Error('destroyed');
        },
        getDisplayedRowCount: () => 0,
        getRowGroupColumns: () => [],
        getFilterModel: () => null,
        isDestroyed: () => false,
      } as never,
      { keyColumn: 'id', onAlertHits },
    );
    tick?.({ event: { type: 'rows', keys: [], rows: [] }, interestedKeys: [], alerts: [{ key: 'x', ruleId: 'r1' }] });
    expect(onAlertHits).toHaveBeenCalledWith([{ rowId: 'x', ruleId: 'r1' }]);
  });
});
