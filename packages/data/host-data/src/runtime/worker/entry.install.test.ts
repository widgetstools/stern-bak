/**
 * `installSharedWorkerHub` — the install paths that `entry.adoptPorts`
 * doesn't cover: AppData routing, the hydration window, the dedicated-
 * Worker fallback, port teardown, and `stop()`.
 *
 * The hydration window is the subtle one. `onconnect` is registered
 * BEFORE the `await hub.hydrateCatalog()`, because browsers fire
 * `connect` the moment the main thread constructs the SharedWorker — a
 * handler installed after hydration drops the first port and every
 * client's `appData.ready()` hangs forever.
 */

import { describe, expect, it, vi } from 'vitest';
import { installSharedWorkerHub } from './entry.js';
import type { ConfigManager } from '@wellsfargo-starui/core/host/config';

type Snapshot = { kind: string; reqId?: string };

function collect(port: MessagePort): Snapshot[] {
  const received: Snapshot[] = [];
  port.addEventListener('message', (ev: MessageEvent) => received.push(ev.data as Snapshot));
  port.start();
  return received;
}

async function waitForCount(received: unknown[], count: number, timeoutMs = 1_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (received.length < count && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

async function settle(): Promise<void> {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('installSharedWorkerHub — port routing', () => {
  it('routes an AppData request to the AppData handler, not the provider one', async () => {
    const channel = new MessageChannel();
    const installed = await installSharedWorkerHub({
      selfRef: { onconnect: null },
      adoptPorts: [{ port: channel.port2, buffered: [] }],
    });
    const appData = vi.spyOn(installed.hub, 'handleAppDataRequest');
    const request = vi.spyOn(installed.hub, 'handleRequest');

    channel.port1.postMessage({ kind: 'appdata-attach', reqId: 'a1' });
    await settle();

    expect(appData).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: 'appdata-attach' }));
    expect(request).not.toHaveBeenCalled();
  });

  it('ignores a message that is neither a provider nor an AppData request', async () => {
    const channel = new MessageChannel();
    const installed = await installSharedWorkerHub({
      selfRef: { onconnect: null },
      adoptPorts: [{ port: channel.port2, buffered: [] }],
    });
    const appData = vi.spyOn(installed.hub, 'handleAppDataRequest');
    const request = vi.spyOn(installed.hub, 'handleRequest');

    channel.port1.postMessage({ kind: 'who-knows' });
    await settle();

    expect(appData).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('tears the port listeners down when the port raises messageerror', async () => {
    // A hand-rolled EventTarget port: jsdom's `Event` and Node's real
    // `MessagePort` come from different realms, so a synthetic
    // `messageerror` can't be dispatched onto the real thing.
    const started: boolean[] = [];
    class FakePort extends EventTarget {
      postMessage(): void {}
      start(): void { started.push(true); }
      close(): void {}
    }
    const port = new FakePort();
    const installed = await installSharedWorkerHub({
      selfRef: { onconnect: null },
      adoptPorts: [{ port: port as unknown as MessagePort, buffered: [] }],
    });
    expect(started).toEqual([true]);
    const request = vi.spyOn(installed.hub, 'handleRequest');

    port.dispatchEvent(new Event('messageerror'));

    // The listeners are gone, so nothing further on this port reaches the hub.
    port.dispatchEvent(
      Object.assign(new Event('message'), { data: { kind: 'hub-ready', reqId: 'after-close' } }),
    );
    await settle();

    expect(request).not.toHaveBeenCalled();
  });

  it('ignores an onconnect event that carries no port', async () => {
    const selfRef: { onconnect: ((ev: { ports: readonly MessagePort[] }) => void) | null } = {
      onconnect: null,
    };
    await installSharedWorkerHub({ selfRef });

    expect(() => selfRef.onconnect?.({ ports: [] })).not.toThrow();
  });

  it('does not register onconnect on a global that has no such property', async () => {
    const selfRef: Record<string, unknown> = {};
    await installSharedWorkerHub({ selfRef });
    expect('onconnect' in selfRef).toBe(false);
  });
});

describe('installSharedWorkerHub — hydration window', () => {
  /** A ConfigManager stand-in; only the AppData store touches it. */
  const configManager = { getIdentity: () => ({ userId: 'worker' }) } as unknown as ConfigManager;

  it('serves a port that connected while the catalog was still hydrating', async () => {
    let releaseLoad: () => void = () => {};
    const loadAll = vi.fn(() => new Promise<void>((resolve) => { releaseLoad = resolve; }));
    const configCatalog = {
      isReady: () => false,
      loadAll,
      list: () => [],
      ensure: async () => undefined,
      invalidate: async () => {},
    };

    const selfRef: { onconnect: ((ev: { ports: readonly MessagePort[] }) => void) | null } = {
      onconnect: null,
    };
    const installing = installSharedWorkerHub({
      selfRef,
      configManager,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      configCatalog: configCatalog as any,
    });

    // The handler must already be live even though install has not resolved.
    expect(selfRef.onconnect).toBeTypeOf('function');
    const channel = new MessageChannel();
    const received = collect(channel.port1);
    selfRef.onconnect!({ ports: [channel.port2] });

    releaseLoad();
    await installing;

    expect(loadAll).toHaveBeenCalled();
    channel.port1.postMessage({ kind: 'hub-ready', reqId: 'queued-port' });
    await waitForCount(received, 1);
    expect(received[0]).toMatchObject({ kind: 'config-snapshot', reqId: 'queued-port' });
  });

  it('skips hydration entirely when no ConfigManager is supplied', async () => {
    const loadAll = vi.fn(async () => {});
    await installSharedWorkerHub({
      selfRef: { onconnect: null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      configCatalog: { isReady: () => false, loadAll, list: () => [] } as any,
    });
    expect(loadAll).not.toHaveBeenCalled();
  });
});

describe('installSharedWorkerHub — dedicated Worker fallback', () => {
  function dedicatedGlobal() {
    const posted: unknown[] = [];
    const globalRef: {
      onmessage: ((ev: MessageEvent) => void) | null;
      postMessage(message: unknown): void;
    } = {
      onmessage: null,
      postMessage: (m: unknown) => { posted.push(m); },
    };
    return { globalRef, posted };
  }

  it('answers requests on the worker\'s own message channel', async () => {
    const { globalRef, posted } = dedicatedGlobal();
    await installSharedWorkerHub({ selfRef: globalRef });

    expect(globalRef.onmessage).toBeTypeOf('function');
    globalRef.onmessage!({ data: { kind: 'hub-ready', reqId: 'dedicated' } } as MessageEvent);

    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ kind: 'config-snapshot', reqId: 'dedicated' });
  });

  it('routes AppData requests on that channel too', async () => {
    const { globalRef } = dedicatedGlobal();
    const installed = await installSharedWorkerHub({ selfRef: globalRef });
    const appData = vi.spyOn(installed.hub, 'handleAppDataRequest');

    globalRef.onmessage!({ data: { kind: 'appdata-attach', reqId: 'a1' } } as MessageEvent);

    expect(appData).toHaveBeenCalled();
  });

  it('ignores unknown messages on that channel', async () => {
    const { globalRef, posted } = dedicatedGlobal();
    await installSharedWorkerHub({ selfRef: globalRef });

    globalRef.onmessage!({ data: { kind: 'nope' } } as MessageEvent);

    expect(posted).toEqual([]);
  });
});

describe('installSharedWorkerHub — stop', () => {
  it('disposes the hub', async () => {
    const installed = await installSharedWorkerHub({ selfRef: { onconnect: null } });
    const dispose = vi.spyOn(installed.hub, 'dispose');

    await installed.stop();

    expect(dispose).toHaveBeenCalled();
  });
});
