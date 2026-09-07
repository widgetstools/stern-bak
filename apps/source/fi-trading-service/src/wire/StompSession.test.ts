import { beforeEach, describe, expect, it } from 'vitest';

import { DatasetRegistry } from '../datasets/registry.js';
import { SyntheticBook } from '../datasets/SyntheticBook.js';
import { FakeStompClient } from '../test/support/FakeStompClient.js';
import { FakeWebSocket } from '../test/support/FakeWebSocket.js';
import { LEGACY_SNAPSHOT_END_TOKEN, SNAPSHOT_END_TOKEN } from './contract.js';
import { StompSession } from './StompSession.js';

const LIVE_TOPIC = '/snapshot/positions/trd1';

interface Timer {
  cb: () => void;
  ms: number;
}

function setup(rowCount = 1250) {
  const socket = new FakeWebSocket();
  const client = new FakeStompClient(socket);
  const book = new SyntheticBook({ rowCount, seed: 7 });
  const registry = new DatasetRegistry();
  registry.register(book);

  const timers: Timer[] = [];
  let clock = 0;

  const session = new StompSession({
    sessionId: 'test-session',
    socket,
    resolver: registry,
    now: () => clock,
    setInterval: (cb, ms) => {
      timers.push({ cb, ms });
      return timers.length;
    },
    clearInterval: () => undefined,
    yieldToEventLoop: () => Promise.resolve(),
  });

  return {
    socket,
    client,
    book,
    session,
    timers,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

/** Let the snapshot pump's promise chain run to completion. */
async function settle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
}

describe('handshake', () => {
  it('answers CONNECT with the headers the client expects', async () => {
    const { client, session } = setup(10);
    client.connect().pump();
    const [connected] = client.byCommand('CONNECTED');
    expect(connected?.headers).toMatchObject({
      version: '1.2',
      session: 'test-session',
      'heart-beat': '10000,10000',
    });
    expect(connected?.headers['server']).toContain('fi-trading-service');
    expect(session.isConnected).toBe(true);
    await settle();
  });

  it('accepts STOMP as well as CONNECT', () => {
    const { socket, client } = setup(10);
    socket.feed('STOMP\naccept-version:1.2\nheart-beat:4000,4000\n\n\u0000');
    expect(client.pump().byCommand('CONNECTED')).toHaveLength(1);
  });

  it('arms a heartbeat timer that emits a bare LF the client recognises', () => {
    const { client, timers } = setup(10);
    client.connect('4000,4000').pump();
    const heartbeat = timers.find((t) => t.ms === 10_000);
    expect(heartbeat).toBeDefined();
    heartbeat?.cb();
    client.pump();
    expect(client.heartbeats).toBeGreaterThan(0);
  });

  it('arms no heartbeat when the client declines them', () => {
    const { client, timers } = setup(10);
    client.connect('0,0').pump();
    expect(timers.find((t) => t.ms === 10_000)).toBeUndefined();
  });
});

describe('snapshot', () => {
  it('delivers nothing on SUBSCRIBE alone - the trigger starts it', async () => {
    const { client } = setup(100);
    client.connect().subscribe(LIVE_TOPIC);
    await settle();
    expect(client.pump().byMessageType('snapshot')).toHaveLength(0);
  });

  it('chunks at 500 rows, tags each frame, and ends with one sentinel', async () => {
    const { client } = setup(1250);
    client.connect();
    const subId = client.subscribe(LIVE_TOPIC);
    client.trigger(`${LIVE_TOPIC}/1000/500`);
    await settle();
    client.pump();

    const batches = client.byMessageType('snapshot');
    expect(batches.map((f) => JSON.parse(f.body).length)).toEqual([500, 500, 250]);
    expect(batches.map((f) => f.headers['batch-number'])).toEqual(['0', '1', '2']);
    for (const frame of batches) {
      expect(frame.headers['subscription']).toBe(subId);
      expect(frame.headers['destination']).toBe(LIVE_TOPIC);
      expect(frame.headers['content-type']).toBe('application/json');
    }
    expect(client.byMessageType('snapshot-complete')).toHaveLength(1);
  });

  it('delivers every row exactly once, unique by key column', async () => {
    const { client, book } = setup(1250);
    client.connect().subscribe(LIVE_TOPIC);
    client.trigger(`${LIVE_TOPIC}/0`);
    await settle();
    const rows = client.pump().rowsOf('snapshot') as { positionId: string }[];
    expect(rows).toHaveLength(book.size());
    expect(new Set(rows.map((r) => r.positionId)).size).toBe(book.size());
  });

  it('sends a sentinel that matches BOTH the safe and the legacy end token', async () => {
    const { client } = setup(10);
    client.connect().subscribe(LIVE_TOPIC);
    client.trigger(`${LIVE_TOPIC}/0`);
    await settle();
    const [sentinel] = client.pump().byMessageType('snapshot-complete');
    expect(sentinel?.body).toContain(SNAPSHOT_END_TOKEN);
    expect(sentinel?.body).toContain(LEGACY_SNAPSHOT_END_TOKEN);
    // Not JSON, so it must not claim to be.
    expect(sentinel?.headers['content-type']).toBeUndefined();
  });

  it('is the ONLY frame the client end-token matcher fires on', async () => {
    const { client } = setup(1250);
    client.connect().subscribe(LIVE_TOPIC);
    client.trigger(`${LIVE_TOPIC}/0`);
    await settle();
    client.pump();
    // How the client actually tests it: case-insensitive substring on the
    // trimmed body, before JSON.parse (transports/stomp.ts handleFrame).
    for (const token of [SNAPSHOT_END_TOKEN, LEGACY_SNAPSHOT_END_TOKEN]) {
      const matcher = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      const matched = client.frames.filter((f) => matcher.test(f.body.trim()));
      expect(matched).toHaveLength(1);
      expect(matched[0]?.headers['message-type']).toBe('snapshot-complete');
    }
  });

  it('honours a custom batch size from the trigger', async () => {
    const { client } = setup(250);
    client.connect().subscribe(LIVE_TOPIC);
    client.trigger(`${LIVE_TOPIC}/0/100`);
    await settle();
    expect(client.pump().byMessageType('snapshot').map((f) => JSON.parse(f.body).length)).toEqual([
      100, 100, 50,
    ]);
  });

  it('reads the trigger path from the body when the destination is not one', async () => {
    const { socket, client } = setup(10);
    client.connect().subscribe(LIVE_TOPIC);
    socket.feed(
      'SEND\ndestination:/app/request\n\n' + `${LIVE_TOPIC}/0` + '\u0000',
    );
    await settle();
    expect(client.pump().byMessageType('snapshot-complete')).toHaveLength(1);
  });

  it('restarts cleanly when a second trigger arrives', async () => {
    const { client } = setup(1250);
    client.connect().subscribe(LIVE_TOPIC);
    client.trigger(`${LIVE_TOPIC}/0`);
    client.trigger(`${LIVE_TOPIC}/0`);
    await settle();
    // The first pump is abandoned, so exactly one run reaches completion.
    expect(client.pump().byMessageType('snapshot-complete')).toHaveLength(1);
  });
});

describe('live updates', () => {
  async function primed(rowCount = 600) {
    const h = setup(rowCount);
    h.client.connect().subscribe(LIVE_TOPIC);
    h.client.trigger(`${LIVE_TOPIC}/10000/500`);
    await settle();
    h.client.pump().reset();
    return h;
  }

  it('publishes only rows the book actually changed', async () => {
    const h = await primed();
    h.book.tick(120);
    h.advance(100);
    h.session.onLiveTick();
    const rows = h.client.pump().rowsOf('live-update') as { positionId: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(120);
    expect(new Set(rows.map((r) => r.positionId)).size).toBe(rows.length);
  });

  it('tags live frames as live-update with the subscription id', async () => {
    const h = await primed();
    h.book.tick(120);
    h.advance(100);
    h.session.onLiveTick();
    const [frame] = h.client.pump().byMessageType('live-update');
    expect(frame?.headers['subscription']).toBe('sub-0');
    expect(frame?.headers['update-number']).toBe('0');
  });

  it('emits nothing when nothing changed', async () => {
    const h = await primed();
    h.advance(100);
    h.session.onLiveTick();
    expect(h.client.pump().byMessageType('live-update')).toHaveLength(0);
  });

  it('does not publish while the socket is backed up', async () => {
    const h = await primed();
    h.book.tick(200);
    h.socket.bufferedAmount = 50 * 1024 * 1024;
    h.advance(100);
    h.session.onLiveTick();
    expect(h.client.pump().byMessageType('live-update')).toHaveLength(0);
  });

  it('carries unspent budget instead of dropping the rows it owed', async () => {
    const h = await primed();
    h.book.tick(300);
    // 10 rows is under the frame floor, so this tick should hold its budget.
    h.advance(1);
    h.session.onLiveTick();
    expect(h.client.pump().byMessageType('live-update')).toHaveLength(0);
    // The held budget plus the new grant is enough to clear the floor.
    h.advance(30);
    h.session.onLiveTick();
    expect(h.client.pump().byMessageType('live-update').length).toBeGreaterThan(0);
  });

  it('never starts a live stream for a snapshot-only trigger', async () => {
    const h = setup(100);
    h.client.connect().subscribe(LIVE_TOPIC);
    h.client.trigger(`${LIVE_TOPIC}/0`);
    await settle();
    h.client.pump().reset();
    h.book.tick(100);
    h.advance(1000);
    h.session.onLiveTick();
    expect(h.client.pump().byMessageType('live-update')).toHaveLength(0);
  });

  it('stops publishing after UNSUBSCRIBE', async () => {
    const h = await primed();
    h.client.unsubscribe('sub-0');
    expect(h.session.subscriptionIds).toEqual([]);
    h.book.tick(200);
    h.advance(100);
    h.session.onLiveTick();
    expect(h.client.pump().byMessageType('live-update')).toHaveLength(0);
  });
});

describe('errors and teardown', () => {
  let harness: ReturnType<typeof setup>;
  beforeEach(() => {
    harness = setup(10);
    harness.client.connect();
  });

  it('rejects a SUBSCRIBE missing its headers', () => {
    harness.socket.feed('SUBSCRIBE\nid:only\n\n\u0000');
    const [error] = harness.client.pump().byCommand('ERROR');
    expect(error?.headers['message']).toBe('Bad SUBSCRIBE');
  });

  it('rejects an unknown dataset with a listing of the known ones', () => {
    harness.client.subscribe('/snapshot/nope/trd1');
    const [error] = harness.client.pump().byCommand('ERROR');
    expect(error?.body).toMatch(/Unknown dataset/);
  });

  it('rejects a trigger with no matching subscription', () => {
    harness.client.trigger('/snapshot/positions/other/100');
    expect(harness.client.pump().byCommand('ERROR')[0]?.headers['message']).toBe('No subscription');
  });

  it('rejects a SEND with no destination', () => {
    harness.socket.feed('SEND\n\n\u0000');
    expect(harness.client.pump().byCommand('ERROR')[0]?.headers['message']).toBe('Bad SEND');
  });

  it('reports an unserved dataset rather than silently stalling', () => {
    harness.client.subscribe('/snapshot/trades/trd1');
    harness.client.trigger('/snapshot/trades/trd1/100');
    expect(harness.client.pump().byCommand('ERROR')[0]?.headers['message']).toBe('No source');
  });

  it('refuses a historical stream while the corpus does not exist', () => {
    harness.client.subscribe('/snapshot/positions/trd1/2026-03-15');
    harness.client.trigger('/snapshot/positions/trd1/2026-03-15');
    expect(harness.client.pump().byCommand('ERROR')[0]?.headers['message']).toBe('No source');
  });

  it('rejects an unsupported command', () => {
    harness.socket.feed('NUDGE\n\n\u0000');
    expect(harness.client.pump().byCommand('ERROR')[0]?.headers['message']).toBe(
      'Unsupported command',
    );
  });

  it('closes the socket on a malformed frame', () => {
    harness.socket.feed('SEND\ncontent-length:abc\n\nx\u0000');
    expect(harness.client.pump().byCommand('ERROR')[0]?.headers['message']).toBe('Malformed frame');
    expect(harness.socket.closed).toBe(true);
  });

  it('acknowledges DISCONNECT with a RECEIPT and then closes', () => {
    harness.client.disconnect('bye-1');
    const [receipt] = harness.client.pump().byCommand('RECEIPT');
    expect(receipt?.headers['receipt-id']).toBe('bye-1');
    expect(harness.socket.closed).toBe(true);
  });

  it('ignores UNSUBSCRIBE without an id', () => {
    harness.socket.feed('UNSUBSCRIBE\n\n\u0000');
    expect(harness.client.pump().byCommand('ERROR')).toHaveLength(0);
  });

  it('is idempotent on close and drops its subscriptions', () => {
    harness.client.subscribe(LIVE_TOPIC);
    harness.session.close();
    harness.session.close();
    expect(harness.session.subscriptionIds).toEqual([]);
  });

  it('closes when the socket errors', () => {
    harness.socket.fail(new Error('boom'));
    expect(harness.socket.closed).toBe(true);
  });
});
