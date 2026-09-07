/**
 * The slice of a WebSocket this service actually uses.
 *
 * Depending on this rather than on `ws.WebSocket` keeps `StompSession` and
 * everything under it free of the transport, so the whole protocol layer is
 * testable against an in-memory double with no network and no `ws` import.
 * `StompServer` is the only module that adapts a real socket to this shape.
 */
export interface WireSocket {
  /** Bytes queued in the kernel/library but not yet flushed to the peer. */
  readonly bufferedAmount: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: 'message', listener: (data: unknown, isBinary: boolean) => void): void;
  on(event: 'close', listener: () => void): void;
  on(event: 'error', listener: (err: Error) => void): void;
}

/** Coerce whatever `ws` hands a message listener into a string or Buffer. */
export function toFrameChunk(data: unknown): Buffer | string {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (Array.isArray(data)) return Buffer.concat(data as Buffer[]);
  if (ArrayBuffer.isView(data)) {
    const view = data as ArrayBufferView;
    return Buffer.from(view.buffer, view.byteOffset, view.byteLength);
  }
  return String(data);
}
