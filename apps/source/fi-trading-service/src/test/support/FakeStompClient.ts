/**
 * A client that speaks the wire the way the real one does.
 *
 * It decodes server frames with the ACTUAL parser the browser transport uses
 * — imported straight from the platform source tree rather than reimplemented
 * here. That is the point: it turns every session test into a compatibility
 * test, so "the existing browser transport consumes this with zero client
 * changes" is checked rather than asserted.
 *
 * The deep relative import is deliberate. `fastStompParser` is internal to
 * `@wellsfargo-starui/data` (not in its `exports` map), and vendoring a copy
 * would defeat the whole purpose — a copy can drift, and the drift would be
 * invisible exactly when it mattered. Test-only, and it never reaches the
 * build tsconfig.
 */

import {
  FastStompFrameParser,
  type StompFrame,
} from '../../../../../../packages/data/host-data/src/runtime/providers/transports/fastStompParser.js';

import { serializeFrame } from '../../wire/frameCodec.js';
import type { FakeWebSocket } from './FakeWebSocket.js';

export type { StompFrame };

export class FakeStompClient {
  readonly frames: StompFrame[] = [];
  heartbeats = 0;
  private consumed = 0;
  private subSeq = 0;

  private readonly parser = new FastStompFrameParser({
    onFrame: (frame) => this.frames.push(frame),
    onHeartbeat: () => {
      this.heartbeats += 1;
    },
  });

  constructor(private readonly socket: FakeWebSocket) {}

  /** Feed everything the server has written since the last pump. */
  pump(): this {
    const pending = this.socket.sent.slice(this.consumed);
    this.consumed = this.socket.sent.length;
    for (const frame of pending) this.parser.feed(frame);
    return this;
  }

  connect(heartbeat = '4000,4000'): this {
    this.socket.feed(
      serializeFrame('CONNECT', {
        'accept-version': '1.0,1.1,1.2',
        host: 'localhost',
        'heart-beat': heartbeat,
      }),
    );
    return this;
  }

  subscribe(destination: string, id = `sub-${this.subSeq++}`): string {
    this.socket.feed(serializeFrame('SUBSCRIBE', { id, destination, ack: 'auto' }));
    return id;
  }

  /** Send the trigger. `body` mirrors the client's `requestBody`. */
  trigger(destination: string, body = 'START'): this {
    this.socket.feed(serializeFrame('SEND', { destination }, body));
    return this;
  }

  unsubscribe(id: string): this {
    this.socket.feed(serializeFrame('UNSUBSCRIBE', { id }));
    return this;
  }

  disconnect(receipt?: string): this {
    this.socket.feed(serializeFrame('DISCONNECT', receipt === undefined ? {} : { receipt }));
    return this;
  }

  /**
   * Forget everything decoded so far and resync to the socket's current
   * position. Use this instead of clearing the socket: clearing `sent` alone
   * would leave this client's read cursor past the end of the array, and it
   * would then silently decode nothing.
   */
  reset(): this {
    this.frames.length = 0;
    this.heartbeats = 0;
    this.consumed = this.socket.sent.length;
    return this;
  }

  /** Send a raw string, for malformed-input tests. */
  raw(text: string): this {
    this.socket.feed(text);
    return this;
  }

  byCommand(command: string): StompFrame[] {
    return this.frames.filter((f) => f.command === command);
  }

  byMessageType(messageType: string): StompFrame[] {
    return this.frames.filter((f) => f.headers['message-type'] === messageType);
  }

  /** Rows across every frame of a given message-type, in arrival order. */
  rowsOf(messageType: string): unknown[] {
    const out: unknown[] = [];
    for (const frame of this.byMessageType(messageType)) {
      const parsed: unknown = JSON.parse(frame.body);
      if (Array.isArray(parsed)) out.push(...parsed);
    }
    return out;
  }
}
