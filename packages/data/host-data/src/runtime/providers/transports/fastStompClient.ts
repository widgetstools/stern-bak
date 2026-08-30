/**
 * fastStompClient — minimal STOMP 1.2 client over WebSocket, built on
 * {@link FastStompFrameParser}'s vectorized frame parsing.
 *
 * Purpose-built drop-in for the `StompClient` structural interface the
 * transports in `stomp.ts` consume (the same shape their tests inject),
 * replacing @stomp/stompjs on the hot data path — stompjs's per-byte
 * parser cost ~30% of the SharedWorker at streaming rates (see the
 * parser's module doc). Feature surface is deliberately the subset the
 * platform uses:
 *
 *   • CONNECT/CONNECTED handshake (accept-version 1.0,1.1,1.2 + host)
 *   • SUBSCRIBE / UNSUBSCRIBE with MESSAGE routing by subscription id
 *   • SEND (publish) with content-length
 *   • heart-beats: negotiated per spec (max of client/server asks; 0
 *     disables); outgoing LF on a timer, incoming watchdog closes the
 *     socket after 2 missed intervals so a dead TCP peer surfaces as a
 *     reconnect instead of a silent stall
 *   • auto-redial after `reconnectDelay` ms (live property — teardown
 *     sets it to 0 to disable, matching stompjs semantics the
 *     transport relies on)
 *   • deactivate(): graceful DISCONNECT + close (force skips the
 *     DISCONNECT frame), resolves on close or a 2s timeout
 *
 * NOT implemented (unused by the platform): transactions, acks/nacks,
 * receipts, RFC-6455 subprotocol negotiation beyond default.
 * Callback semantics match what `stomp.ts` wires: `onConnect` after
 * CONNECTED; `onDisconnect` on connection loss after a successful
 * connect; `onWebSocketError` on socket errors and on pre-connect
 * closes; `onStompError` for broker ERROR frames.
 */

import { FastStompFrameParser, serializeFrame, type StompFrame } from './fastStompParser.js';

export interface FastStompClientCfg {
  brokerURL: string;
  reconnectDelay: number;
  heartbeatIncoming: number;
  heartbeatOutgoing: number;
  debug?: (msg: string) => void;
}

interface Subscription {
  id: string;
  destination: string;
  cb: (msg: { body: string; headers: Record<string, string> }) => void;
}

const DEACTIVATE_CLOSE_TIMEOUT_MS = 2_000;

export class FastStompClient {
  connected = false;
  reconnectDelay: number;
  onConnect: (() => void) | undefined;
  onStompError: ((frame: { headers: Record<string, string> }) => void) | undefined;
  onWebSocketError: ((event: unknown) => void) | undefined;
  onDisconnect: (() => void) | undefined;

  private readonly cfg: FastStompClientCfg;
  private ws: WebSocket | null = null;
  private parser: FastStompFrameParser;
  private readonly subs = new Map<string, Subscription>();
  private nextSubId = 0;
  private deactivated = false;
  private hadSuccessfulConnect = false;
  private redialTimer: ReturnType<typeof setTimeout> | null = null;
  private outgoingHbTimer: ReturnType<typeof setInterval> | null = null;
  private incomingWatchdog: ReturnType<typeof setInterval> | null = null;
  private lastServerActivity = 0;

  constructor(cfg: FastStompClientCfg) {
    this.cfg = cfg;
    this.reconnectDelay = cfg.reconnectDelay;
    this.parser = new FastStompFrameParser({
      onFrame: (f) => this.handleFrame(f),
      onHeartbeat: () => { this.lastServerActivity = Date.now(); },
    });
  }

  private debug(msg: string): void {
    this.cfg.debug?.(`[fast-stomp] ${msg}`);
  }

  activate(): void {
    this.deactivated = false;
    this.dial();
  }

  private dial(): void {
    if (this.deactivated) return;
    this.debug(`dial ${this.cfg.brokerURL}`);
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.cfg.brokerURL);
    } catch (err) {
      this.onWebSocketError?.(err);
      this.scheduleRedial();
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    this.parser.reset();

    ws.onopen = () => {
      let host = 'localhost';
      try { host = new URL(this.cfg.brokerURL).host || host; } catch { /* keep default */ }
      // CONNECT headers are exempt from value escaping per spec.
      ws.send(serializeFrame('CONNECT', {
        'accept-version': '1.0,1.1,1.2',
        host,
        'heart-beat': `${this.cfg.heartbeatOutgoing},${this.cfg.heartbeatIncoming}`,
      }));
    };
    ws.onmessage = (evt) => {
      this.lastServerActivity = Date.now();
      try {
        this.parser.feed(evt.data as string | ArrayBuffer);
      } catch (err) {
        this.debug(`parse failure — closing socket: ${String(err)}`);
        this.onWebSocketError?.(err);
        try { ws.close(); } catch { /* already closing */ }
      }
    };
    ws.onerror = (evt) => {
      this.onWebSocketError?.(evt);
    };
    ws.onclose = () => {
      const wasConnected = this.connected;
      this.connected = false;
      this.stopHeartbeats();
      this.ws = null;
      if (this.deactivated) return;
      if (wasConnected || this.hadSuccessfulConnect) {
        this.onDisconnect?.();
      }
      this.scheduleRedial();
    };
  }

  private scheduleRedial(): void {
    if (this.deactivated || this.redialTimer !== null) return;
    // Read the LIVE property at both schedule and fire time — teardown
    // zeroes it to cancel auto-reconnect on an already-closing client.
    const delay = this.reconnectDelay;
    if (!(delay > 0)) return;
    this.redialTimer = setTimeout(() => {
      this.redialTimer = null;
      if (this.deactivated || !(this.reconnectDelay > 0)) return;
      this.dial();
    }, delay);
  }

  private handleFrame(frame: StompFrame): void {
    switch (frame.command) {
      case 'CONNECTED': {
        this.connected = true;
        this.hadSuccessfulConnect = true;
        this.negotiateHeartbeats(frame.headers['heart-beat']);
        // Redial path: re-establish existing subscriptions on the new
        // session before announcing the connect.
        for (const sub of this.subs.values()) {
          this.sendSubscribe(sub);
        }
        this.debug(`CONNECTED version=${frame.headers['version'] ?? '?'}`);
        this.onConnect?.();
        return;
      }
      case 'MESSAGE': {
        const sub = frame.headers['subscription'] !== undefined
          ? this.subs.get(frame.headers['subscription'])
          : undefined;
        if (sub) {
          sub.cb({ body: frame.body, headers: frame.headers });
        } else {
          // Late frame for an unsubscribed id, or a broker that omits
          // the subscription header: fall back to destination match.
          for (const s of this.subs.values()) {
            if (s.destination === frame.headers['destination']) {
              s.cb({ body: frame.body, headers: frame.headers });
              return;
            }
          }
        }
        return;
      }
      case 'ERROR': {
        this.debug(`ERROR frame: ${frame.headers['message'] ?? frame.body.slice(0, 200)}`);
        this.onStompError?.({ headers: frame.headers });
        // Per spec the server closes after ERROR; onclose handles redial.
        return;
      }
      case 'RECEIPT':
        return; // receipts unused
      default:
        this.debug(`ignoring unexpected frame '${frame.command}'`);
    }
  }

  private negotiateHeartbeats(serverHeartBeat: string | undefined): void {
    this.stopHeartbeats();
    const [serverOutRaw, serverInRaw] = (serverHeartBeat ?? '0,0').split(',');
    const serverOut = Number.parseInt(serverOutRaw ?? '0', 10) || 0; // what server SENDS
    const serverIn = Number.parseInt(serverInRaw ?? '0', 10) || 0;   // what server WANTS

    // We send: only if we offered (cfg.heartbeatOutgoing) AND server wants.
    const sendEvery = this.cfg.heartbeatOutgoing > 0 && serverIn > 0
      ? Math.max(this.cfg.heartbeatOutgoing, serverIn)
      : 0;
    // We expect: only if we asked (cfg.heartbeatIncoming) AND server sends.
    const expectEvery = this.cfg.heartbeatIncoming > 0 && serverOut > 0
      ? Math.max(this.cfg.heartbeatIncoming, serverOut)
      : 0;

    if (sendEvery > 0) {
      this.outgoingHbTimer = setInterval(() => {
        try { this.ws?.send('\n'); } catch { /* socket mid-close */ }
      }, sendEvery);
    }
    if (expectEvery > 0) {
      this.lastServerActivity = Date.now();
      this.incomingWatchdog = setInterval(() => {
        if (Date.now() - this.lastServerActivity > expectEvery * 2) {
          this.debug('heart-beat watchdog: no server activity — closing socket');
          try { this.ws?.close(); } catch { /* already closing */ }
        }
      }, expectEvery);
    }
  }

  private stopHeartbeats(): void {
    if (this.outgoingHbTimer !== null) { clearInterval(this.outgoingHbTimer); this.outgoingHbTimer = null; }
    if (this.incomingWatchdog !== null) { clearInterval(this.incomingWatchdog); this.incomingWatchdog = null; }
  }

  subscribe(
    destination: string,
    cb: (msg: { body: string; headers: Record<string, string> }) => void,
  ): { unsubscribe(): void } {
    const id = `sub-${this.nextSubId++}`;
    const sub: Subscription = { id, destination, cb };
    this.subs.set(id, sub);
    if (this.connected) this.sendSubscribe(sub);
    return {
      unsubscribe: () => {
        if (!this.subs.delete(id)) return;
        if (this.connected) {
          try { this.ws?.send(serializeFrame('UNSUBSCRIBE', { id })); } catch { /* mid-close */ }
        }
      },
    };
  }

  private sendSubscribe(sub: Subscription): void {
    try {
      this.ws?.send(serializeFrame('SUBSCRIBE', {
        id: sub.id,
        destination: sub.destination,
        ack: 'auto',
      }));
    } catch { /* socket mid-close — redial re-subscribes */ }
  }

  publish(params: { destination: string; body?: string }): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('[fast-stomp] publish() while not connected');
    }
    this.ws.send(serializeFrame('SEND', { destination: params.destination }, params.body ?? ''));
  }

  deactivate(options?: { force?: boolean }): Promise<void> {
    this.deactivated = true;
    if (this.redialTimer !== null) { clearTimeout(this.redialTimer); this.redialTimer = null; }
    this.stopHeartbeats();
    const ws = this.ws;
    this.connected = false;
    if (!ws || ws.readyState === WebSocket.CLOSED) {
      this.ws = null;
      return Promise.resolve();
    }
    if (!options?.force && ws.readyState === WebSocket.OPEN) {
      try { ws.send(serializeFrame('DISCONNECT', {})); } catch { /* mid-close */ }
    }
    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => resolve(), DEACTIVATE_CLOSE_TIMEOUT_MS);
      const prevOnClose = ws.onclose;
      ws.onclose = (evt) => {
        clearTimeout(timeout);
        try { (prevOnClose as ((e: unknown) => void) | null)?.call(ws, evt); } catch { /* handler */ }
        resolve();
      };
      try { ws.close(); } catch { clearTimeout(timeout); resolve(); }
    });
  }
}
