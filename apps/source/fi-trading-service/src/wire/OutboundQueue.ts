/**
 * Backpressure gate for one socket.
 *
 * The rule this enforces: when the socket is backed up, STOP PRODUCING.
 * Never queue frames in a JS array — that converts a slow consumer into
 * unbounded server memory growth, which is how a demo server dies at 3am
 * rather than degrading.
 *
 * Frames are strings, and strings are immutable in JS, so there is no
 * copy-on-send hazard here. That changes in the byte-level-writer phase,
 * where a reused output buffer must be copied whenever `bufferedAmount > 0`
 * (`ws` does not guarantee it takes a synchronous copy of what you hand it).
 */

import {
  BACKPRESSURE_RETRY_MS,
  OUTBOUND_HIGH_WATER_BYTES,
  OUTBOUND_LOW_WATER_BYTES,
} from './contract.js';
import type { WireSocket } from './WireSocket.js';

export interface OutboundQueueOptions {
  highWaterBytes?: number;
  lowWaterBytes?: number;
  retryMs?: number;
  /** Injected for deterministic tests. */
  setTimer?: (cb: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export class OutboundQueue {
  private readonly highWater: number;
  private readonly lowWater: number;
  private readonly retryMs: number;
  private readonly setTimer: (cb: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;
  private closed = false;
  private bytesSent = 0;
  private framesSent = 0;
  private timer: unknown = null;

  constructor(
    private readonly socket: WireSocket,
    options: OutboundQueueOptions = {},
  ) {
    this.highWater = options.highWaterBytes ?? OUTBOUND_HIGH_WATER_BYTES;
    this.lowWater = options.lowWaterBytes ?? OUTBOUND_LOW_WATER_BYTES;
    this.retryMs = options.retryMs ?? BACKPRESSURE_RETRY_MS;
    this.setTimer = options.setTimer ?? ((cb, ms) => setTimeout(cb, ms));
    this.clearTimer = options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  }

  get stats(): { bytesSent: number; framesSent: number; bufferedAmount: number } {
    return {
      bytesSent: this.bytesSent,
      framesSent: this.framesSent,
      bufferedAmount: this.socket.bufferedAmount,
    };
  }

  /** True while the producer should pause. */
  backedUp(): boolean {
    return this.socket.bufferedAmount > this.highWater;
  }

  /** True once a backed-up socket has drained far enough to resume. */
  drained(): boolean {
    return this.socket.bufferedAmount <= this.lowWater;
  }

  write(frame: string): void {
    if (this.closed) return;
    this.socket.send(frame);
    this.framesSent += 1;
    // Byte length, not string length: the counter is reported as bytes and a
    // multibyte frame would otherwise under-report what actually went out.
    this.bytesSent += Buffer.byteLength(frame, 'utf8');
  }

  /**
   * Resolve once the socket has drained below the low-water mark, or
   * immediately if it never crossed the high-water mark. Polls rather than
   * relying on a drain event, because `ws` does not emit one.
   */
  waitForDrain(): Promise<void> {
    if (this.closed || !this.backedUp()) return Promise.resolve();
    return new Promise((resolve) => {
      const poll = (): void => {
        if (this.closed || this.drained()) {
          resolve();
          return;
        }
        this.timer = this.setTimer(poll, this.retryMs);
      };
      this.timer = this.setTimer(poll, this.retryMs);
    });
  }

  close(): void {
    this.closed = true;
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }
}
