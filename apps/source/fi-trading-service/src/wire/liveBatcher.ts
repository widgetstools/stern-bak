/**
 * Turns a target row-rate into a per-tick row budget.
 *
 * The trigger's `{rate}` segment is an aggregate rows-per-second promise, and
 * it is honoured exactly rather than approximately: the budget comes from
 * real elapsed time and fractional rows carry across ticks, so a 10,000/sec
 * request delivers 10,000 rows a second regardless of timer jitter or how
 * long a tick actually took.
 *
 * Carry is capped at one second's worth. Without the cap, a socket that
 * backs up for thirty seconds would come back and try to deliver 300,000
 * rows in one tick — converting a transient stall into a self-inflicted
 * stampede.
 */

export interface LiveBatcherOptions {
  /** Seconds of unspent budget worth carrying. Default 1. */
  maxCarrySeconds?: number;
}

export class LiveBatcher {
  private readonly maxCarrySeconds: number;
  private owed = 0;
  private lastMs: number | null = null;

  constructor(
    private rowsPerSecond: number,
    options: LiveBatcherOptions = {},
  ) {
    this.maxCarrySeconds = options.maxCarrySeconds ?? 1;
  }

  get rate(): number {
    return this.rowsPerSecond;
  }

  setRate(rowsPerSecond: number): void {
    this.rowsPerSecond = Math.max(0, rowsPerSecond);
  }

  /** Start (or restart) the clock without granting a budget. */
  reset(nowMs: number): void {
    this.lastMs = nowMs;
    this.owed = 0;
  }

  /**
   * Whole rows owed since the last call. Fractional remainder is retained,
   * so repeated small intervals still add up to the exact rate.
   */
  take(nowMs: number): number {
    if (this.rowsPerSecond <= 0) {
      this.lastMs = nowMs;
      return 0;
    }
    if (this.lastMs === null) {
      this.lastMs = nowMs;
      return 0;
    }
    const elapsedMs = Math.max(0, nowMs - this.lastMs);
    this.lastMs = nowMs;
    this.owed += (elapsedMs / 1000) * this.rowsPerSecond;

    const ceiling = this.rowsPerSecond * this.maxCarrySeconds;
    if (this.owed > ceiling) this.owed = ceiling;

    const whole = Math.floor(this.owed);
    this.owed -= whole;
    return whole;
  }
}
