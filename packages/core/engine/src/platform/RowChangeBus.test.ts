import { describe, it, expect } from 'vitest';
import { ApiHub } from './ApiHub';
import { RowChangeBus } from './RowChangeBus';
import type { RowChange } from './types';

/** Minimal fake GridApi that records listeners and can fire events into them. */
function makeFakeApi() {
  const listeners = new Map<string, Set<(e?: unknown) => void>>();
  const api = {
    addEventListener: (evt: string, fn: (e?: unknown) => void) => {
      let set = listeners.get(evt);
      if (!set) { set = new Set(); listeners.set(evt, set); }
      set.add(fn);
    },
    removeEventListener: (evt: string, fn: (e?: unknown) => void) => {
      listeners.get(evt)?.delete(fn);
    },
    isDestroyed: () => false,
  } as unknown as Parameters<ApiHub['attach']>[0];
  const fire = (evt: string, payload?: unknown) => {
    for (const fn of [...(listeners.get(evt) ?? [])]) fn(payload);
  };
  const listenerCount = (evt: string) => listeners.get(evt)?.size ?? 0;
  return { api, fire, listenerCount };
}

// The bus coalesces on a 0ms timer; wait two macrotasks so its emit has run.
const nextFrame = () => new Promise<void>((resolve) => setTimeout(() => setTimeout(() => resolve(), 0), 0));

function flushResult(update: Array<{ id: string; data?: unknown }> = [], add: typeof update = [], remove: typeof update = []) {
  return { results: [{ update, add, remove }] };
}

describe('RowChangeBus', () => {
  it('coalesces a burst of flushes in one frame into a single delta emit', async () => {
    const hub = new ApiHub();
    const { api, fire } = makeFakeApi();
    hub.attach(api);
    const bus = new RowChangeBus(hub);
    bus.start();
    const got: RowChange[] = [];
    bus.subscribe((c) => got.push(c));

    fire('asyncTransactionsFlushed', flushResult([{ id: 'a', data: { x: 1 } }]));
    fire('asyncTransactionsFlushed', flushResult([{ id: 'b', data: { x: 2 } }]));
    fire('modelUpdated'); // post-flush model update — must NOT promote to full

    expect(got).toHaveLength(0); // coalesced — nothing until the frame fires
    await nextFrame();

    expect(got).toHaveLength(1);
    expect(got[0].full).toBe(false);
    expect(got[0].updated.map((n) => n.id).sort()).toEqual(['a', 'b']);
  });

  it('dedupes repeated touches of the same row id within a frame', async () => {
    const hub = new ApiHub();
    const { api, fire } = makeFakeApi();
    hub.attach(api);
    const bus = new RowChangeBus(hub);
    bus.start();
    const got: RowChange[] = [];
    bus.subscribe((c) => got.push(c));

    fire('asyncTransactionsFlushed', flushResult([{ id: 'a', data: { x: 1 } }]));
    fire('asyncTransactionsFlushed', flushResult([{ id: 'a', data: { x: 9 } }]));
    await nextFrame();

    expect(got[0].updated).toHaveLength(1);
    expect((got[0].updated[0] as { data?: { x?: number } }).data?.x).toBe(9);
  });

  it('marks a structural change (modelUpdated with no flush) as full', async () => {
    const hub = new ApiHub();
    const { api, fire } = makeFakeApi();
    hub.attach(api);
    const bus = new RowChangeBus(hub);
    bus.start();
    const got: RowChange[] = [];
    bus.subscribe((c) => got.push(c));

    fire('modelUpdated');
    await nextFrame();

    expect(got).toHaveLength(1);
    expect(got[0].full).toBe(true);
    expect(got[0].updated).toHaveLength(0);
  });

  it('a sort/filter coinciding with a flush in the same window still classifies as full', async () => {
    const hub = new ApiHub();
    const { api, fire } = makeFakeApi();
    hub.attach(api);
    const bus = new RowChangeBus(hub);
    bus.start();
    const got: RowChange[] = [];
    bus.subscribe((c) => got.push(c));

    // Streaming flush AND a user sort land in one coalescing window —
    // the flush-only heuristic used to classify this as a mere delta,
    // silently skipping subscribers' structural (liveness-pruning)
    // pass against the re-sorted/re-filtered row set.
    fire('asyncTransactionsFlushed', flushResult([{ id: 'a', data: { x: 1 } }]));
    fire('sortChanged');
    fire('modelUpdated');
    await nextFrame();

    expect(got).toHaveLength(1);
    expect(got[0].full).toBe(true);
    // The delta still rides along for subscribers that want it.
    expect(got[0].updated.map((n) => n.id)).toEqual(['a']);

    // A later plain flush goes back to delta classification.
    fire('asyncTransactionsFlushed', flushResult([{ id: 'b', data: { x: 2 } }]));
    fire('modelUpdated');
    await nextFrame();
    expect(got).toHaveLength(2);
    expect(got[1].full).toBe(false);
  });

  it('stops emitting and detaches listeners after dispose', async () => {
    const hub = new ApiHub();
    const { api, fire, listenerCount } = makeFakeApi();
    hub.attach(api);
    const bus = new RowChangeBus(hub);
    bus.start();
    expect(listenerCount('asyncTransactionsFlushed')).toBe(1);

    const got: RowChange[] = [];
    bus.subscribe((c) => got.push(c));
    bus.dispose();
    expect(listenerCount('asyncTransactionsFlushed')).toBe(0);

    fire('asyncTransactionsFlushed', flushResult([{ id: 'a' }]));
    await nextFrame();
    expect(got).toHaveLength(0);
  });

  it('tracks add/remove transactions and filterChanged marks full', async () => {
    const hub = new ApiHub();
    const { api, fire } = makeFakeApi();
    hub.attach(api);
    const bus = new RowChangeBus(hub);
    bus.start();
    const got: RowChange[] = [];
    bus.subscribe((c) => got.push(c));

    fire('asyncTransactionsFlushed', flushResult([], [{ id: 'new' }], [{ id: 'old' }]));
    await nextFrame();
    expect(got[0]?.added.map((n) => n.id)).toEqual(['new']);
    expect(got[0]?.removed.map((n) => n.id)).toEqual(['old']);

    fire('filterChanged');
    await nextFrame();
    expect(got.at(-1)?.full).toBe(true);
  });

  it('start is idempotent and isolates subscriber errors', async () => {
    const hub = new ApiHub();
    const { api, fire } = makeFakeApi();
    hub.attach(api);
    const bus = new RowChangeBus(hub);
    bus.start();
    bus.start();
    const seen: number[] = [];
    bus.subscribe(() => { throw new Error('boom'); });
    bus.subscribe((c) => seen.push(c.updated.length));
    fire('asyncTransactionsFlushed', flushResult([{ id: 'a' }]));
    await nextFrame();
    expect(seen).toEqual([1]);
  });

  // ─── The server-side delta seam ─────────────────────────────────────────
  //
  // `applyServerSideTransaction` changes rows, returns the nodes it touched
  // and fires only `modelUpdated` — indistinguishable from a block refetch.
  // Whoever applied it is the only one who can say what moved, so it reports
  // here. Without this the server-side row model had NO delta source: every
  // tick classified `full` with three empty arrays, which is both costs at
  // once — subscribers pay the whole-grid pass and learn nothing.

  it('a reported transaction is a delta, not a structural change', async () => {
    const hub = new ApiHub();
    const { api, fire } = makeFakeApi();
    hub.attach(api);
    const bus = new RowChangeBus(hub);
    bus.start();
    const got: RowChange[] = [];
    bus.subscribe((c) => got.push(c));

    // Exactly the shape a server-side tick produces: the transaction's own
    // `modelUpdated`, and the result reported by its caller.
    bus.transactionApplied({ update: [{ id: 'a', data: { x: 1 } }] as never });
    fire('modelUpdated');
    await nextFrame();

    expect(got).toHaveLength(1);
    expect(got[0].full).toBe(false);
    expect(got[0].updated.map((n) => n.id)).toEqual(['a']);
  });

  it('coalesces reported transactions with flushed ones, deduping by row id', async () => {
    const hub = new ApiHub();
    const { api, fire } = makeFakeApi();
    hub.attach(api);
    const bus = new RowChangeBus(hub);
    bus.start();
    const got: RowChange[] = [];
    bus.subscribe((c) => got.push(c));

    fire('asyncTransactionsFlushed', flushResult([{ id: 'a', data: { x: 1 } }]));
    bus.transactionApplied({ update: [{ id: 'a', data: { x: 2 } }] as never });
    bus.transactionApplied({ add: [{ id: 'b' }] as never, remove: [{ id: 'c' }] as never });
    await nextFrame();

    expect(got).toHaveLength(1);
    expect(got[0].updated).toHaveLength(1);
    expect((got[0].updated[0] as { data?: { x?: number } }).data?.x).toBe(2);
    expect(got[0].added.map((n) => n.id)).toEqual(['b']);
    expect(got[0].removed.map((n) => n.id)).toEqual(['c']);
  });

  it('an EMPTY report does not downgrade a structural change to a rowless delta', async () => {
    const hub = new ApiHub();
    const { api, fire } = makeFakeApi();
    hub.attach(api);
    const bus = new RowChangeBus(hub);
    bus.start();
    const got: RowChange[] = [];
    bus.subscribe((c) => got.push(c));

    // A refused transaction returns a result with no nodes. Believing it
    // would produce the worst emit there is: not `full`, and carrying
    // nothing — subscribers skip their structural pass over a change they
    // were never told about.
    bus.transactionApplied({ update: [] });
    bus.transactionApplied({});
    fire('modelUpdated');
    await nextFrame();

    expect(got).toHaveLength(1);
    expect(got[0].full).toBe(true);
  });

  it('a sort landing with a reported transaction still classifies as full', async () => {
    const hub = new ApiHub();
    const { api, fire } = makeFakeApi();
    hub.attach(api);
    const bus = new RowChangeBus(hub);
    bus.start();
    const got: RowChange[] = [];
    bus.subscribe((c) => got.push(c));

    bus.transactionApplied({ update: [{ id: 'a' }] as never });
    fire('sortChanged');
    await nextFrame();

    expect(got[0].full).toBe(true);
    expect(got[0].updated.map((n) => n.id)).toEqual(['a']);
  });

  it('ignores a report before start and after dispose', async () => {
    const hub = new ApiHub();
    const { api } = makeFakeApi();
    hub.attach(api);
    const bus = new RowChangeBus(hub);
    const got: RowChange[] = [];
    bus.subscribe((c) => got.push(c));

    bus.transactionApplied({ update: [{ id: 'early' }] as never });
    await nextFrame();
    expect(got).toHaveLength(0);

    bus.start();
    bus.dispose();
    bus.transactionApplied({ update: [{ id: 'late' }] as never });
    await nextFrame();
    expect(got).toHaveLength(0);
  });

  it('rowDataUpdated alone marks structural and unsubscribe stops delivery', async () => {
    const hub = new ApiHub();
    const { api, fire } = makeFakeApi();
    hub.attach(api);
    const bus = new RowChangeBus(hub);
    bus.start();
    const got: RowChange[] = [];
    const unsub = bus.subscribe((c) => got.push(c));
    unsub();

    fire('rowDataUpdated');
    await nextFrame();
    expect(got).toHaveLength(0);
  });
});
