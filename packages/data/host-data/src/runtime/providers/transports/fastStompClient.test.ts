import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FastStompClient } from './fastStompClient.js';

/** Minimal WebSocket stand-in the client drives; tests fire its events. */
class FakeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  url: string;
  binaryType = 'blob';
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((evt: { data: string | ArrayBuffer }) => void) | null = null;
  onerror: ((evt: unknown) => void) | null = null;
  onclose: ((evt?: unknown) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }
  send(data: string): void {
    if (this.readyState !== FakeWebSocket.OPEN) throw new Error('not open');
    this.sent.push(data);
  }
  close(): void {
    if (this.readyState === FakeWebSocket.CLOSED) return;
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.({});
  }
  // Test drivers:
  serverOpen(): void { this.readyState = FakeWebSocket.OPEN; this.onopen?.(); }
  serverFrame(text: string): void { this.onmessage?.({ data: text }); }
  serverDrop(): void { this.readyState = FakeWebSocket.CLOSED; this.onclose?.({}); }
}

const CONNECTED = 'CONNECTED\nversion:1.2\nheart-beat:0,0\n\n\0';

function makeClient(overrides: Partial<ConstructorParameters<typeof FastStompClient>[0]> = {}) {
  return new FastStompClient({
    brokerURL: 'ws://localhost:8081',
    reconnectDelay: 500,
    heartbeatIncoming: 0,
    heartbeatOutgoing: 0,
    ...overrides,
  });
}

function lastWs(): FakeWebSocket {
  return FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
}

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('FastStompClient', () => {
  it('dials on activate, sends CONNECT on open, fires onConnect on CONNECTED', () => {
    const client = makeClient({ heartbeatIncoming: 4000, heartbeatOutgoing: 4000 });
    const onConnect = vi.fn();
    client.onConnect = onConnect;
    client.activate();

    const ws = lastWs();
    expect(ws.binaryType).toBe('arraybuffer');
    ws.serverOpen();
    expect(ws.sent[0]).toContain('CONNECT\n');
    expect(ws.sent[0]).toContain('accept-version:1.0,1.1,1.2\n');
    expect(ws.sent[0]).toContain('heart-beat:4000,4000\n');
    expect(ws.sent[0]).toContain('host:localhost:8081\n');

    ws.serverFrame(CONNECTED);
    expect(client.connected).toBe(true);
    expect(onConnect).toHaveBeenCalledTimes(1);
  });

  it('subscribes after CONNECTED and routes MESSAGE frames by subscription id', () => {
    const client = makeClient();
    client.activate();
    const ws = lastWs();

    const seen: string[] = [];
    client.subscribe('/snapshot/x', (msg) => seen.push(msg.body));

    ws.serverOpen();
    expect(ws.sent.some((f) => f.startsWith('SUBSCRIBE'))).toBe(false); // not yet connected
    ws.serverFrame(CONNECTED);
    const subFrame = ws.sent.find((f) => f.startsWith('SUBSCRIBE'))!;
    expect(subFrame).toContain('destination:/snapshot/x\n');
    const id = /id:(sub-\d+)/.exec(subFrame)![1];

    ws.serverFrame(`MESSAGE\nsubscription:${id}\ndestination:/snapshot/x\n\nhello\0`);
    expect(seen).toEqual(['hello']);
  });

  it('unsubscribe sends UNSUBSCRIBE and stops routing', () => {
    const client = makeClient();
    client.activate();
    const ws = lastWs();
    const seen: string[] = [];
    const sub = client.subscribe('/d', (m) => seen.push(m.body));
    ws.serverOpen();
    ws.serverFrame(CONNECTED);
    const id = /id:(sub-\d+)/.exec(ws.sent.find((f) => f.startsWith('SUBSCRIBE'))!)![1];

    sub.unsubscribe();
    expect(ws.sent.some((f) => f.startsWith('UNSUBSCRIBE') && f.includes(`id:${id}`))).toBe(true);
    ws.serverFrame(`MESSAGE\nsubscription:${id}\n\nlate\0`);
    expect(seen).toEqual([]);
  });

  it('publish sends SEND with content-length; throws when not connected', () => {
    const client = makeClient();
    expect(() => client.publish({ destination: '/t', body: 'x' })).toThrow();

    client.activate();
    const ws = lastWs();
    ws.serverOpen();
    ws.serverFrame(CONNECTED);
    client.publish({ destination: '/snapshot/positions/T/1000/50', body: '' });
    const sendFrame = ws.sent.find((f) => f.startsWith('SEND'))!;
    expect(sendFrame).toContain('destination:/snapshot/positions/T/1000/50\n');
    expect(sendFrame.endsWith('\n\0')).toBe(true);
  });

  it('surfaces broker ERROR frames via onStompError', () => {
    const client = makeClient();
    const onStompError = vi.fn();
    client.onStompError = onStompError;
    client.activate();
    const ws = lastWs();
    ws.serverOpen();
    ws.serverFrame('ERROR\nmessage:bad destination\n\ndetails\0');
    expect(onStompError).toHaveBeenCalledWith(
      expect.objectContaining({ headers: expect.objectContaining({ message: 'bad destination' }) }),
    );
  });

  it('fires onDisconnect on connection loss and redials after reconnectDelay, re-subscribing', () => {
    vi.useFakeTimers();
    const client = makeClient({ reconnectDelay: 500 });
    const onDisconnect = vi.fn();
    client.onDisconnect = onDisconnect;
    client.activate();
    client.subscribe('/d', () => {});

    const ws1 = lastWs();
    ws1.serverOpen();
    ws1.serverFrame(CONNECTED);
    expect(FakeWebSocket.instances).toHaveLength(1);

    ws1.serverDrop();
    expect(onDisconnect).toHaveBeenCalledTimes(1);
    expect(client.connected).toBe(false);

    vi.advanceTimersByTime(500);
    expect(FakeWebSocket.instances).toHaveLength(2);
    const ws2 = lastWs();
    ws2.serverOpen();
    ws2.serverFrame(CONNECTED);
    // Existing subscription re-established on the new session.
    expect(ws2.sent.some((f) => f.startsWith('SUBSCRIBE') && f.includes('destination:/d'))).toBe(true);
  });

  it('honours reconnectDelay=0 set post-construction (teardown semantics): no redial', () => {
    vi.useFakeTimers();
    const client = makeClient({ reconnectDelay: 500 });
    client.activate();
    const ws = lastWs();
    ws.serverOpen();
    ws.serverFrame(CONNECTED);

    client.reconnectDelay = 0;
    ws.serverDrop();
    vi.advanceTimersByTime(5_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('deactivate sends DISCONNECT, closes, resolves, and never redials', async () => {
    vi.useFakeTimers();
    const client = makeClient({ reconnectDelay: 500 });
    client.activate();
    const ws = lastWs();
    ws.serverOpen();
    ws.serverFrame(CONNECTED);

    const p = client.deactivate();
    expect(ws.sent.some((f) => f.startsWith('DISCONNECT'))).toBe(true);
    await p;
    expect(client.connected).toBe(false);
    vi.advanceTimersByTime(5_000);
    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it('negotiated outgoing heart-beats send LF on the interval', () => {
    vi.useFakeTimers();
    const client = makeClient({ heartbeatOutgoing: 1000, heartbeatIncoming: 0 });
    client.activate();
    const ws = lastWs();
    ws.serverOpen();
    // Server wants heart-beats every 2000ms (its sy) → negotiated max(1000, 2000).
    ws.serverFrame('CONNECTED\nversion:1.2\nheart-beat:0,2000\n\n\0');

    vi.advanceTimersByTime(2_000);
    expect(ws.sent.filter((f) => f === '\n')).toHaveLength(1);
    vi.advanceTimersByTime(4_000);
    expect(ws.sent.filter((f) => f === '\n')).toHaveLength(3);
  });

  it('incoming heart-beat watchdog closes a silent socket (triggering redial path)', () => {
    vi.useFakeTimers();
    const client = makeClient({ heartbeatIncoming: 1000, heartbeatOutgoing: 0, reconnectDelay: 250 });
    client.activate();
    const ws = lastWs();
    ws.serverOpen();
    // Server sends every 1000ms (its sx) → we expect activity within 2×.
    ws.serverFrame('CONNECTED\nversion:1.2\nheart-beat:1000,0\n\n\0');

    // Silence beyond 2 intervals → watchdog closes → redial scheduled.
    vi.advanceTimersByTime(3_100);
    expect(ws.readyState).toBe(FakeWebSocket.CLOSED);
    vi.advanceTimersByTime(250);
    expect(FakeWebSocket.instances).toHaveLength(2);
  });

  it('server declining heart-beats (0,0) starts no timers', () => {
    vi.useFakeTimers();
    const client = makeClient({ heartbeatIncoming: 4000, heartbeatOutgoing: 4000 });
    client.activate();
    const ws = lastWs();
    ws.serverOpen();
    ws.serverFrame(CONNECTED); // heart-beat:0,0
    vi.advanceTimersByTime(60_000);
    expect(ws.sent.filter((f) => f === '\n')).toHaveLength(0);
    expect(ws.readyState).toBe(FakeWebSocket.OPEN);
  });

  it('pre-connect socket error surfaces via onWebSocketError', () => {
    const client = makeClient();
    const onWebSocketError = vi.fn();
    client.onWebSocketError = onWebSocketError;
    client.activate();
    lastWs().onerror?.({ type: 'error' });
    expect(onWebSocketError).toHaveBeenCalled();
  });
});
