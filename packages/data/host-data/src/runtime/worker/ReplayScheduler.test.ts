import { describe, expect, it, vi } from 'vitest';
import type { Event } from '../protocol.js';
import { ReplayScheduler, type ReplayJob, type ReplaySchedulerContext } from './ReplayScheduler.js';
import { newReplayCache, markReplayUpsert } from './replayCache.js';
import { LATE_JOIN_CHUNK_SIZE, type ProviderSlot } from './hubTypes.js';

/** A slot with `rows` keyed rows in the cache and a matching replay-cache bucket layout. */
function makeSlot(rows: number): ProviderSlot {
  const cache = new Map<string, unknown>();
  const replay = newReplayCache();
  for (let i = 0; i < rows; i++) {
    const key = `r${i}`;
    cache.set(key, { id: key, x: i });
    markReplayUpsert(replay, key);
  }
  return { cache, replay, columnar: false, snapshotReady: true } as unknown as ProviderSlot;
}

interface Harness {
  scheduler: ReplayScheduler;
  posted: Array<{ subId: string; event: Event }>;
  yields: Array<() => void>;
  runYields(): void;
  ctx: ReplaySchedulerContext;
  clock: { now: number };
  dead: Set<string>;
  hidden: Set<string>;
  current: Map<string, ProviderSlot>;
}

function harness(opts: { budgetMs?: number; costPerPostMs?: number } = {}): Harness {
  const posted: Harness['posted'] = [];
  const yields: Array<() => void> = [];
  const clock = { now: 0 };
  const dead = new Set<string>();
  const hidden = new Set<string>();
  const current = new Map<string, ProviderSlot>();
  const ctx: ReplaySchedulerContext = {
    isCurrentSlot: (providerId, slot) => current.get(providerId) === slot,
    isHidden: (subId) => hidden.has(subId),
    post: (job: ReplayJob, event: Event) => {
      if (dead.has(job.subId)) return false;
      posted.push({ subId: job.subId, event });
      clock.now += opts.costPerPostMs ?? 0;
      return true;
    },
    recordPublish: vi.fn(),
    yieldThen: (cb) => { yields.push(cb); },
    now: () => clock.now,
  };
  const scheduler = new ReplayScheduler(ctx, opts.budgetMs ?? 8);
  return {
    scheduler, posted, yields, ctx, clock, dead, hidden, current,
    runYields() { const pending = yields.splice(0); for (const cb of pending) cb(); },
  };
}

const job = (h: Harness, subId: string, slot: ProviderSlot, mode: 'attach' | 'refresh' = 'attach'): ReplayJob => {
  h.current.set('p1', slot);
  return { providerId: 'p1', subId, port: { postMessage() {} }, slot, mode };
};
const kinds = (h: Harness, subId: string) => h.posted.filter((p) => p.subId === subId).map((p) => `${p.event.kind}${(p.event as { replace?: boolean }).replace ? '*' : ''}${(p.event as { status?: string }).status ? ':' + (p.event as { status?: string }).status : ''}`);

describe('ReplayScheduler — a lone replay that fits the budget ships synchronously', () => {
  it('posts every chunk (first replace) then ready, inside enqueue, and reuses the same buffers', () => {
    const h = harness();
    const slot = makeSlot(LATE_JOIN_CHUNK_SIZE * 3);
    h.scheduler.enqueue(job(h, 'a', slot));
    expect(kinds(h, 'a')).toEqual(['delta-bin*', 'delta-bin', 'delta-bin', 'status:ready']);
    expect(h.yields).toHaveLength(0);
    expect(h.scheduler.isReplaying('a')).toBe(false);
    // A second lone replay reuses the cache's encoded buffers.
    h.scheduler.enqueue(job(h, 'b', slot));
    const bufA = (h.posted[0].event as { buf: Uint8Array }).buf;
    const bufB = (h.posted.find((p) => p.subId === 'b')!.event as { buf: Uint8Array }).buf;
    expect(bufB).toBe(bufA);
  });
});

describe('ReplayScheduler — a fan-out that exceeds the budget is interleaved round-robin', () => {
  it('a later joiner gets its first chunk before an earlier one gets its last, with a yield between passes', () => {
    // Each post costs 5 ms against an 8 ms budget: `a` alone posts two
    // chunks in its synchronous pass, exceeds the budget and yields; b and c
    // arrive while that continuation is pending.
    const h = harness({ budgetMs: 8, costPerPostMs: 5 });
    const slot = makeSlot(LATE_JOIN_CHUNK_SIZE * 3);
    h.scheduler.enqueue(job(h, 'a', slot));
    expect(kinds(h, 'a')).toEqual(['delta-bin*', 'delta-bin']);
    h.scheduler.enqueue(job(h, 'b', slot));
    h.scheduler.enqueue(job(h, 'c', slot));
    expect(h.yields.length).toBeGreaterThan(0);
    while (h.yields.length) h.runYields();

    for (const id of ['a', 'b', 'c']) {
      expect(kinds(h, id)).toEqual(['delta-bin*', 'delta-bin', 'delta-bin', 'status:ready']);
    }
    // Round-robin: c's first chunk precedes b's second chunk.
    const order = h.posted.filter((p) => p.event.kind === 'delta-bin').map((p) => p.subId);
    const firstB1 = order.indexOf('b', order.indexOf('b') + 1);
    expect(order.indexOf('c')).toBeLessThan(firstB1);
    expect(h.scheduler.snapshotStats().passes).toBeGreaterThan(1);
    expect(h.scheduler.snapshotStats().replays).toBe(3);
    expect(h.scheduler.snapshotStats().lastEpisode).toMatchObject({ ports: 3, chunksPosted: 9 });
  });

  it('visible windows take their chunk before hidden ones in each pass', () => {
    const h = harness({ budgetMs: 8, costPerPostMs: 5 });
    const slot = makeSlot(LATE_JOIN_CHUNK_SIZE * 3);
    h.scheduler.enqueue(job(h, 'hiddenFirst', slot));
    h.hidden.add('hiddenFirst');
    h.scheduler.enqueue(job(h, 'visible', slot));
    while (h.yields.length) h.runYields();
    const order = h.posted.filter((p) => p.event.kind === 'delta-bin').map((p) => p.subId);
    // hiddenFirst got two chunks in its synchronous first pass; from the
    // next pass on, `visible` is served ahead of it in every round.
    expect(order.slice(2, 4)).toEqual(['visible', 'hiddenFirst']);
  });
});

describe('ReplayScheduler — live deltas are deferred until that port is ready', () => {
  it('flushes deferred events, in order, after the ready of the port they were held for', () => {
    const h = harness({ budgetMs: 8, costPerPostMs: 5 });
    const slot = makeSlot(LATE_JOIN_CHUNK_SIZE * 3);
    h.scheduler.enqueue(job(h, 'a', slot));
    expect(h.scheduler.isReplaying('a')).toBe(true);
    h.scheduler.defer('a', { subId: '', kind: 'delta', rows: [{ id: 'r0', x: 99 }] } as Event);
    h.scheduler.defer('a', { subId: '', kind: 'delta', rows: [{ id: 'r1', x: 98 }] } as Event);
    while (h.yields.length) h.runYields();
    expect(kinds(h, 'a')).toEqual(['delta-bin*', 'delta-bin', 'delta-bin', 'status:ready', 'delta', 'delta']);
    expect(h.scheduler.isReplaying('a')).toBe(false);
  });
});

describe('ReplayScheduler — cancellation and stale slots', () => {
  it('cancel drops a pending replay and its deferred events; nothing more is posted', () => {
    const h = harness({ budgetMs: 8, costPerPostMs: 5 });
    const slot = makeSlot(LATE_JOIN_CHUNK_SIZE * 3);
    h.scheduler.enqueue(job(h, 'a', slot));
    h.scheduler.defer('a', { subId: '', kind: 'delta', rows: [] } as Event);
    h.scheduler.cancel('a');
    while (h.yields.length) h.runYields();
    expect(kinds(h, 'a')).toEqual(['delta-bin*', 'delta-bin']);
    expect(h.scheduler.isReplaying('a')).toBe(false);
  });

  it('cancelProvider drops every replay of that provider', () => {
    const h = harness({ budgetMs: 8, costPerPostMs: 5 });
    const slot = makeSlot(LATE_JOIN_CHUNK_SIZE * 3);
    h.scheduler.enqueue(job(h, 'a', slot));
    h.scheduler.enqueue(job(h, 'b', slot));
    h.scheduler.cancelProvider('p1');
    while (h.yields.length) h.runYields();
    expect(h.scheduler.isReplaying('a')).toBe(false);
    expect(h.scheduler.isReplaying('b')).toBe(false);
  });

  it('a job whose slot was recreated is dropped silently on the next pass', () => {
    const h = harness({ budgetMs: 8, costPerPostMs: 5 });
    const slot = makeSlot(LATE_JOIN_CHUNK_SIZE * 3);
    h.scheduler.enqueue(job(h, 'a', slot));
    h.current.set('p1', makeSlot(1)); // restart replaced the slot
    while (h.yields.length) h.runYields();
    expect(kinds(h, 'a')).toEqual(['delta-bin*', 'delta-bin']);
    expect(h.scheduler.snapshotStats().replays).toBe(0);
  });

  it('a port that throws on post is dropped', () => {
    const h = harness();
    const slot = makeSlot(LATE_JOIN_CHUNK_SIZE);
    h.dead.add('dead');
    h.scheduler.enqueue(job(h, 'dead', slot));
    expect(kinds(h, 'dead')).toEqual([]);
    expect(h.scheduler.isReplaying('dead')).toBe(false);
  });
});

describe('ReplayScheduler — accounting', () => {
  it('counts passes, replays, chunks and hub-thread ms; the episode closes when the queue drains', () => {
    const h = harness({ budgetMs: 8, costPerPostMs: 5 });
    const slot = makeSlot(LATE_JOIN_CHUNK_SIZE * 4);
    h.scheduler.enqueue(job(h, 'a', slot));   // two chunks, then the budget yields
    h.scheduler.enqueue(job(h, 'b', slot));   // joins the same episode
    while (h.yields.length) h.runYields();
    const s = h.scheduler.snapshotStats();
    expect(s.chunksPosted).toBe(8);
    expect(s.replays).toBe(2);
    expect(s.hubThreadMs).toBeGreaterThan(0);
    expect(s.lastEpisode).toMatchObject({ ports: 2, chunksPosted: 8, encodeMs: 0 });
    expect(s.lastEpisode!.wallMs).toBeGreaterThanOrEqual(s.lastEpisode!.hubThreadMs);
  });
});
