/**
 * In-memory stand-in for a `ws` socket.
 *
 * `bufferedAmount` is settable so backpressure can be forced deterministically
 * rather than by trying to actually congest a socket — that is the one socket
 * behaviour the session layer branches on, and it is otherwise untestable.
 */

import type { WireSocket } from '../../wire/WireSocket.js';

type Listener = (...args: never[]) => void;

export class FakeWebSocket implements WireSocket {
  /** Every frame the server wrote, in order. */
  readonly sent: string[] = [];
  bufferedAmount = 0;
  closed = false;
  closeCode: number | undefined;

  private readonly listeners = new Map<string, Listener[]>();

  send(data: string): void {
    if (this.closed) return;
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    if (this.closed) return;
    this.closed = true;
    this.closeCode = code;
    void reason;
    this.emit('close');
  }

  on(event: 'message', listener: (data: unknown, isBinary: boolean) => void): void;
  on(event: 'close', listener: () => void): void;
  on(event: 'error', listener: (err: Error) => void): void;
  on(event: string, listener: Listener): void {
    const list = this.listeners.get(event) ?? [];
    list.push(listener);
    this.listeners.set(event, list);
  }

  private emit(event: string, ...args: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      (listener as (...a: unknown[]) => void)(...args);
    }
  }

  /** Deliver an inbound chunk as if the peer had sent it. */
  feed(data: string | Buffer): void {
    this.emit('message', data, Buffer.isBuffer(data));
  }

  fail(err: Error): void {
    this.emit('error', err);
  }

  /** Frames sent since the marker, useful for phase-by-phase assertions. */
  sentSince(marker: number): string[] {
    return this.sent.slice(marker);
  }

  clear(): void {
    this.sent.length = 0;
  }
}
