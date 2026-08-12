import { describe, expect, it } from 'vitest';
import { SsrmServer, type SsrmFlushEvent } from './index.js';
import type { ICacheIngest } from './index.js';

function fakeTimers() {
  const cbs = new Map<number, () => void>();
  let id = 0;
  return {
    set: (cb: () => void) => (cbs.set(++id, cb), id),
    clear: (h: unknown) => void cbs.delete(h as number),
    fire: () => { const all = [...cbs.values()]; cbs.clear(); all.forEach((f) => f()); },
    get armed() { return cbs.size > 0; },
  };
}

/**
 * Models `setInterval`/`clearInterval` semantics (the hub's own DEFAULT —
 * see `SharedWorkerDataServicesHub` constructor): a callback stays live and
 * keeps firing on every `fireLive()` until `clear()` removes it explicitly.
 * Contrast with `fakeTimers()` above, which is one-shot (`fire()` drains
 * the whole map), matching `setTimeout` — that shape can't catch a
 * consumer that forgets to call `clearTimer` on a normal (non-cancelled)
 * fire, because the one-shot fake already "clears itself".
 */
function intervalFakeTimers() {
  const live = new Map<number, () => void>();
  let id = 0;
  let clearCount = 0;
  return {
    set: (cb: () => void) => { const h = ++id; live.set(h, cb); return h; },
    clear: (h: unknown) => { if (live.delete(h as number)) clearCount++; },
    /** Invoke every still-live callback once (one tick of every armed interval). */
    fireLive: () => { for (const cb of [...live.values()]) cb(); },
    get liveCount() { return live.size; },
    get clearCount() { return clearCount; },
  };
}

/** Any transport is just something that calls ICacheIngest. */
function fakeTransport(sink: ICacheIngest) {
  return {
    snapshot: (n: number) =>
      sink.replaceSnapshot(
        Array.from({ length: n }, (_, i) => ({
          id: `P${i}`, book: i % 2 ? 'A' : 'B', px: i,
        })),
      ),
    tick: (id: string, px: number) => sink.upsert([{ id, px }]),
    drop: (id: string) => sink.remove([id]),
  };
}

const BASE = {
  startRow: 0, endRow: 100, filterModel: {}, sortModel: [],
  groupKeys: [], rowGroupCols: [], valueCols: [], pivotCols: [], pivotMode: false,
};

describe('ssrm engine contract (transport-agnostic)', () => {
  it('serves blocks, aggregates, and ticks driven purely through ICacheIngest', () => {
    const engine = new SsrmServer({ keyColumn: 'id' });
    const transport = fakeTransport(engine);
    const ticks: unknown[] = [];
    engine.onTick((e) => ticks.push(e));

    transport.snapshot(500);
    expect(engine.getRows(BASE).rowCount).toBe(500);

    transport.tick('P7', 9_999);
    const sum = engine.getRows({
      ...BASE, valueCols: [{ field: 'px', aggFunc: 'sum' }],
    }).grandTotalData?.px;
    // Recompute-from-state: the aggregate reflects the tick immediately.
    expect(sum).toBe(((499 * 500) / 2) - 7 + 9_999);

    transport.drop('P7');
    expect(engine.getRows(BASE).rowCount).toBe(499);
    expect(ticks.length).toBeGreaterThanOrEqual(3);
  });
});

describe('windowed flush', () => {
  it('passthrough by default: one flush per store tick, revision-stamped', () => {
    const engine = new SsrmServer({ keyColumn: 'id' });
    const flushes: SsrmFlushEvent[] = [];
    engine.onFlush((e) => flushes.push(e));
    engine.replaceSnapshot([{ id: 'a', px: 1 }]);
    engine.upsert([{ id: 'a', px: 2 }]);
    expect(flushes.map((f) => f.type)).toEqual(['snapshot', 'rows']);
    expect(flushes[1].keys).toEqual(['a']);
    expect(flushes[1].revision).toBe(engine.getStats().revision);
  });

  it('accumulates and key-conflates across a window, flushing once', () => {
    const t = fakeTimers();
    const engine = new SsrmServer({
      keyColumn: 'id', publishWindowMs: 200, setTimer: t.set, clearTimer: t.clear,
    });
    const flushes: SsrmFlushEvent[] = [];
    engine.onFlush((e) => flushes.push(e));
    engine.replaceSnapshot([{ id: 'a', px: 1 }, { id: 'b', px: 1 }]);
    flushes.length = 0; // snapshot flushes immediately even windowed — tested below

    engine.upsert([{ id: 'a', px: 2 }]);
    engine.upsert([{ id: 'a', px: 3 }]);
    engine.upsert([{ id: 'b', px: 2 }]);
    expect(flushes).toEqual([]);      // window open, nothing published
    t.fire();
    expect(flushes).toHaveLength(1);  // one conflated flush
    expect([...flushes[0].keys].sort()).toEqual(['a', 'b']);
    expect(flushes[0].updatesAccumulated).toBe(3); // 3 accumulated, 2 shipped
    expect(flushes[0].revision).toBe(engine.getStats().revision);
    expect(t.armed).toBe(false);      // timer disarmed until next change
  });

  it('flushes snapshot events immediately even inside a window', () => {
    const t = fakeTimers();
    const engine = new SsrmServer({
      keyColumn: 'id', publishWindowMs: 200, setTimer: t.set, clearTimer: t.clear,
    });
    const flushes: SsrmFlushEvent[] = [];
    engine.onFlush((e) => flushes.push(e));
    engine.upsert([{ id: 'a', px: 1 }]);       // opens window
    engine.replaceSnapshot([{ id: 'z', px: 0 }]); // must not wait
    expect(flushes.at(-1)?.type).toBe('snapshot');
  });

  it('isolates a throwing onFlush listener from later listeners and from upsert()', () => {
    const engine = new SsrmServer({ keyColumn: 'id' });
    const flushes: SsrmFlushEvent[] = [];
    engine.onFlush(() => {
      throw new Error('boom');
    });
    engine.onFlush((e) => flushes.push(e));
    expect(() => engine.upsert([{ id: 'a', px: 1 }])).not.toThrow();
    expect(flushes).toHaveLength(1);
    expect(flushes[0].type).toBe('rows');
  });

  it('clears the window timer on every flush under interval-semantics injected timers (regression: timer leak)', () => {
    // Regression for a leak where `flushWindow()` only did `windowTimer =
    // null` and never called `clearTimer`. That's correct for a one-shot
    // `setTimeout`, but the hub's own DEFAULT timer is
    // `setInterval`/`clearInterval` — under interval semantics, skipping
    // the clear leaves the just-fired interval live forever, and the next
    // window arms ANOTHER one on top of it: N windows compound into N live
    // intervals, none ever cleared, all firing (empty, harmless-looking,
    // but leaked) on every subsequent tick.
    const t = intervalFakeTimers();
    const engine = new SsrmServer({
      keyColumn: 'id', publishWindowMs: 200, setTimer: t.set, clearTimer: t.clear,
    });
    const flushes: SsrmFlushEvent[] = [];
    engine.onFlush((e) => flushes.push(e));

    // Window 1: upsert arms exactly one interval.
    engine.upsert([{ id: 'a', px: 1 }]);
    expect(t.liveCount).toBe(1);
    t.fireLive();
    expect(flushes).toHaveLength(1);
    expect(t.clearCount).toBe(1); // window 1's timer was cleared on flush
    expect(t.liveCount).toBe(0);  // nothing pending → nothing re-armed, no leak

    // Window 2: a fresh upsert must arm exactly one NEW interval — not a
    // second one stacked on a leaked window-1 interval.
    engine.upsert([{ id: 'b', px: 2 }]);
    expect(t.liveCount).toBe(1);
    t.fireLive();
    expect(flushes).toHaveLength(2);
    expect(t.clearCount).toBe(2); // one clear per completed window
    expect(t.liveCount).toBe(0);  // no live timers remain, no changes pending
  });

  it('dispose() quiesces flush notification: a later upsert() flushes nothing and arms no timer', () => {
    const t = fakeTimers();
    const engine = new SsrmServer({
      keyColumn: 'id', publishWindowMs: 200, setTimer: t.set, clearTimer: t.clear,
    });
    const flushes: SsrmFlushEvent[] = [];
    engine.onFlush((e) => flushes.push(e));
    engine.dispose();
    engine.upsert([{ id: 'a', px: 1 }]);
    expect(flushes).toEqual([]);
    expect(t.armed).toBe(false);
  });
});

describe('observability stats', () => {
  it('counts memo hits/misses and flush conflation', () => {
    const engine = new SsrmServer({ keyColumn: 'id' });
    engine.replaceSnapshot([{ id: 'a', px: 1 }]);
    engine.getRows(BASE); engine.getRows(BASE);
    const s = engine.getStats();
    expect(s.memoMisses).toBeGreaterThanOrEqual(1);
    expect(s.memoHits).toBeGreaterThanOrEqual(1);
    expect(s.sessions).toBe(0);
    expect(s.flushes).toBeGreaterThanOrEqual(1);
  });
});

describe('per-session expression rules', () => {
  it('two sessions with different calculated columns never see each other\'s', () => {
    const engine = new SsrmServer({ keyColumn: 'id' });
    engine.replaceSnapshot([{ id: 'a', px: 10 }]);
    engine.configureExpressions([{ id: 'c1', kind: 'calculated', field: 'twice', expression: '[px] * 2' }], 'sessA');
    engine.configureExpressions([{ id: 'c2', kind: 'calculated', field: 'half', expression: '[px] / 2' }], 'sessB');

    const rowA = engine.getRows({ ...BASE }, 'sessA').rowData[0];
    const rowB = engine.getRows({ ...BASE }, 'sessB').rowData[0];
    expect(rowA.twice).toBe(20);
    expect(rowA.half).toBeUndefined();
    expect(rowB.half).toBe(5);
    expect(rowB.twice).toBeUndefined();
  });

  it('sessionless configure keeps today\'s global behaviour', () => {
    const engine = new SsrmServer({ keyColumn: 'id' });
    engine.replaceSnapshot([{ id: 'a', px: 10 }]);
    engine.configureExpressions([{ id: 'g', kind: 'calculated', field: 'g', expression: '[px] + 1' }]);
    expect(engine.getRows({ ...BASE }, 'anybody').rowData[0].g).toBe(11);
  });
});
