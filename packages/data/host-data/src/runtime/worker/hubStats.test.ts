import { describe, expect, it } from 'vitest';
import { snapshotProviderStats, type EngineStats } from './hubStats.js';
import type { ProviderSlot } from './hubTypes.js';
import { newReplayCache } from './replayCache.js';

/**
 * The Diagnostics tab reported "0 rows / 0 B" for every SSRM provider. Both
 * numbers read `slot.cache`, the hub's per-slot Map — and under SSRM the rows
 * never enter it, they go into the WASM engine. So the figures were not wrong
 * about the cache; they were answering about the wrong store.
 *
 * `snapshotProviderStats` now takes the engine's own counts when the caller
 * has them. The shape is pinned against the vendored WASM build's
 * `mem_stats()`, which answers per datasource:
 *
 *   {"datasourceCount":1,"openViews":0,"writes":0,"bundleVersion":1,
 *    "datasources":[{"datasourceId":"p1","subscribers":0,"cacheRows":10000}]}
 */
function slot(over: Partial<ProviderSlot> = {}): ProviderSlot {
  return {
    providerId: 'p1',
    handle: {} as never,
    cfg: { providerType: 'stomp-ssrm' } as never,
    cache: new Map<string, unknown>(),
    status: 'ready',
    byteCount: 4096,
    msgCount: 7,
    msgsByBucket: [0, 0, 0, 0, 0],
    bucketIdx: 0,
    pubsByBucket: [0, 0, 0, 0, 0],
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
    ...over,
  } as unknown as ProviderSlot;
}

const engine = (over: Partial<EngineStats> = {}): EngineStats =>
  ({ cacheRows: 10_000, subscribers: 2, openViews: 3, ...over });

describe('snapshotProviderStats — SSRM engine counts', () => {
  it('reports the engine row count, not the empty worker cache', () => {
    // The cache is empty and correct to be: SSRM rows live in the engine.
    const stats = snapshotProviderStats(slot(), 1, engine());
    expect(stats.rowCount).toBe(10_000);
  });

  it('leaves the serialized cache size UNDEFINED rather than 0', () => {
    // The engine reports counts, never bytes. A 0 here renders as "0 B",
    // which reads as "measured, and it is empty" instead of "not measurable".
    const stats = snapshotProviderStats(slot(), 1, engine());
    expect(stats.cacheBytes).toBeUndefined();
  });

  it('carries the engine subscriber and open-view counts', () => {
    const stats = snapshotProviderStats(slot(), 1, engine({ subscribers: 5, openViews: 9 }));
    expect(stats.engineSubscribers).toBe(5);
    expect(stats.engineOpenViews).toBe(9);
  });

  it('still reports upstream wire bytes, which the engine does not affect', () => {
    // `byteCount` is raw frame bodies off the socket — unrelated to where the
    // rows are stored, so it must survive the SSRM branch untouched.
    expect(snapshotProviderStats(slot(), 1, engine()).byteCount).toBe(4096);
  });
});

describe('snapshotProviderStats — CSRM is unchanged', () => {
  const csrm = () => slot({
    cfg: { providerType: 'stomp' } as never,
    cache: new Map<string, unknown>([['a', { id: 'a' }], ['b', { id: 'b' }]]),
  });

  it('counts the worker cache when there is no engine', () => {
    const stats = snapshotProviderStats(csrm(), 1);
    expect(stats.rowCount).toBe(2);
  });

  it('still reports a serialized cache size', () => {
    // A NUMBER is the claim, not a positive one: with an empty replay cache
    // `cacheFootprintBytes` returns an exact 0 rather than falling back to the
    // sampled estimate. The contrast that matters is against SSRM, where the
    // field is undefined because no byte figure exists at all.
    const stats = snapshotProviderStats(csrm(), 1);
    expect(typeof stats.cacheBytes).toBe('number');
  });

  it('leaves the engine fields undefined', () => {
    const stats = snapshotProviderStats(csrm(), 1);
    expect(stats.engineSubscribers).toBeUndefined();
    expect(stats.engineOpenViews).toBeUndefined();
  });

  it('treats a null engine lookup as CSRM', () => {
    // `engineStatsFor` answers null for a CSRM slot and for anything the WASM
    // hub has not booted; both must keep the cache figures.
    const stats = snapshotProviderStats(csrm(), 1, null);
    expect(stats.rowCount).toBe(2);
    expect(typeof stats.cacheBytes).toBe('number');
  });
});
