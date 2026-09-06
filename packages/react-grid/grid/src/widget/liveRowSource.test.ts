import { describe, expect, it, vi } from 'vitest';
import { createLiveRowSource, type LiveRowSource } from './liveRowSource.js';

type Handler = (rows: readonly Record<string, unknown>[]) => void;

/** Drives a source the way a provider would, without one. */
function harness(opts: { keyed?: boolean; initial?: Record<string, unknown>[] } = {}) {
  let snapshot: Handler = () => {};
  let tick: Handler = () => {};
  const offSnapshot = vi.fn();
  const offTick = vi.fn();
  const source = createLiveRowSource({
    onSnapshot: (h) => { snapshot = h; return offSnapshot; },
    onTick: (h) => { tick = h; return offTick; },
    keyOf: opts.keyed === false ? undefined : (row) => (row.id === undefined ? null : String(row.id)),
    initial: opts.initial,
  });
  return {
    source,
    offSnapshot,
    offTick,
    sendSnapshot: (rows: Record<string, unknown>[]) => snapshot(rows),
    sendTick: (rows: Record<string, unknown>[]) => tick(rows),
  };
}

describe('createLiveRowSource', () => {
  /**
   * The contract the whole optimisation rests on: readers hold the array by
   * reference and pair it with the version. If a tick reallocated, every
   * widget would re-render on every tick again.
   */
  it('keeps ONE array identity across snapshots and ticks', () => {
    const h = harness();
    const first = h.source.getRows();
    h.sendSnapshot([{ id: 'a', v: 1 }]);
    h.sendTick([{ id: 'a', v: 2 }]);
    h.sendSnapshot([{ id: 'b', v: 3 }]);
    expect(h.source.getRows()).toBe(first);
  });

  it('bumps the version only when content changes', () => {
    const h = harness();
    expect(h.source.getVersion()).toBe(0);
    h.sendSnapshot([{ id: 'a' }]);
    expect(h.source.getVersion()).toBe(1);
    // An empty tick is not a change.
    h.sendTick([]);
    expect(h.source.getVersion()).toBe(1);
    h.sendTick([{ id: 'a', v: 1 }]);
    expect(h.source.getVersion()).toBe(2);
  });

  it('replaces the whole set on a snapshot', () => {
    const h = harness();
    h.sendSnapshot([{ id: 'a' }, { id: 'b' }]);
    h.sendSnapshot([{ id: 'c' }]);
    expect(h.source.getRows()).toEqual([{ id: 'c' }]);
  });

  it('updates a known row in place rather than appending', () => {
    const h = harness();
    h.sendSnapshot([{ id: 'a', v: 1 }, { id: 'b', v: 1 }]);
    h.sendTick([{ id: 'a', v: 99 }]);
    expect(h.source.getRows()).toEqual([{ id: 'a', v: 99 }, { id: 'b', v: 1 }]);
  });

  it('appends a row it has not seen before', () => {
    const h = harness();
    h.sendSnapshot([{ id: 'a' }]);
    h.sendTick([{ id: 'c', v: 1 }]);
    expect(h.source.getRows()).toHaveLength(2);
    expect(h.source.getRows()[1]).toEqual({ id: 'c', v: 1 });
  });

  it('re-indexes after a snapshot so later ticks still land in place', () => {
    const h = harness();
    h.sendSnapshot([{ id: 'a', v: 1 }, { id: 'b', v: 1 }]);
    h.sendSnapshot([{ id: 'b', v: 2 }]);
    h.sendTick([{ id: 'b', v: 3 }]);
    expect(h.source.getRows()).toEqual([{ id: 'b', v: 3 }]);
  });

  it('seeds from rows the provider already had', () => {
    const h = harness({ initial: [{ id: 'a', v: 1 }] });
    expect(h.source.getRows()).toEqual([{ id: 'a', v: 1 }]);
    // Seeded rows are indexed, so the first tick updates rather than appends.
    h.sendTick([{ id: 'a', v: 2 }]);
    expect(h.source.getRows()).toEqual([{ id: 'a', v: 2 }]);
  });

  it('skips rows whose key cannot be resolved', () => {
    const h = harness();
    h.sendSnapshot([{ id: 'a' }]);
    h.sendTick([{ noId: true }]);
    expect(h.source.getRows()).toEqual([{ id: 'a' }]);
  });

  /**
   * Without row identity, the only correct reading of a tick is a replace —
   * guessing which row moved would be silently wrong.
   */
  it('treats a tick as a replace when there is no key', () => {
    const h = harness({ keyed: false });
    h.sendSnapshot([{ id: 'a' }, { id: 'b' }]);
    h.sendTick([{ id: 'c' }]);
    expect(h.source.getRows()).toEqual([{ id: 'c' }]);
  });

  describe('subscribers', () => {
    it('notifies on change and stops after unsubscribe', () => {
      const h = harness();
      const fn = vi.fn();
      const off = h.source.subscribe(fn);
      h.sendSnapshot([{ id: 'a' }]);
      expect(fn).toHaveBeenCalledTimes(1);
      off();
      h.sendTick([{ id: 'a', v: 1 }]);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    /** One bad widget must not stop the others, or break the provider's emit. */
    it('keeps notifying siblings when one subscriber throws', () => {
      const h = harness();
      const good = vi.fn();
      h.source.subscribe(() => { throw new Error('boom'); });
      h.source.subscribe(good);
      expect(() => h.sendSnapshot([{ id: 'a' }])).not.toThrow();
      expect(good).toHaveBeenCalledTimes(1);
    });
  });

  describe('dispose', () => {
    it('detaches from the provider', () => {
      const h = harness();
      h.source.dispose();
      expect(h.offSnapshot).toHaveBeenCalled();
      expect(h.offTick).toHaveBeenCalled();
    });

    /** A closed blotter must not pin a 20k-row snapshot. */
    it('releases the rows it was holding', () => {
      const h = harness();
      h.sendSnapshot([{ id: 'a' }, { id: 'b' }]);
      h.source.dispose();
      expect(h.source.getRows()).toHaveLength(0);
    });

    it('stops notifying after disposal', () => {
      const h = harness();
      const fn = vi.fn();
      h.source.subscribe(fn);
      h.source.dispose();
      h.sendSnapshot([{ id: 'a' }]);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  it('satisfies the LiveRowSource contract', () => {
    const source: LiveRowSource = harness().source;
    expect(typeof source.getRows).toBe('function');
    expect(typeof source.getVersion).toBe('function');
    expect(typeof source.subscribe).toBe('function');
  });
});

/**
 * The failure that produced an empty blotter window.
 *
 * `createLiveRowSource` ATTACHES to the provider as it is constructed. That
 * made construction a side effect, and it was originally called from a
 * `useMemo` — so a provider that threw while connecting threw during render,
 * unmounting the whole subtree and leaving a window with no grid in it. Both
 * call sites now build it in an effect and catch.
 *
 * A stubbed provider never throws, which is exactly why the tests above missed
 * it; this one makes the throwing case explicit.
 */
describe('a provider that throws while attaching', () => {
  it('propagates, so the caller can catch it instead of rendering nothing', () => {
    expect(() =>
      createLiveRowSource({
        onSnapshot: () => { throw new Error('not connected'); },
        onTick: () => () => {},
      }),
    ).toThrow(/not connected/);
  });

  it('does not leave a tick subscription attached when the snapshot attach fails', () => {
    const offTick = vi.fn();
    let attached = false;
    try {
      createLiveRowSource({
        // Attach order matters: snapshot first, so a throw here means tick was
        // never attached and there is nothing to leak.
        onSnapshot: () => { throw new Error('boom'); },
        onTick: () => { attached = true; return offTick; },
      });
    } catch {
      /* expected */
    }
    expect(attached).toBe(false);
  });
});
