/**
 * Port adoption — the plumbing that lets `defaultEntry` accept ports before
 * the hub exists (it must, to receive the bootstrap handshake the hub's
 * ConfigManager is built from) and hand them over without losing anything
 * the client already sent.
 *
 * `hub-ready` is the probe: the hub answers it unconditionally with a
 * `config-snapshot` carrying the same `reqId`, so a reply on the far end of
 * a real MessageChannel proves the request was dispatched.
 */

import { describe, expect, it } from 'vitest';
import { installSharedWorkerHub } from './entry.js';

type Snapshot = { kind: string; reqId?: string };

function collect(port: MessagePort): Snapshot[] {
  const received: Snapshot[] = [];
  port.addEventListener('message', (ev: MessageEvent) => received.push(ev.data as Snapshot));
  port.start();
  return received;
}

/**
 * Poll until the expected number of replies has landed. A fixed tick count
 * is wrong here: a reply to a message the client posts takes two macrotask
 * hops (client → worker port, then hub reply → client port), while a
 * replayed buffered message takes one.
 */
async function waitForCount(received: unknown[], count: number, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (received.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** Settle pending port traffic when asserting that nothing more arrives. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('installSharedWorkerHub — adoptPorts', () => {
  it('replays a buffered request that arrived before the hub existed', async () => {
    const channel = new MessageChannel();
    const received = collect(channel.port1);

    await installSharedWorkerHub({
      selfRef: { onconnect: null },
      adoptPorts: [
        { port: channel.port2, buffered: [{ kind: 'hub-ready', reqId: 'early-1' }] },
      ],
    });

    await waitForCount(received, 1);

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ kind: 'config-snapshot', reqId: 'early-1' });
  });

  it('replays multiple buffered messages in arrival order', async () => {
    const channel = new MessageChannel();
    const received = collect(channel.port1);

    await installSharedWorkerHub({
      selfRef: { onconnect: null },
      adoptPorts: [
        {
          port: channel.port2,
          buffered: [
            { kind: 'hub-ready', reqId: 'first' },
            { kind: 'hub-ready', reqId: 'second' },
            { kind: 'hub-ready', reqId: 'third' },
          ],
        },
      ],
    });

    await waitForCount(received, 3);

    expect(received.map((m) => m.reqId)).toEqual(['first', 'second', 'third']);
  });

  it('ignores non-protocol buffered messages instead of throwing', async () => {
    const channel = new MessageChannel();
    const received = collect(channel.port1);

    await installSharedWorkerHub({
      selfRef: { onconnect: null },
      adoptPorts: [
        {
          port: channel.port2,
          buffered: [{ kind: 'not-a-request' }, null, 'garbage', { kind: 'hub-ready', reqId: 'ok' }],
        },
      ],
    });

    await waitForCount(received, 1);
    await settle();

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ reqId: 'ok' });
  });

  it('keeps serving an adopted port after handover', async () => {
    const channel = new MessageChannel();
    const received = collect(channel.port1);

    await installSharedWorkerHub({
      selfRef: { onconnect: null },
      adoptPorts: [{ port: channel.port2, buffered: [] }],
    });

    channel.port1.postMessage({ kind: 'hub-ready', reqId: 'after-handover' });
    await waitForCount(received, 1);

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ reqId: 'after-handover' });
  });

  it('still accepts ports arriving through onconnect', async () => {
    const selfRef: { onconnect: ((ev: { ports: readonly MessagePort[] }) => void) | null } = {
      onconnect: null,
    };
    await installSharedWorkerHub({ selfRef });

    const channel = new MessageChannel();
    const received = collect(channel.port1);
    selfRef.onconnect?.({ ports: [channel.port2] });

    channel.port1.postMessage({ kind: 'hub-ready', reqId: 'via-onconnect' });
    await waitForCount(received, 1);

    expect(received[0]).toMatchObject({ reqId: 'via-onconnect' });
  });
});
