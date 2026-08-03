/**
 * `client.attachPerspective(providerId)` end-to-end over a real
 * MessageChannel — the seam Phase 4's `usePerspectiveTable` was written
 * against and nothing implemented until now.
 *
 * Two properties are the whole point of this file:
 *
 *   1. The frame port survives the trip. It rides the transfer list, not the
 *      payload, so a `PortLike` that drops the second `postMessage` argument
 *      silently turns every attach into a refusal — which is why the wiring
 *      below forwards it and asserts a usable port comes out.
 *   2. Every failure answers. A worker booted without `loadPerspective` has
 *      no engine and never will; it must say so rather than leave the
 *      caller's promise pending.
 *
 * The engine itself is faked. Real wasm is `perspectiveHost.smoke.test.ts`'s
 * job; what is under test here is the protocol.
 */

import { describe, expect, it } from 'vitest';
import { createInPageWiring } from './SharedWorkerDataServicesClient';
import { SharedWorkerDataServicesHub } from '../worker/SharedWorkerDataServicesHub';
import type { PortLike } from '../worker/hubTypes.js';
import { isRequest } from '../protocol';
import { registerProvider } from '../providers/registry';
import type { ProviderConfig } from '@wellsfargo-starui/types';
import type { PerspectiveModuleLike } from '../perspective/perspectiveHost.js';

/**
 * Hub-side port wiring that FORWARDS the transfer list. The
 * `attachPortToHub` helper in the sibling client test deliberately does
 * not — it predates any transferring message — so this one is separate
 * rather than shared.
 */
function attachPortToHub(hub: SharedWorkerDataServicesHub): (port: MessagePort) => void {
  return (port) => {
    const portLike: PortLike = {
      postMessage: (m, transfer) =>
        transfer && transfer.length > 0
          ? port.postMessage(m, transfer as Transferable[])
          : port.postMessage(m),
    };
    port.addEventListener('message', (ev: MessageEvent) => {
      if (isRequest(ev.data)) hub.handleRequest(portLike, ev.data);
    });
    port.start();
  };
}

/** Enough of `@perspective-dev/client` for the host to build a session. */
function fakePerspectiveModule(): () => Promise<PerspectiveModuleLike> {
  return async () => ({
    worker: async () => ({
      table: async () => ({ update: async () => {}, delete: async () => {} }),
      new_proxy_session: () => ({ handle_request: async () => {}, close: async () => {} }),
      get_hosted_table_names: async () => ['positions'],
    }),
  }) as unknown as PerspectiveModuleLike;
}

const CFG = {
  providerId: 'perspective-1',
  providerType: 'mock-perspective',
  keyColumn: 'id',
  tableName: 'positions',
} as unknown as ProviderConfig;

/** A tee-shaped handle: what `startMockPerspective` returns, minus the engine. */
function registerFakeTee(tableName = 'positions'): void {
  registerProvider('mock-perspective', ((cfg: ProviderConfig, emit) => {
    void cfg;
    emit({ status: 'ready' });
    return {
      tableName,
      feed: { table: { update: async () => {} }, whenReady: async () => ({}) },
      stop: () => {},
      restart: () => {},
    };
  }) as never);
}

function wire(opts: { withEngine: boolean }) {
  const hub = new SharedWorkerDataServicesHub(
    opts.withEngine ? { loadPerspective: fakePerspectiveModule() } : {},
  );
  const wiring = createInPageWiring(attachPortToHub(hub), { disablePageHideClose: true });
  return {
    hub,
    client: wiring.client,
    close: () => {
      wiring.close();
      void hub.dispose();
    },
  };
}

describe('client.attachPerspective', () => {
  it('round-trips a usable frame port and the hosted table name', async () => {
    registerFakeTee('positions');
    const { hub, client, close } = wire({ withEngine: true });
    try {
      // The Table only exists once the provider runs, so start it the way a
      // blotter does — via an ordinary data subscription.
      client.attach('perspective-1', CFG, { onDelta: () => {}, onStatus: () => {} });

      const outcome = await client.attachPerspective('perspective-1');

      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.tableName).toBe('positions');
      expect(typeof outcome.port.postMessage).toBe('function');
      expect(hub.getPerspectiveHost()?.attachedPorts).toBe(1);

      // A transferred port is live, not a detached clone: posting on it
      // reaches the session the hub bound to the other end.
      expect(() => outcome.port.postMessage({ cmd: 'init', id: 1 })).not.toThrow();
      outcome.port.close();
    } finally {
      close();
    }
  });

  it('answers {ok:false} with a reason when the worker hosts no engine', async () => {
    registerFakeTee();
    const { client, close } = wire({ withEngine: false });
    try {
      client.attach('perspective-1', CFG, { onDelta: () => {}, onStatus: () => {} });

      const outcome = await client.attachPerspective('perspective-1');

      expect(outcome.ok).toBe(false);
      expect((outcome as { reason: string }).reason).toContain('hosts no Perspective engine');
    } finally {
      close();
    }
  });

  it('answers a reason for a provider that was never started', async () => {
    const { client, close } = wire({ withEngine: true });
    try {
      const outcome = await client.attachPerspective('never-started');

      expect(outcome.ok).toBe(false);
      expect((outcome as { reason: string }).reason).toContain('not in the worker catalog');
    } finally {
      close();
    }
  });

  it('resolves rather than rejects once the client is closed', async () => {
    const { client, close } = wire({ withEngine: true });
    close();

    const outcome = await client.attachPerspective('perspective-1');

    expect(outcome).toEqual({ ok: false, reason: expect.stringContaining('client is closed') });
  });

  it('settles an in-flight attach when the client closes underneath it', async () => {
    // No hub on the far end: the request goes out and nothing ever answers.
    const channel = new MessageChannel();
    const { SharedWorkerDataServicesClient } = await import('./SharedWorkerDataServicesClient');
    const client = new SharedWorkerDataServicesClient(channel.port1, {
      disablePageHideClose: true,
    });

    const inFlight = client.attachPerspective('p1');
    client.close();

    await expect(inFlight).resolves.toMatchObject({ ok: false });
    channel.port2.close();
  });

  it('refuses an ok reply whose port did not survive the transfer', async () => {
    const channel = new MessageChannel();
    const { SharedWorkerDataServicesClient } = await import('./SharedWorkerDataServicesClient');
    const client = new SharedWorkerDataServicesClient(channel.port1, {
      disablePageHideClose: true,
      generateSubId: () => 'fixed',
    });

    const inFlight = client.attachPerspective('p1');
    const reqId = await new Promise<string>((resolve) => {
      channel.port2.addEventListener('message', (ev: MessageEvent) => {
        resolve((ev.data as { reqId: string }).reqId);
      });
      channel.port2.start();
    });
    // `ok` with no transferred port: reporting success here would strand the
    // caller on an `open_table` against a client that was never built.
    channel.port2.postMessage({
      kind: 'perspective-attach-result',
      reqId,
      ok: true,
      tableName: 'positions',
    });

    await expect(inFlight).resolves.toEqual({
      ok: false,
      reason: expect.stringContaining('without a port or table name'),
    });
    client.close();
  });
});
