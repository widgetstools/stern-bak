/**
 * Port adoption — the plumbing that lets `defaultEntry` accept ports before
 * the hub exists (it must, to receive the bootstrap handshake the hub's
 * ConfigManager is built from) and hand them over without losing anything
 * the client already sent.
 *
 * `provider-running` is the probe: the data hub answers it unconditionally
 * with a `config-snapshot` carrying the same `reqId` (catalog RPCs such as
 * `hub-ready` moved to the platform-services host — worker-split W1c), so a
 * reply on the far end of a real MessageChannel proves the request was
 * dispatched.
 */

import { describe, expect, it } from 'vitest';
import { installPlatformServicesHost, installSharedWorkerHub } from './entry.js';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';

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
        { port: channel.port2, buffered: [{ kind: 'provider-running', reqId: 'early-1', providerId: 'probe' }] },
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
            { kind: 'provider-running', reqId: 'first', providerId: 'probe' },
            { kind: 'provider-running', reqId: 'second', providerId: 'probe' },
            { kind: 'provider-running', reqId: 'third', providerId: 'probe' },
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
          buffered: [{ kind: 'not-a-request' }, null, 'garbage', { kind: 'provider-running', reqId: 'ok', providerId: 'probe' }],
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

    channel.port1.postMessage({ kind: 'provider-running', reqId: 'after-handover', providerId: 'probe' });
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

    channel.port1.postMessage({ kind: 'provider-running', reqId: 'via-onconnect', providerId: 'probe' });
    await waitForCount(received, 1);

    expect(received[0]).toMatchObject({ reqId: 'via-onconnect' });
  });
});

describe('installPlatformServicesHost — adopted ports during hydrate (WORKLOG 14 class)', () => {
  /** A ConfigManager whose FIRST indexed list (the catalog hydrate) is held open until released. */
  function deferredConfigManager(): { configManager: ConfigManager; release: () => void } {
    let release: () => void = () => {};
    let calls = 0;
    const configManager = {
      getAppId: () => 'TestApp',
      getIdentity: () => ({ userId: 'worker' }),
      getConfigsByComponentTypesUnfiltered: () => {
        calls += 1;
        if (calls === 1) return new Promise<never[]>((resolve) => { release = () => resolve([]); });
        return Promise.resolve([]);
      },
      getConfig: async () => undefined,
    } as unknown as ConfigManager;
    return { configManager, release: () => release() };
  }

  it('does not lose a request that arrives on an adopted (already started) port while hydrate is pending', async () => {
    const channel = new MessageChannel();
    const received = collect(channel.port1);
    // `defaultEntry.capture()` starts the port to receive the bootstrap
    // handshake; a started port with no listener drops messages, which is
    // exactly the gap the installer must close.
    channel.port2.start();
    const { configManager, release } = deferredConfigManager();

    const installing = installPlatformServicesHost({
      selfRef: { onconnect: null },
      configManager,
      adoptPorts: [{ port: channel.port2, buffered: [{ kind: 'hub-ready', reqId: 'buffered' }] }],
    });
    // Sent mid-hydrate: the window's AppData attach / hub-ready / get-config land here in production.
    channel.port1.postMessage({ kind: 'hub-ready', reqId: 'mid-hydrate' });
    await settle();
    expect(received).toHaveLength(0); // nothing answered before the host is ready

    release();
    await installing;
    await waitForCount(received, 2);

    // Per-port order: the pre-handover buffer first, then the mid-hydrate request.
    expect(received.map((m) => m.reqId)).toEqual(['buffered', 'mid-hydrate']);
    expect(received[1]).toMatchObject({ kind: 'config-snapshot', ready: true });
  });

  it('a port connecting through onconnect during hydrate is served after hydrate, in order', async () => {
    const selfRef: { onconnect: ((ev: { ports: readonly MessagePort[] }) => void) | null } = { onconnect: null };
    const { configManager, release } = deferredConfigManager();
    const installing = installPlatformServicesHost({ selfRef, configManager });

    const channel = new MessageChannel();
    const received = collect(channel.port1);
    selfRef.onconnect!({ ports: [channel.port2] });
    channel.port1.postMessage({ kind: 'hub-ready', reqId: 'first' });
    channel.port1.postMessage({ kind: 'provider-running', reqId: 'second', providerId: 'p' });
    await settle();
    expect(received).toHaveLength(0);

    release();
    await installing;
    await waitForCount(received, 2);
    expect(received.map((m) => m.reqId)).toEqual(['first', 'second']);
  });
});
