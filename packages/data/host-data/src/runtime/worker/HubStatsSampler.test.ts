import { describe, expect, it, vi } from 'vitest';
import { HubStatsSampler, type StatsSamplerContext } from './HubStatsSampler.js';
import type { ProviderSlot } from './hubTypes.js';
import { newReplayCache } from './replayCache.js';

/**
 * The sampler pushes provider stats two ways — `flush()` for a one-off (attach,
 * loading, timing events) and `tick()` on the 1 Hz interval. Both must report
 * the same thing.
 *
 * They did not. `flush()` passed the SSRM engine counts and `tick()` did not,
 * so the Diagnostics tab showed the engine's real row count the instant the tab
 * attached and the next tick overwrote it with `slot.cache.size` — always 0
 * under SSRM, because the rows live in the engine. Read as "the row count shows
 * for a split second, then reads 0". Nothing in an aggregate number catches
 * that; only asserting BOTH paths does.
 */
function slot(): ProviderSlot {
  return {
    providerId: 'p1',
    handle: {} as never,
    cfg: { providerType: 'stomp-ssrm' } as never,
    cache: new Map<string, unknown>(),
    status: 'ready',
    byteCount: 0,
    msgCount: 0,
    msgsByBucket: [0],
    bucketIdx: 0,
    pubsByBucket: [0],
    pubsByMinBucket: [0],
    minBucketIdx: 0,
    publishWindowSeconds: 1,
    publishCount: 0,
    startedAt: 0,
    lastMessageAt: null,
    errorCount: 0,
    snapshotFetchMs: 717,
    snapshotFetchStartedAt: 0,
    restartRequestMs: null,
    firstMessageMs: null,
    snapshotReady: true,
    replay: newReplayCache(),
    thinDeltas: false,
  } as unknown as ProviderSlot;
}

function harness() {
  const posted: Array<Record<string, unknown>> = [];
  const port = { postMessage: (m: Record<string, unknown>) => posted.push(m) };
  const providers = new Map([['p1', slot()]]);
  const engineStats = vi.fn(() => ({ cacheRows: 20_000, subscribers: 1, openViews: 2 }));
  const timers: Array<() => void> = [];

  const ctx: StatsSamplerContext = {
    providers,
    subscribers: {
      statsListeners: () => new Map([['s1', { subId: 's1', port }]]),
      dataCount: () => 1,
      statsProviderIds: () => ['p1'][Symbol.iterator](),
    } as never,
    setTimer: (cb: () => void) => { timers.push(cb); return timers.length; },
    clearTimer: () => {},
    pruneDeadStatsListeners: () => {},
    engineStats,
  };

  const sampler = new HubStatsSampler(ctx, 1000);
  /** Run the interval callback the sampler armed. */
  const runTick = () => { sampler.ensure(); timers.at(-1)?.(); };
  const rowCounts = () => posted.map((m) => (m.stats as { rowCount: number }).rowCount);
  return { sampler, runTick, rowCounts, engineStats, posted };
}

describe('HubStatsSampler — SSRM engine counts on BOTH push paths', () => {
  it('reports the engine row count on the one-off flush', () => {
    const { sampler, rowCounts } = harness();
    sampler.flush('p1');
    expect(rowCounts()).toEqual([20_000]);
  });

  it('reports the engine row count on the 1 Hz tick', () => {
    // The regression: this path omitted the engine lookup, so every tick
    // after the flush reported the empty CSRM cache instead.
    const { runTick, rowCounts } = harness();
    runTick();
    expect(rowCounts()).toEqual([20_000]);
  });

  it('does not drop the count between the flush and the following tick', () => {
    // The user-visible shape of the bug, asserted directly: 20000 then 0.
    const { sampler, runTick, rowCounts } = harness();
    sampler.flush('p1');
    runTick();
    runTick();
    expect(rowCounts()).toEqual([20_000, 20_000, 20_000]);
  });

  it('asks the engine on every push, so a later drop is still observed', () => {
    const { sampler, runTick, engineStats } = harness();
    sampler.flush('p1');
    runTick();
    expect(engineStats).toHaveBeenCalledTimes(2);
    expect(engineStats).toHaveBeenCalledWith('p1');
  });

  it('falls back to the worker cache when there is no engine (CSRM)', () => {
    // A CSRM context supplies no `engineStats` at all; the cache is the
    // right source there and must stay so.
    const captured: Array<Record<string, unknown>> = [];
    const port = { postMessage: (m: Record<string, unknown>) => captured.push(m) };
    const providers = new Map([['p1', slot()]]);
    providers.get('p1')!.cache.set('a', { id: 'a' });
    const ctx: StatsSamplerContext = {
      providers,
      subscribers: {
        statsListeners: () => new Map([['s1', { subId: 's1', port }]]),
        dataCount: () => 1,
        statsProviderIds: () => ['p1'][Symbol.iterator](),
      } as never,
      setTimer: () => 1,
      clearTimer: () => {},
      pruneDeadStatsListeners: () => {},
    };
    new HubStatsSampler(ctx, 1000).flush('p1');
    expect((captured[0].stats as { rowCount: number }).rowCount).toBe(1);
  });
});
