import { describe, expect, it } from 'vitest';

import { FakeWebSocket } from '../test/support/FakeWebSocket.js';
import { OutboundQueue } from './OutboundQueue.js';

function makeQueue(overrides = {}) {
  const socket = new FakeWebSocket();
  const timers: (() => void)[] = [];
  const queue = new OutboundQueue(socket, {
    highWaterBytes: 100,
    lowWaterBytes: 20,
    setTimer: (cb) => {
      timers.push(cb);
      return timers.length;
    },
    clearTimer: () => undefined,
    ...overrides,
  });
  return { socket, queue, timers, runTimers: () => timers.splice(0).forEach((cb) => cb()) };
}

describe('OutboundQueue', () => {
  it('writes through and accounts for what it sent', () => {
    const { socket, queue } = makeQueue();
    queue.write('abc');
    expect(socket.sent).toEqual(['abc']);
    expect(queue.stats).toMatchObject({ framesSent: 1, bytesSent: 3 });
  });

  it('counts bytes rather than characters for a multibyte frame', () => {
    const { queue } = makeQueue();
    const frame = 'euro \u20ac';
    queue.write(frame);
    expect(queue.stats.bytesSent).toBe(Buffer.byteLength(frame, 'utf8'));
    expect(queue.stats.bytesSent).toBeGreaterThan(frame.length);
  });

  it('reports backed up above high water and drained below low water', () => {
    const { socket, queue } = makeQueue();
    expect(queue.backedUp()).toBe(false);
    socket.bufferedAmount = 101;
    expect(queue.backedUp()).toBe(true);
    expect(queue.drained()).toBe(false);
    socket.bufferedAmount = 20;
    expect(queue.drained()).toBe(true);
  });

  it('resolves waitForDrain immediately when not backed up', async () => {
    const { queue } = makeQueue();
    await expect(queue.waitForDrain()).resolves.toBeUndefined();
  });

  it('polls until the socket drains, then resolves', async () => {
    const { socket, queue, runTimers } = makeQueue();
    socket.bufferedAmount = 500;
    let settled = false;
    const waiting = queue.waitForDrain().then(() => {
      settled = true;
    });
    runTimers();
    await Promise.resolve();
    expect(settled).toBe(false);
    socket.bufferedAmount = 5;
    runTimers();
    await waiting;
    expect(settled).toBe(true);
  });

  it('stops writing once closed, so teardown cannot resurrect the socket', () => {
    const { socket, queue } = makeQueue();
    queue.close();
    queue.write('nope');
    expect(socket.sent).toEqual([]);
  });

  it('releases a pending drain poll on close', async () => {
    const { socket, queue, runTimers } = makeQueue();
    socket.bufferedAmount = 500;
    const waiting = queue.waitForDrain();
    queue.close();
    runTimers();
    await expect(waiting).resolves.toBeUndefined();
  });
});
