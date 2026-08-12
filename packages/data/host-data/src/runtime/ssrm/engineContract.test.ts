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
});
