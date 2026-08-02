import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest';
import type { WebSocket } from 'ws';
import type { AppConfig } from '../config.js';
import { StompConnection } from './connection.js';

// Omit bufferedAmount so the mock's copy is writable — the real ws type
// declares it readonly, but the backpressure tests drive it directly.
type MockWebSocket = Omit<WebSocket, 'bufferedAmount'> & {
  bufferedAmount: number;
  sent: string[];
  handlers: Record<string, Array<(...args: unknown[]) => void>>;
  emit: (event: string, ...args: unknown[]) => void;
};

function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 8081,
    nodeEnv: 'test',
    rowProfile: 'slim',
    defaultSnapshotRows: 20,
    minSnapshotRows: 10,
    maxSnapshotRows: 100,
    liveTickMs: 40,
    maxRowsPerFrame: 50,
    maxLiveRowsPerSec: 1000,
    defaultLiveMode: 'legacy',
    debug: true,
    logOutbound: true,
    logLiveEvery: 2,
    logBodyPreviewChars: 80,
    ...overrides,
  };
}

function stompFrame(
  command: string,
  headers: Record<string, string> = {},
  body = '',
): string {
  let frame = `${command}\n`;
  for (const [key, value] of Object.entries(headers)) {
    frame += `${key}:${value}\n`;
  }
  frame += '\n';
  if (body) frame += body;
  return frame;
}

function createMockWs(): MockWebSocket {
  const handlers: Record<string, Array<(...args: unknown[]) => void>> = {};
  const sent: string[] = [];
  const ws = {
    sent,
    handlers,
    bufferedAmount: 0,
    send: vi.fn((frame: string) => {
      sent.push(frame);
    }) as Mock<(frame: string) => void>,
    close: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      (handlers[event] ??= []).push(handler);
    }),
    emit(event: string, ...args: unknown[]) {
      for (const handler of handlers[event] ?? []) handler(...args);
    },
  };
  return ws as unknown as MockWebSocket;
}

function parseSentFrame(frame: string) {
  const normalized = frame.replace(/\r\n/g, '\n').replace(/\0$/, '');
  const lines = normalized.split('\n');
  const command = lines[0] ?? '';
  const headers: Record<string, string> = {};
  let bodyStart = 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '') {
      bodyStart = i + 1;
      break;
    }
    const line = lines[i] ?? '';
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    headers[line.slice(0, idx)] = line.slice(idx + 1);
  }
  const body = lines.slice(bodyStart).join('\n');
  return { command, headers, body };
}

function createConnection(configOverrides: Partial<AppConfig> = {}) {
  const ws = createMockWs();
  const clients = new Map<number, StompConnection>();
  const config = testConfig(configOverrides);
  const conn = new StompConnection(ws, 42, config, clients);
  clients.set(42, conn);
  return { ws, conn, clients, config };
}

async function flushAsyncWork(rounds = 8) {
  for (let i = 0; i < rounds; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

async function runTimersAndFlush() {
  await vi.runOnlyPendingTimersAsync();
  await flushAsyncWork();
}

describe('StompConnection', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'setInterval', 'Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('handles CONNECT and STOMP commands', () => {
    const { conn, ws } = createConnection();
    conn.handleFrame(stompFrame('CONNECT'));
    expect(conn.connected).toBe(true);
    expect(parseSentFrame(ws.sent[0]!).command).toBe('CONNECTED');

    ws.sent.length = 0;
    conn.handleFrame(stompFrame('STOMP'));
    expect(parseSentFrame(ws.sent[0]!).command).toBe('CONNECTED');
  });

  it('subscribes and stores subscription metadata', () => {
    const { conn } = createConnection();
    conn.handleFrame(
      stompFrame('SUBSCRIBE', {
        destination: '/snapshot/positions/C1',
        id: 'sub-1',
        ack: 'client',
      }),
    );
    expect(conn.subscriptions.get('sub-1')).toMatchObject({
      destination: '/snapshot/positions/C1',
      ack: 'client',
    });
  });

  it('parses case-insensitive snapshot row headers', () => {
    const { conn, ws } = createConnection();
    conn.handleFrame(stompFrame('CONNECT'));
    conn.handleFrame(
      stompFrame('SUBSCRIBE', {
        destination: '/snapshot/positions/C1',
        id: 'sub-rows',
      }),
    );

    ws.sent.length = 0;
    conn.handleFrame(
      stompFrame(
        'SEND',
        { destination: 'ignored', 'Snapshot-Rows': '15', 'live-mode': 'sparse' },
        '/snapshot/positions/C1/0/5',
      ),
    );

    const snapshot = ws.sent.find((f) => parseSentFrame(f).headers['message-type'] === 'snapshot');
    expect(snapshot).toBeDefined();
    const body = JSON.parse(parseSentFrame(snapshot!).body);
    expect(body.length).toBeLessThanOrEqual(15);
  });

  it('delivers client-specific snapshot and live updates', async () => {
    const { conn, ws } = createConnection({ logOutbound: false, debug: false });
    conn.handleFrame(stompFrame('CONNECT'));
    conn.handleFrame(
      stompFrame('SUBSCRIBE', {
        destination: '/snapshot/positions/C1',
        id: 'sub-live',
      }),
    );

    ws.sent.length = 0;
    conn.handleFrame(
      stompFrame(
        'SEND',
        { destination: '/snapshot/positions/C1/100/5', 'snapshot-rows': '12' },
        '/snapshot/positions/C1/100/5',
      ),
    );

    await runTimersAndFlush();

    const frames = ws.sent.map(parseSentFrame);
    const snapshots = frames.filter((f) => f.headers['message-type'] === 'snapshot');
    const complete = frames.find((f) => f.headers['message-type'] === 'snapshot-complete');
    expect(snapshots.length).toBeGreaterThan(0);
    expect(complete?.body).toContain('C1');

    await vi.advanceTimersByTimeAsync(40);
    const live = ws.sent
      .map(parseSentFrame)
      .find((f) => f.headers['message-type'] === 'live-update');
    expect(live).toBeDefined();
  });

  it('delivers legacy generic snapshot when subscribed', async () => {
    const { conn, ws } = createConnection({ debug: false, logOutbound: false });
    conn.handleFrame(stompFrame('CONNECT'));
    conn.handleFrame(
      stompFrame('SUBSCRIBE', {
        destination: '/snapshot/trades',
        id: 'sub-legacy',
      }),
    );

    ws.sent.length = 0;
    conn.handleFrame(
      stompFrame('SEND', { 'snapshot-rows': '5' }, '/snapshot/trades/100'),
    );

    await flushAsyncWork();

    const complete = ws.sent
      .map(parseSentFrame)
      .find((f) => f.body.includes('Starting live updates'));
    expect(complete).toBeDefined();
  });

  it('reports missing subscription for client-specific trigger', () => {
    const { conn, ws } = createConnection();
    conn.handleFrame(stompFrame('CONNECT'));
    ws.sent.length = 0;

    conn.handleFrame(
      stompFrame('SEND', {}, '/snapshot/positions/NOPE/100/5'),
    );

    const err = parseSentFrame(ws.sent[0]!);
    expect(err.headers.destination).toBe('/errors');
    expect(err.body).toContain('No subscription found');
  });

  it('delivers as-of-date snapshot only (no live updates)', async () => {
    const { conn, ws } = createConnection({ debug: false, logOutbound: false });
    conn.handleFrame(stompFrame('CONNECT'));
    conn.handleFrame(
      stompFrame('SUBSCRIBE', {
        destination: '/snapshot/positions/C1/2026-05-28',
        id: 'sub-asof',
      }),
    );

    ws.sent.length = 0;
    conn.handleFrame(
      stompFrame('SEND', { 'snapshot-rows': '8' }, '/snapshot/positions/C1/2026-05-28/4'),
    );

    await runTimersAndFlush();

    const complete = ws.sent
      .map(parseSentFrame)
      .find((f) => f.headers['message-type'] === 'snapshot-complete');
    expect(complete?.body).toContain('2026-05-28');
  });

  it('reports missing subscription for as-of trigger', () => {
    const { conn, ws } = createConnection();
    conn.handleFrame(stompFrame('CONNECT'));
    ws.sent.length = 0;

    conn.handleFrame(
      stompFrame('SEND', {}, '/snapshot/positions/C1/2026-05-28/10'),
    );

    const err = parseSentFrame(ws.sent[0]!);
    expect(err.headers.destination).toBe('/errors');
  });

  it('uses body as trigger when it starts with /snapshot/', () => {
    const { conn, ws } = createConnection();
    conn.handleFrame(stompFrame('CONNECT'));
    conn.handleFrame(
      stompFrame('SUBSCRIBE', {
        destination: '/snapshot/positions/C2',
        id: 'sub-body',
      }),
    );

    ws.sent.length = 0;
    conn.handleFrame(
      stompFrame('SEND', { destination: 'wrong' }, '/snapshot/positions/C2/0/5'),
    );

    expect(ws.sent.some((f) => parseSentFrame(f).headers['message-type'] === 'snapshot')).toBe(
      true,
    );
  });

  it('skips live updates when rate is zero', async () => {
    const { conn, ws } = createConnection({ logOutbound: false });
    conn.handleFrame(stompFrame('CONNECT'));
    conn.handleFrame(
      stompFrame('SUBSCRIBE', {
        destination: '/snapshot/positions/C3',
        id: 'sub-zero',
      }),
    );

    ws.sent.length = 0;
    conn.handleFrame(
      stompFrame('SEND', {}, '/snapshot/positions/C3/0/5'),
    );
    await runTimersAndFlush();
    await vi.advanceTimersByTimeAsync(200);

    const live = ws.sent.some((f) => parseSentFrame(f).headers['message-type'] === 'live-update');
    expect(live).toBe(false);
  });

  it('unsubscribes and clears client-specific live intervals', async () => {
    const clearSpy = vi.spyOn(global, 'clearInterval');
    const { conn, ws } = createConnection({ logOutbound: false, debug: false });
    conn.handleFrame(stompFrame('CONNECT'));
    conn.handleFrame(
      stompFrame('SUBSCRIBE', {
        destination: '/snapshot/positions/C4',
        id: 'sub-unsub',
      }),
    );
    conn.handleFrame(
      stompFrame('SEND', { 'snapshot-rows': '5' }, '/snapshot/positions/C4/100/5'),
    );
    await flushAsyncWork();
    expect(conn.liveUpdateIntervals.size).toBe(1);

    clearSpy.mockClear();
    conn.handleFrame(stompFrame('UNSUBSCRIBE', { id: 'sub-unsub' }));
    expect(conn.subscriptions.has('sub-unsub')).toBe(false);
    expect(conn.liveUpdateIntervals.size).toBe(0);
    expect(clearSpy).toHaveBeenCalled();
  });

  it('unsubscribes and clears legacy subscription live interval', async () => {
    const { conn } = createConnection({ logOutbound: false, debug: false });
    conn.handleFrame(stompFrame('CONNECT'));
    conn.handleFrame(
      stompFrame('SUBSCRIBE', {
        destination: '/snapshot/trades',
        id: 'sub-legacy-unsub',
      }),
    );
    conn.handleFrame(
      stompFrame('SEND', { 'snapshot-rows': '5' }, '/snapshot/trades/100'),
    );
    await flushAsyncWork();

    const sub = conn.subscriptions.get('sub-legacy-unsub');
    expect(sub?.updateInterval).toBeDefined();

    conn.handleFrame(stompFrame('UNSUBSCRIBE', { id: 'sub-legacy-unsub' }));
    expect(conn.subscriptions.has('sub-legacy-unsub')).toBe(false);
  });

  it('disconnect cleans up and closes the socket', () => {
    const { conn, ws } = createConnection();
    conn.handleFrame(stompFrame('CONNECT'));
    conn.handleFrame(
      stompFrame('SUBSCRIBE', {
        destination: '/snapshot/positions/C5',
        id: 'sub-disc',
      }),
    );

    conn.handleFrame(stompFrame('DISCONNECT'));
    expect(conn.connected).toBe(false);
    expect(ws.close).toHaveBeenCalled();
  });

  it('cleanup clears subscriptions and intervals', async () => {
    const { conn, ws } = createConnection({ logOutbound: false });
    conn.handleFrame(stompFrame('CONNECT'));
    conn.handleFrame(
      stompFrame('SUBSCRIBE', {
        destination: '/snapshot/positions/C6',
        id: 'sub-clean',
      }),
    );
    conn.handleFrame(stompFrame('SEND', {}, '/snapshot/positions/C6/100/5'));
    await runTimersAndFlush();

    conn.cleanup();
    expect(conn.connected).toBe(false);
    expect(conn.subscriptions.size).toBe(0);

    ws.sent.length = 0;
    await vi.advanceTimersByTimeAsync(200);
    expect(ws.sent.length).toBe(0);
  });

  it('logs outbound live updates on sampled cadence', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { conn, ws } = createConnection({ logLiveEvery: 2, logOutbound: true, debug: false });
    conn.handleFrame(stompFrame('CONNECT'));
    conn.handleFrame(
      stompFrame('SUBSCRIBE', {
        destination: '/snapshot/positions/C7',
        id: 'sub-log',
      }),
    );
    conn.handleFrame(stompFrame('SEND', {}, '/snapshot/positions/C7/500/5'));
    await runTimersAndFlush();

    ws.sent.length = 0;
    await vi.advanceTimersByTimeAsync(40);
    await vi.advanceTimersByTimeAsync(40);

    expect(logSpy.mock.calls.some((c) => String(c[0]).includes('[→ client 42] MESSAGE'))).toBe(
      true,
    );
  });

  it('handles send failures gracefully', () => {
    const { conn, ws } = createConnection();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (ws.send as Mock).mockImplementation(() => {
      throw new Error('socket closed');
    });

    conn.send('MESSAGE', { destination: '/x' }, 'body');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('defers snapshot batches when socket is backed up', async () => {
    const { conn, ws } = createConnection({ logOutbound: false, debug: false });
    conn.handleFrame(stompFrame('CONNECT'));
    conn.handleFrame(
      stompFrame('SUBSCRIBE', {
        destination: '/snapshot/positions/C8',
        id: 'sub-bp',
      }),
    );

    ws.bufferedAmount = 20 * 1024 * 1024;
    ws.sent.length = 0;
    conn.handleFrame(
      stompFrame('SEND', { 'snapshot-rows': '30' }, '/snapshot/positions/C8/100/5'),
    );

    expect(ws.sent.length).toBe(0);

    ws.bufferedAmount = 0;
    await vi.advanceTimersByTimeAsync(5);
    await flushAsyncWork();
    expect(ws.sent.some((f) => parseSentFrame(f).headers['message-type'] === 'snapshot')).toBe(
      true,
    );
  });

  it('uses sparse live mode for positions', async () => {
    const { conn, ws } = createConnection({ logOutbound: false, debug: false });
    conn.handleFrame(stompFrame('CONNECT'));
    conn.handleFrame(
      stompFrame('SUBSCRIBE', {
        destination: '/snapshot/positions/C9',
        id: 'sub-sparse',
      }),
    );

    ws.sent.length = 0;
    conn.handleFrame(
      stompFrame(
        'SEND',
        { 'live-mode': 'sparse-erratic' },
        '/snapshot/positions/C9/500/5',
      ),
    );
    await runTimersAndFlush();
    await vi.advanceTimersByTimeAsync(40);

    const live = ws.sent
      .map(parseSentFrame)
      .find((f) => f.headers['message-type'] === 'live-update');
    expect(live).toBeDefined();
    const batch = JSON.parse(live!.body);
    expect(Array.isArray(batch)).toBe(true);
  });

  it('clamps requested live rate to maxLiveRowsPerSec', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { conn, ws } = createConnection({
      maxLiveRowsPerSec: 100,
      logOutbound: false,
      debug: false,
    });
    conn.handleFrame(stompFrame('CONNECT'));
    conn.handleFrame(
      stompFrame('SUBSCRIBE', {
        destination: '/snapshot/trades/C10',
        id: 'sub-clamp',
      }),
    );

    conn.handleFrame(
      stompFrame('SEND', {}, '/snapshot/trades/C10/5000/5'),
    );
    await runTimersAndFlush();

    expect(logSpy.mock.calls.some((c) => String(c[0]).includes('clamped to 100/s'))).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);
    const liveFrames = ws.sent
      .map(parseSentFrame)
      .filter((f) => f.headers['message-type'] === 'live-update');
    const totalRows = liveFrames.reduce(
      (sum, f) => sum + (JSON.parse(f.body) as unknown[]).length,
      0,
    );
    expect(totalRows).toBeLessThanOrEqual(150);
  });

  it('ignores unknown STOMP commands and malformed header lines', () => {
    const { conn, ws } = createConnection();
    conn.handleFrame('UNKNOWN\nbad-header-line\n\n\0');
    expect(ws.sent.length).toBe(0);
  });

  it('normalizes CRLF in incoming frames', () => {
    const { conn, ws } = createConnection();
    conn.handleFrame('CONNECT\r\naccept-version:1.2\r\n\r\n\0');
    expect(parseSentFrame(ws.sent[0]!).command).toBe('CONNECTED');
  });

  it('logs when legacy trigger has no matching subscription', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { conn, ws } = createConnection({ debug: true });
    conn.handleFrame(stompFrame('CONNECT'));
    ws.sent.length = 0;

    conn.handleFrame(stompFrame('SEND', {}, '/snapshot/trades/100'));
    expect(logSpy.mock.calls.some((c) => String(c[0]).includes('No subscription for'))).toBe(
      true,
    );
    expect(ws.sent.some((f) => parseSentFrame(f).headers.destination === '/errors')).toBe(false);
  });

  it('logs unrecognized trigger patterns in debug mode', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { conn } = createConnection({ debug: true });
    conn.handleFrame(stompFrame('CONNECT'));
    conn.handleFrame(stompFrame('SEND', {}, '/not-a-trigger'));
    expect(logSpy.mock.calls.some((c) => String(c[0]).includes('Unrecognized trigger'))).toBe(
      true,
    );
  });

  it('stops client-specific live updates when client leaves registry', async () => {
    const { conn, ws, clients } = createConnection({ logOutbound: false, debug: false });
    conn.handleFrame(stompFrame('CONNECT'));
    conn.handleFrame(
      stompFrame('SUBSCRIBE', {
        destination: '/snapshot/positions/C12',
        id: 'sub-disc-live',
      }),
    );
    conn.handleFrame(
      stompFrame('SEND', { 'snapshot-rows': '5' }, '/snapshot/positions/C12/100/5'),
    );
    await flushAsyncWork();

    clients.delete(conn.id);
    const sentBefore = ws.sent.length;
    await vi.advanceTimersByTimeAsync(200);
    expect(
      ws.sent
        .slice(sentBefore)
        .some((f) => parseSentFrame(f).headers['message-type'] === 'live-update'),
    ).toBe(false);
  });

  it('reuses cached snapshots on repeat trigger', async () => {
    const { conn, ws } = createConnection({ logOutbound: false, debug: false });
    conn.handleFrame(stompFrame('CONNECT'));
    conn.handleFrame(
      stompFrame('SUBSCRIBE', {
        destination: '/snapshot/positions/C11',
        id: 'sub-cache',
      }),
    );

    conn.handleFrame(
      stompFrame('SEND', { 'snapshot-rows': '10' }, '/snapshot/positions/C11/0/5'),
    );
    await runTimersAndFlush();
    const firstCount = ws.sent.length;

    ws.sent.length = 0;
    conn.handleFrame(
      stompFrame('SEND', { 'snapshot-rows': '10' }, '/snapshot/positions/C11/0/5'),
    );
    await runTimersAndFlush();
    expect(ws.sent.length).toBeGreaterThan(0);
    expect(firstCount).toBeGreaterThan(0);
  });
});
