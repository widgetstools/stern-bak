/**
 * ReplayScheduler — round-robin late-join replay (worker-split plan W4).
 *
 * N windows attaching to one provider at once used to replay serially:
 * window k's first chunk waited for k−1 complete replays, so ten 20k-row
 * blotters painted as a ladder. The scheduler holds every pending replay
 * and runs PASSES: a pass walks the pending jobs round-robin, posting the
 * next chunk of each (one flat byte copy per port of the SAME pre-encoded
 * buffer), until every job is done or the pass budget is spent; then it
 * yields to the macrotask queue so ingest, block RPCs and new attaches
 * breathe, and continues. A lone window whose whole replay fits the budget
 * still ships in one synchronous pass, exactly as before; a fan-out that
 * does not fit is interleaved, so first→last spread collapses from
 * O(N × replay) to O(one pass).
 *
 * Consistency across passes: a job's chunk set is FROZEN at enqueue —
 * `ensureReplayChunks` at that moment, exactly the snapshot the old serial
 * replay shipped, re-encoding only the buckets dirtied since the previous
 * attach and sharing every clean buffer with the other jobs of the burst
 * — and live deltas for a port whose replay is in flight are DEFERRED and
 * flushed after its `ready`. So a port never sees a live update interleaved
 * inside its snapshot, a row that ticked after the freeze converges through
 * the flushed delta, and the encode cost is one per attach burst, not one
 * per pass (measured: re-resolving chunks every pass under a sweeping feed
 * re-encoded most of a 20k-row cache 30+ times and tripled hub-thread time).
 *
 * Backpressure: a MessagePort exposes no high-water mark — `postMessage`
 * never blocks and never reports queue depth — so the one lever is order:
 * within a pass, ports whose window reported itself hidden take their
 * chunk after the visible ones. A port that throws is dropped.
 */

import type { Event } from '../protocol.js';
import { ensureReplayChunks } from './replayCache.js';
import { REPLAY_PASS_BUDGET_MS, type PortLike, type ProviderSlot } from './hubTypes.js';

export interface ReplayJob {
  providerId: string;
  subId: string;
  port: PortLike;
  slot: ProviderSlot;
  mode: 'attach' | 'refresh';
}

interface PendingJob extends ReplayJob {
  /** The snapshot as of enqueue — encoded once, posted chunk by chunk. */
  chunks: ReturnType<typeof ensureReplayChunks>;
  /** Next chunk index to post. */
  next: number;
  /** Live events received while this replay is in flight; flushed after `ready`. */
  deferred: Event[];
}

/** What the hub lends the scheduler. */
export interface ReplaySchedulerContext {
  /** Is `slot` still the registered slot for its provider? Stale jobs are dropped. */
  isCurrentSlot(providerId: string, slot: ProviderSlot): boolean;
  /** Whether the subscriber's window reported itself hidden (heartbeat meta). */
  isHidden(subId: string): boolean;
  /** Post one event to one port; false when the port is dead (job dropped). */
  post(job: ReplayJob, event: Event): boolean;
  /** Count posts toward the slot's publish stats. */
  recordPublish(slot: ProviderSlot, count: number): void;
  /** Yield to the macrotask queue, then continue. Injected for tests. */
  yieldThen(cb: () => void): void;
  now(): number;
}

/** Hub-thread accounting for `hub-introspect` (plan §5 fan-out row). */
export interface ReplayFanoutStats {
  /** Passes run since boot. */
  passes: number;
  /** Replays completed since boot. */
  replays: number;
  /** Chunks posted since boot. */
  chunksPosted: number;
  /** Hub-thread ms spent encoding dirty buckets at enqueue since boot. */
  encodeMs: number;
  /** Hub-thread ms spent inside passes (posting) since boot. */
  hubThreadMs: number;
  /**
   * The most recent fan-out episode — from the first job entering an
   * empty queue until the queue drained: how many ports it served, how
   * many chunks it posted, hub-thread ms it consumed encoding and posting,
   * and wall ms it spanned (including yields).
   */
  lastEpisode: { ports: number; chunksPosted: number; encodeMs: number; hubThreadMs: number; wallMs: number } | null;
}

export class ReplayScheduler {
  private readonly jobs: PendingJob[] = [];
  private scheduled = false;
  private readonly stats: ReplayFanoutStats = {
    passes: 0,
    replays: 0,
    chunksPosted: 0,
    encodeMs: 0,
    hubThreadMs: 0,
    lastEpisode: null,
  };
  private episode: { ports: Set<string>; chunksPosted: number; encodeMs: number; hubThreadMs: number; startedAt: number } | null = null;

  constructor(
    private readonly ctx: ReplaySchedulerContext,
    private readonly passBudgetMs: number = REPLAY_PASS_BUDGET_MS,
  ) {}

  /**
   * Queue a replay. Runs a pass immediately when none is pending, so a
   * single attach with a small cache completes synchronously (the hub's
   * ordering guarantees — `loading`, chunks, `ready`, then live deltas —
   * hold unchanged).
   */
  enqueue(job: ReplayJob): void {
    if (!this.episode) {
      this.episode = { ports: new Set(), chunksPosted: 0, encodeMs: 0, hubThreadMs: 0, startedAt: this.ctx.now() };
    }
    this.episode.ports.add(job.subId);
    const t0 = this.ctx.now();
    const chunks = ensureReplayChunks(job.slot.replay, job.slot.cache, job.slot.columnar);
    const encodeMs = this.ctx.now() - t0;
    this.stats.encodeMs += encodeMs;
    this.episode.encodeMs += encodeMs;
    this.jobs.push({ ...job, chunks, next: 0, deferred: [] });
    if (!this.scheduled) this.pass();
  }

  /** True while `subId` still owes replay chunks — its live deltas must be deferred. */
  isReplaying(subId: string): boolean {
    return this.jobs.some((j) => j.subId === subId);
  }

  /** Hold a live event for a replaying port; flushed in order after its `ready`. */
  defer(subId: string, event: Event): void {
    const job = this.jobs.find((j) => j.subId === subId);
    if (job) job.deferred.push(event);
  }

  /** Drop a pending replay (detach, port closed). Deferred events go with it. */
  cancel(subId: string): void {
    const idx = this.jobs.findIndex((j) => j.subId === subId);
    if (idx >= 0) this.jobs.splice(idx, 1);
  }

  /** Drop every pending replay of a provider (stop / recreate). */
  cancelProvider(providerId: string): void {
    for (let i = this.jobs.length - 1; i >= 0; i--) {
      if (this.jobs[i].providerId === providerId) this.jobs.splice(i, 1);
    }
  }

  snapshotStats(): ReplayFanoutStats {
    return { ...this.stats, lastEpisode: this.stats.lastEpisode ? { ...this.stats.lastEpisode } : null };
  }

  // ─── Internals ─────────────────────────────────────────────────

  private pass(): void {
    this.scheduled = false;
    const t0 = this.ctx.now();
    this.stats.passes += 1;
    // A pass is one or more ROUNDS; a round posts the next chunk of EVERY
    // pending job (visible windows first, hidden after — the only
    // backpressure a MessagePort lets us express) and the budget is checked
    // between rounds, so a pass always makes progress and no port waits
    // behind another port's whole replay.
    let progressed = true;
    while (progressed && this.jobs.length > 0) {
      progressed = false;
      const order = [...this.jobs].sort((a, b) => Number(this.ctx.isHidden(a.subId)) - Number(this.ctx.isHidden(b.subId)));
      for (const job of order) {
        if (!this.jobs.includes(job)) continue; // completed or cancelled earlier this pass
        if (!this.ctx.isCurrentSlot(job.providerId, job.slot)) {
          this.cancel(job.subId); // slot recreated / stopped: the listener already heard `loading`
          continue;
        }
        progressed = true;
        this.postNextChunk(job);
      }
      if (this.ctx.now() - t0 >= this.passBudgetMs) break;
    }
    const spent = this.ctx.now() - t0;
    this.stats.hubThreadMs += spent;
    if (this.episode) this.episode.hubThreadMs += spent;
    if (this.jobs.length > 0) {
      this.scheduled = true;
      this.ctx.yieldThen(() => this.pass());
    } else if (this.episode) {
      this.stats.lastEpisode = {
        ports: this.episode.ports.size,
        chunksPosted: this.episode.chunksPosted,
        encodeMs: this.episode.encodeMs,
        hubThreadMs: this.episode.hubThreadMs,
        wallMs: this.ctx.now() - this.episode.startedAt,
      };
      this.episode = null;
    }
  }

  private postNextChunk(job: PendingJob): void {
    const { chunks } = job;
    const i = job.next;
    if (i < chunks.length) {
      const ok = this.ctx.post(job, {
        subId: job.subId,
        kind: 'delta-bin',
        buf: chunks[i].buf,
        enc: chunks[i].enc,
        replace: i === 0,
      });
      if (!ok) {
        this.cancel(job.subId);
        return;
      }
      this.ctx.recordPublish(job.slot, 1);
      this.stats.chunksPosted += 1;
      if (this.episode) this.episode.chunksPosted += 1;
      job.next = i + 1;
      if (job.next < chunks.length) return;
    }
    this.complete(job);
  }

  private complete(job: PendingJob): void {
    this.cancel(job.subId);
    this.stats.replays += 1;
    // Replay succeeded — surface `ready` so the grid clears any stale banner
    // even if the upstream transport is still recovering. (An attach replay
    // of an EMPTY cache never reaches the scheduler — the hub handles it.)
    if (!this.ctx.post(job, { subId: job.subId, kind: 'status', status: 'ready', error: undefined })) return;
    for (const event of job.deferred) {
      if (!this.ctx.post(job, event)) return;
    }
  }
}
