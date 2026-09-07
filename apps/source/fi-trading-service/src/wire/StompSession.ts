/**
 * One client socket: handshake, subscriptions, snapshot pumping, live
 * publishing, teardown.
 *
 * The delivery model matches what the browser transport actually does. It
 * SUBSCRIBEs and then SENDs a separate trigger, so a subscription alone
 * delivers nothing — the trigger is what starts the snapshot. A second
 * trigger on the same stream cancels the in-flight pump and starts over,
 * which is how `restart()` reaches the wire.
 */

import type { RowSource } from '../datasets/RowSource.js';
import {
  CONTENT_TYPE_JSON,
  DESTINATION_ERRORS,
  HEADER,
  LIVE_MAX_ROWS_PER_FRAME,
  LIVE_MIN_ROWS_PER_FRAME,
  LIVE_TICK_MS,
  MESSAGE_TYPE,
  SERVER_HEARTBEAT_MS,
  SERVER_NAME,
  STOMP_VERSION,
  snapshotCompleteBody,
} from './contract.js';
import {
  parseSubscribeDestination,
  parseTriggerDestination,
  triggerMatchesSubscription,
  type SubscribeTarget,
} from './destinations.js';
import { FrameParser, type StompFrame } from './FrameParser.js';
import { HEARTBEAT_FRAME, serializeFrame } from './frameCodec.js';
import { negotiateHeartbeat } from './heartbeat.js';
import { LiveBatcher } from './liveBatcher.js';
import { OutboundQueue } from './OutboundQueue.js';
import { pumpSnapshot } from './SnapshotPump.js';
import { toFrameChunk, type WireSocket } from './WireSocket.js';

export interface SourceResolver {
  /** The source for a subscription, or null if it can't be served. */
  resolve(target: SubscribeTarget): RowSource | null;
}

export interface StompSessionOptions {
  sessionId: string;
  socket: WireSocket;
  resolver: SourceResolver;
  log?: (message: string) => void;
  onClose?: (sessionId: string) => void;
  setInterval?: (cb: () => void, ms: number) => unknown;
  clearInterval?: (handle: unknown) => void;
  now?: () => number;
  yieldToEventLoop?: () => Promise<void>;
}

interface Subscription {
  id: string;
  destination: string;
  target: SubscribeTarget;
  source: RowSource | null;
  batcher: LiveBatcher;
  /** Bumped on every trigger; an in-flight pump with a stale value stops. */
  generation: number;
  snapshotComplete: boolean;
  messageSeq: number;
  updateSeq: number;
  /** Budget granted but not yet spent, carried into the next tick. */
  carry: number;
}

export class StompSession {
  private readonly parser = new FrameParser();
  private readonly queue: OutboundQueue;
  private readonly subs = new Map<string, Subscription>();
  private readonly setIntervalFn: (cb: () => void, ms: number) => unknown;
  private readonly clearIntervalFn: (handle: unknown) => void;
  private readonly now: () => number;
  private readonly yieldToEventLoop: (() => Promise<void>) | undefined;
  private heartbeatTimer: unknown = null;
  private liveTimer: unknown = null;
  private connected = false;
  private closed = false;

  constructor(private readonly options: StompSessionOptions) {
    this.queue = new OutboundQueue(options.socket);
    this.setIntervalFn = options.setInterval ?? ((cb, ms) => setInterval(cb, ms));
    this.clearIntervalFn =
      options.clearInterval ?? ((h) => clearInterval(h as ReturnType<typeof setInterval>));
    this.now = options.now ?? (() => Date.now());
    this.yieldToEventLoop = options.yieldToEventLoop;

    options.socket.on('message', (data) => this.onData(data));
    options.socket.on('close', () => this.close());
    options.socket.on('error', () => this.close());
  }

  get id(): string {
    return this.options.sessionId;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  /** Subscriptions currently registered — for tests and introspection. */
  get subscriptionIds(): string[] {
    return [...this.subs.keys()];
  }

  private log(message: string): void {
    this.options.log?.(`[session ${this.options.sessionId}] ${message}`);
  }

  private onData(data: unknown): void {
    if (this.closed) return;
    let frames: StompFrame[];
    try {
      frames = this.parser.push(toFrameChunk(data));
    } catch (err) {
      this.sendError('Malformed frame', (err as Error).message);
      this.close();
      return;
    }
    for (const frame of frames) this.dispatch(frame);
  }

  private dispatch(frame: StompFrame): void {
    switch (frame.command) {
      case 'CONNECT':
      case 'STOMP':
        this.onConnect(frame);
        return;
      case 'SUBSCRIBE':
        this.onSubscribe(frame);
        return;
      case 'UNSUBSCRIBE':
        this.onUnsubscribe(frame);
        return;
      case 'SEND':
        this.onSend(frame);
        return;
      case 'DISCONNECT':
        this.onDisconnect(frame);
        return;
      default:
        this.sendError('Unsupported command', `Command '${frame.command}' is not supported`);
    }
  }

  private onConnect(frame: StompFrame): void {
    const beat = negotiateHeartbeat(
      frame.headers['heart-beat'],
      SERVER_HEARTBEAT_MS,
      SERVER_HEARTBEAT_MS,
    );
    this.connected = true;
    // CONNECTED headers travel unescaped, per the spec and the client parser.
    this.queue.write(
      serializeFrame('CONNECTED', {
        version: STOMP_VERSION,
        session: this.options.sessionId,
        server: SERVER_NAME,
        'heart-beat': `${SERVER_HEARTBEAT_MS},${SERVER_HEARTBEAT_MS}`,
      }),
    );
    if (beat.sendEveryMs > 0) {
      this.heartbeatTimer = this.setIntervalFn(() => {
        if (!this.closed) this.queue.write(HEARTBEAT_FRAME);
      }, beat.sendEveryMs);
    }
    this.log(`connected, heartbeat every ${beat.sendEveryMs}ms`);
  }

  private onSubscribe(frame: StompFrame): void {
    const id = frame.headers['id'];
    const destination = frame.headers[HEADER.destination];
    if (id === undefined || destination === undefined) {
      this.sendError('Bad SUBSCRIBE', 'SUBSCRIBE needs both id and destination headers');
      return;
    }
    const parsed = parseSubscribeDestination(destination);
    if (!parsed.ok) {
      this.sendError('Bad destination', parsed.error);
      return;
    }
    const target = parsed.value;
    this.subs.set(id, {
      id,
      destination,
      target,
      source: this.options.resolver.resolve(target),
      batcher: new LiveBatcher(0),
      generation: 0,
      snapshotComplete: false,
      messageSeq: 0,
      updateSeq: 0,
      carry: 0,
    });
    this.log(`subscribed ${id} -> ${destination}`);
  }

  private onUnsubscribe(frame: StompFrame): void {
    const id = frame.headers['id'];
    if (id === undefined) return;
    const sub = this.subs.get(id);
    if (sub !== undefined) sub.generation += 1;
    this.subs.delete(id);
    if (this.subs.size === 0) this.stopLiveTimer();
    this.log(`unsubscribed ${id}`);
  }

  private onDisconnect(frame: StompFrame): void {
    const receipt = frame.headers[HEADER.receipt];
    if (receipt !== undefined) {
      this.queue.write(serializeFrame('RECEIPT', { [HEADER.receiptId]: receipt }));
    }
    this.close();
  }

  private onSend(frame: StompFrame): void {
    const destination = frame.headers[HEADER.destination];
    if (destination === undefined) {
      this.sendError('Bad SEND', 'SEND needs a destination header');
      return;
    }
    // Some configs put the trigger path in the body rather than the
    // destination, so honour whichever looks like one.
    const body = frame.body.trim();
    const requestPath = body.startsWith('/snapshot/') ? body : destination;

    const parsed = parseTriggerDestination(requestPath);
    if (!parsed.ok) {
      this.sendError('Bad trigger', parsed.error);
      return;
    }
    const trigger = parsed.value;
    const sub = [...this.subs.values()].find((s) => triggerMatchesSubscription(trigger, s.target));
    if (sub === undefined) {
      this.sendError(
        'No subscription',
        `Trigger ${requestPath} has no matching subscription. Subscribe first.`,
      );
      return;
    }
    if (sub.source === null) {
      this.sendError('No source', `Dataset '${trigger.dataset}' has no source registered`);
      return;
    }

    sub.generation += 1;
    sub.snapshotComplete = false;
    sub.carry = 0;
    sub.batcher = new LiveBatcher(trigger.rate);
    void this.runSnapshot(sub, sub.generation, trigger.batchSize);
  }

  private async runSnapshot(
    sub: Subscription,
    generation: number,
    batchSize: number,
  ): Promise<void> {
    const source = sub.source;
    if (source === null) return;
    try {
      const result = await pumpSnapshot({
        source,
        queue: this.queue,
        batchSize,
        isCancelled: () => this.closed || sub.generation !== generation,
        sendBatch: (rows, batchNumber) => this.sendRows(sub, rows, MESSAGE_TYPE.snapshot, batchNumber),
        sendComplete: (rowCount) => {
          this.queue.write(
            serializeFrame(
              'MESSAGE',
              {
                [HEADER.subscription]: sub.id,
                [HEADER.messageId]: `m-${sub.messageSeq++}`,
                [HEADER.destination]: sub.destination,
                [HEADER.messageType]: MESSAGE_TYPE.snapshotComplete,
                [HEADER.clientId]: sub.target.clientId,
              },
              snapshotCompleteBody(sub.target.dataset, rowCount, sub.target.clientId),
            ),
          );
        },
        ...(this.yieldToEventLoop !== undefined
          ? { yieldToEventLoop: this.yieldToEventLoop }
          : {}),
      });
      if (result.cancelled) {
        this.log(`snapshot gen ${generation} cancelled after ${result.rowsSent} rows`);
        return;
      }
      sub.snapshotComplete = true;
      sub.batcher.reset(this.now());
      this.log(`snapshot delivered ${result.rowsSent} rows in ${result.batchesSent} frames`);
      // A historical (as-of-date) stream is snapshot-only by contract.
      if (sub.target.asOfDate === null && sub.batcher.rate > 0) this.startLiveTimer();
    } catch (err) {
      this.sendError('Snapshot failed', (err as Error).message);
    }
  }

  private startLiveTimer(): void {
    if (this.liveTimer !== null || this.closed) return;
    this.liveTimer = this.setIntervalFn(() => this.onLiveTick(), LIVE_TICK_MS);
  }

  private stopLiveTimer(): void {
    if (this.liveTimer === null) return;
    this.clearIntervalFn(this.liveTimer);
    this.liveTimer = null;
  }

  /** Public so a server-owned scheduler can drive ticks instead of a timer. */
  onLiveTick(): void {
    if (this.closed || this.queue.backedUp()) return;
    const nowMs = this.now();
    for (const sub of this.subs.values()) {
      if (!sub.snapshotComplete || sub.source === null) continue;
      // Unspent budget carries: a tick that emits nothing because it was
      // under the frame floor, or because the socket was busy, must not
      // silently drop the rows it was owed or the stream runs slow.
      const budget = sub.batcher.take(nowMs) + sub.carry;
      sub.carry = this.publishLive(sub, budget);
      const ceiling = Math.max(sub.batcher.rate, LIVE_MAX_ROWS_PER_FRAME);
      if (sub.carry > ceiling) sub.carry = ceiling;
    }
  }

  /** Publish up to `budget` rows. Returns the budget left unspent. */
  private publishLive(sub: Subscription, budget: number): number {
    const source = sub.source;
    if (source === null || budget <= 0) return budget;
    const pending = source.pendingLive();
    if (pending === 0) return 0;

    let remaining = Math.min(budget, pending);
    // Below the floor, hold the budget rather than emitting a tiny frame —
    // unless that is genuinely all there is left to send.
    if (remaining < LIVE_MIN_ROWS_PER_FRAME && remaining < pending) return budget;

    let unspent = budget - remaining;
    while (remaining > 0 && !this.queue.backedUp()) {
      const take = Math.min(remaining, LIVE_MAX_ROWS_PER_FRAME);
      const rows = source.drainLive(take);
      if (rows.length === 0) break;
      this.sendRows(sub, rows, MESSAGE_TYPE.liveUpdate, sub.updateSeq++);
      remaining -= rows.length;
    }
    return unspent + remaining;
  }

  private sendRows(
    sub: Subscription,
    rows: readonly unknown[],
    messageType: string,
    sequence: number,
  ): void {
    const isSnapshot = messageType === MESSAGE_TYPE.snapshot;
    this.queue.write(
      serializeFrame(
        'MESSAGE',
        {
          [HEADER.subscription]: sub.id,
          [HEADER.messageId]: `m-${sub.messageSeq++}`,
          [HEADER.destination]: sub.destination,
          [HEADER.contentType]: CONTENT_TYPE_JSON,
          [HEADER.messageType]: messageType,
          [isSnapshot ? HEADER.batchNumber : HEADER.updateNumber]: sequence,
          [HEADER.clientId]: sub.target.clientId,
        },
        JSON.stringify(rows),
      ),
    );
  }

  private sendError(short: string, detail: string): void {
    this.log(`error: ${short} — ${detail}`);
    this.queue.write(serializeFrame('ERROR', { message: short }, detail));
    // Also surface it on the errors topic, which the reference wire uses.
    this.queue.write(
      serializeFrame('MESSAGE', { [HEADER.destination]: DESTINATION_ERRORS }, detail),
    );
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.stopLiveTimer();
    if (this.heartbeatTimer !== null) {
      this.clearIntervalFn(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    for (const sub of this.subs.values()) sub.generation += 1;
    this.subs.clear();
    this.queue.close();
    try {
      this.options.socket.close();
    } catch {
      // Already gone; nothing to do.
    }
    this.options.onClose?.(this.options.sessionId);
  }
}
