/**
 * SnapshotReassembler — client-side normalization for chunked provider
 * snapshots. The hub replays large caches in 500-row frames: chunk0
 * carries `replace: true`, subsequent chunks are `replace: false`
 * deltas that must be appended before the loading→ready commit.
 *
 * Extracted from MarketsGridContainer snapshot buffering (Phase 6 will
 * delete the grid-local duplicate). Also handles mid-subscription
 * `replace: true` restarts via `onReset`.
 */

import type { ProviderStatus } from '../runtime/protocol.js';

export interface SnapshotReassemblerCallbacks<T> {
  /** Fires whenever the in-flight snapshot row count changes. */
  onRowsReceived?: (count: number) => void;
  /** Full assembled snapshot on loading→ready (head + tail). */
  onSnapshotReady?: (rows: readonly T[]) => void;
  /** Live ticks after the initial snapshot has settled. */
  onTick?: (rows: readonly T[]) => void;
  /** `replace: true` after settle — restart snapshot accumulation. */
  onReset?: (rows: readonly T[]) => void;
  /** Hub cache replay on a settled subscription (`refresh-provider` RPC). */
  onCacheRefresh?: (rows: readonly T[]) => void;
}

export class SnapshotReassembler<T = unknown> {
  private head: T[] = [];
  private tail: T[] = [];
  private phase: ProviderStatus = 'loading';
  private settled = false;
  private refreshActive = false;
  private refreshHead: T[] = [];
  private refreshTail: T[] = [];

  constructor(private readonly callbacks: SnapshotReassemblerCallbacks<T> = {}) {}

  /** Current in-flight snapshot row count (head + tail). */
  getRowCount(): number {
    return this.head.length + this.tail.length;
  }

  /** Whether the initial snapshot has been committed. */
  isSettled(): boolean {
    return this.settled;
  }

  getPhase(): ProviderStatus {
    return this.phase;
  }

  /** Assemble head + tail without mutating internal state. */
  assemble(): readonly T[] {
    return [...this.head, ...this.tail];
  }

  /** Begin accepting hub cache replay deltas for `refresh-provider`. */
  beginCacheRefresh(): void {
    this.refreshActive = true;
    this.refreshHead = [];
    this.refreshTail = [];
  }

  isCacheRefreshActive(): boolean {
    return this.refreshActive;
  }

  /** Wire a hub delta event. */
  onDelta(rows: readonly T[], replace: boolean): void {
    if (this.phase === 'error') {
      if (!replace) return;
      // STOMP auto-reconnect emits `replace:true` before `status:loading`.
      // Without this, the replace is dropped while phase is still `error`
      // and a later `ready` can land without a snapshot commit.
      this.head = [...rows];
      this.tail = [];
      this.settled = false;
      this.phase = 'loading';
      this.callbacks.onReset?.(rows);
      this.emitRowCount();
      return;
    }

    if (this.refreshActive) {
      if (replace) this.refreshHead = [...rows];
      else this.refreshTail.push(...rows);
      this.callbacks.onRowsReceived?.(this.refreshHead.length + this.refreshTail.length);
      return;
    }
    if (replace) {
      if (this.settled) {
        this.head = [...rows];
        this.tail = [];
        this.settled = false;
        this.phase = 'loading';
        this.callbacks.onReset?.(rows);
        this.emitRowCount();
        return;
      }
      this.head = [...rows];
      this.emitRowCount();
      return;
    }

    if (!this.settled) {
      this.tail.push(...rows);
      this.emitRowCount();
      return;
    }

    this.callbacks.onTick?.(rows);
  }

  /** Wire a hub status event. */
  onStatus(status: ProviderStatus, error?: string): void {
    if (status === 'error') {
      if (this.refreshActive) {
        this.refreshActive = false;
        this.refreshHead = [];
        this.refreshTail = [];
      }
      this.phase = 'error';
      return;
    }

    if (this.refreshActive && status === 'ready' && !error) {
      Promise.resolve().then(() => {
        if (!this.refreshActive) return;
        const assembled = [...this.refreshHead, ...this.refreshTail];
        this.refreshActive = false;
        this.refreshHead = [];
        this.refreshTail = [];
        // Restore live-tick routing — `loading` during replay clears
        // `settled`; without this, post-refresh deltas buffer in `tail`
        // instead of reaching `onTick`.
        this.settled = true;
        this.phase = 'ready';
        this.callbacks.onCacheRefresh?.(assembled);
      });
      return;
    }
    if (status === 'loading') {
      if (this.phase === 'ready' || this.phase === 'error') {
        this.head = [];
        this.tail = [];
        this.settled = false;
      }
      this.phase = 'loading';
      return;
    }

    if (status === 'ready' && this.phase === 'loading' && !error) {
      // Defer commit so consumers can register handlers and microtask
      // ordering matches MarketsGridContainer (snapshot.then before commit).
      Promise.resolve().then(() => {
        if (this.phase !== 'loading' || this.settled) return;
        const assembled = this.assemble();
        this.settled = true;
        this.phase = 'ready';
        this.callbacks.onSnapshotReady?.(assembled);
      });
      return;
    }

    if (status === 'ready' && this.phase === 'error' && !error) {
      // `loading` was missed (ordering) but upstream declared ready — treat
      // any buffered head/tail as the reconnect snapshot.
      Promise.resolve().then(() => {
        if (this.phase !== 'error') return;
        const assembled = this.assemble();
        this.settled = true;
        this.phase = 'ready';
        this.callbacks.onSnapshotReady?.(assembled);
      });
      return;
    }

    this.phase = status;
  }

  reset(): void {
    this.head = [];
    this.tail = [];
    this.phase = 'loading';
    this.settled = false;
    this.refreshActive = false;
    this.refreshHead = [];
    this.refreshTail = [];
  }

  private emitRowCount(): void {
    this.callbacks.onRowsReceived?.(this.getRowCount());
  }
}
