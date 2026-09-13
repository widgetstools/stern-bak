/**
 * Fixed-size sample reservoir for hub-thread accounting: keeps a running
 * count + total and the last `capacity` samples, so `hub-introspect` can
 * report p50 / p99 / max of recent work without unbounded memory. Pure
 * data structure — no timers, no globals.
 */

export interface LatencySummary {
  /** Samples recorded since boot. */
  n: number;
  /** Sum of every sample since boot, ms. */
  totalMs: number;
  /** Percentiles over the retained window (last `capacity` samples). */
  p50: number | null;
  p99: number | null;
  max: number | null;
}

export class LatencyReservoir {
  private readonly ring: number[];
  private next = 0;
  private filled = 0;
  private count = 0;
  private total = 0;

  constructor(private readonly capacity = 256) {
    this.ring = new Array<number>(capacity);
  }

  record(ms: number): void {
    this.count += 1;
    this.total += ms;
    this.ring[this.next] = ms;
    this.next = (this.next + 1) % this.capacity;
    if (this.filled < this.capacity) this.filled += 1;
  }

  summary(): LatencySummary {
    if (this.filled === 0) return { n: 0, totalMs: 0, p50: null, p99: null, max: null };
    const sorted = this.ring.slice(0, this.filled).sort((a, b) => a - b);
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    return {
      n: this.count,
      totalMs: round(this.total),
      p50: round(q(0.5)),
      p99: round(q(0.99)),
      max: round(sorted[sorted.length - 1]),
    };
  }
}

function round(ms: number): number {
  return Math.round(ms * 10) / 10;
}
