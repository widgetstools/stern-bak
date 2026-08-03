/**
 * The query protocol end to end: two clients on real MessagePorts, one
 * in-process hub, one fake engine hosting one fake Table.
 *
 * The engine's own behaviour is covered by
 * `perspective/perspectiveQueryEngine.test.ts`; what this file pins is the
 * WIRING — that a subscribe request reaches the registry, that its pushes
 * come back over the same control port the request went out on, that two
 * windows land on one entry, and that a window closing releases what it
 * owned without the other window noticing.
 */

import { describe, expect, it } from 'vitest';
import type { ProviderConfig, PerspectiveQueryResult } from '@wellsfargo-starui/types';
import { SharedWorkerDataServicesHub } from './SharedWorkerDataServicesHub';
import { createInPageWiring } from '../client/SharedWorkerDataServicesClient';
import type { PortLike } from './hubTypes.js';
import { isRequest } from '../protocol';
import { registerProvider } from '../providers/registry';
import type { PerspectiveModuleLike } from '../perspective/perspectiveHost.js';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Wait for a condition rather than a fixed number of turns.
 *
 * Every assertion here spans at least two MessagePort hops (request out,
 * push back), and jsdom schedules those as macrotasks — so a fixed count of
 * `flush()`es passes alone and fails under a loaded full-suite run. This
 * settles as soon as the condition holds and fails loudly if it never does.
 */
async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await flush();
  }
  throw new Error(`waitFor timed out: ${label}`);
}

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

/** Rows the hosted Table reports, mutable so a test can move the book. */
let bookIds = ['a', 'b', 'c'];
/** Views built by the fake engine and not yet deleted. */
let liveViews = 0;

function fakePerspectiveModule(): () => Promise<PerspectiveModuleLike> {
  return async () => ({
    worker: async () => ({
      table: async () => ({
        update: async () => {},
        delete: async () => {},
        view: async () => {
          liveViews += 1;
          return {
            num_rows: async () => bookIds.length,
            to_columns: async () => ({ id: [...bookIds] }),
            delete: async () => {
              liveViews -= 1;
            },
          };
        },
      }),
      new_proxy_session: () => ({ handle_request: async () => {}, close: async () => {} }),
    }),
  }) as unknown as PerspectiveModuleLike;
}

const CFG = {
  providerId: 'perspective-1',
  providerType: 'mock-perspective',
  keyColumn: 'id',
  tableName: 'positions',
} as unknown as ProviderConfig;

/**
 * A tee-shaped handle over the host's real table factory, so the hub's
 * `getTable('positions')` finds a Table that can build Views.
 */
function registerFakeTee(hub: SharedWorkerDataServicesHub): void {
  registerProvider('mock-perspective', ((cfg: ProviderConfig, emit) => {
    void cfg;
    const built = hub.getPerspectiveHost()!.tableFactoryFor('positions')({ id: 'string' }, 'id');
    emit({ status: 'ready' });
    return {
      tableName: 'positions',
      feed: {
        get table() {
          return {};
        },
        whenReady: () => built,
        changes: {
          watch: () => () => {},
          onChanges: () => () => {},
          watchedFields: [],
          shadowedRows: 0,
        },
      },
      stop: () => {},
      restart: () => {},
    };
  }) as never);
}

function wireTwo() {
  bookIds = ['a', 'b', 'c'];
  liveViews = 0;
  const hub = new SharedWorkerDataServicesHub({
    loadPerspective: fakePerspectiveModule(),
    // Immediate recompute so a test never waits on a throttle window.
    perspectiveQueries: {
      setTimer: (cb) => {
        cb();
        return 0;
      },
      clearTimer: () => {},
    },
  });
  registerFakeTee(hub);
  const attach = attachPortToHub(hub);
  const a = createInPageWiring(attach, { disablePageHideClose: true });
  const b = createInPageWiring(attach, { disablePageHideClose: true });
  return {
    hub,
    clientA: a.client,
    clientB: b.client,
    close: () => {
      a.close();
      b.close();
      void hub.dispose();
    },
  };
}

/** Start the provider so the host actually holds a Table to query. */
async function startProvider(client: { attach: (...args: never[]) => unknown }): Promise<void> {
  (client.attach as unknown as (
    id: string, cfg: ProviderConfig, listener: unknown,
  ) => string)('perspective-1', CFG, { onDelta: () => {}, onStatus: () => {} });
  await flush();
}

describe('perspective query protocol', () => {
  it('round-trips a count subscription over the control port', async () => {
    const { clientA, close } = wireTwo();
    try {
      await startProvider(clientA);
      const seen: PerspectiveQueryResult[] = [];

      clientA.subscribePerspectiveQuery('perspective-1', { kind: 'count' }, (r) => seen.push(r));
      await waitFor(() => seen.length > 0, 'first count push');

      expect(seen.at(-1)).toEqual({ kind: 'count', count: 3 });
    } finally {
      close();
    }
  });

  it('serves two windows from ONE View', async () => {
    const { clientA, clientB, close } = wireTwo();
    try {
      await startProvider(clientA);
      const a: PerspectiveQueryResult[] = [];
      const b: PerspectiveQueryResult[] = [];

      clientA.subscribePerspectiveQuery('perspective-1', { kind: 'count' }, (r) => a.push(r));
      await waitFor(() => a.length > 0, 'window A count push');
      clientB.subscribePerspectiveQuery('perspective-1', { kind: 'count' }, (r) => b.push(r));
      await waitFor(() => b.length > 0, 'window B count push');

      expect(a.at(-1)).toEqual({ kind: 'count', count: 3 });
      expect(b.at(-1)).toEqual({ kind: 'count', count: 3 });
      // The claim this whole layer exists for.
      expect(liveViews).toBe(1);
    } finally {
      close();
    }
  });

  it('unsubscribe from one window leaves the other running', async () => {
    const { hub, clientA, clientB, close } = wireTwo();
    try {
      await startProvider(clientA);
      const b: PerspectiveQueryResult[] = [];

      const handleA = clientA.subscribePerspectiveQuery(
        'perspective-1', { kind: 'count' }, () => {},
      );
      clientB.subscribePerspectiveQuery('perspective-1', { kind: 'count' }, (r) => b.push(r));
      await waitFor(() => b.length > 0, 'window B count push');

      handleA.unsubscribe();
      await flush();
      expect(liveViews).toBe(1);

      const seenBefore = b.length;
      bookIds = ['a', 'b'];
      // A write through the hosted Table is what tells the engine to
      // recompute — the host's `update()` wrapper IS the update signal.
      await hub.getPerspectiveHost()!.getTable('positions')!.update([]);
      await waitFor(() => b.length > seenBefore, 'recompute push after table update');

      expect(b.length).toBeGreaterThan(seenBefore);
      expect(b.at(-1)).toEqual({ kind: 'count', count: 2 });
    } finally {
      close();
    }
  });

  it('a window closing releases its subscriptions and drops the last View', async () => {
    const { clientA, clientB, close } = wireTwo();
    try {
      await startProvider(clientA);

      clientA.subscribePerspectiveQuery('perspective-1', { kind: 'count' }, () => {});
      clientB.subscribePerspectiveQuery('perspective-1', { kind: 'count' }, () => {});
      await waitFor(() => liveViews === 1, 'the shared View to be built');

      // `close()` posts the explicit `port-close` goodbye, which is the only
      // way the hub learns a window went away cleanly.
      clientA.close();
      await flush();
      expect(liveViews).toBe(1);

      clientB.close();
      await waitFor(() => liveViews === 0, 'the last View to be dropped');
      expect(liveViews).toBe(0);
    } finally {
      close();
    }
  });

  it('refuses a query for a provider that hosts no Table, with a reason', async () => {
    const { clientA, close } = wireTwo();
    try {
      const seen: PerspectiveQueryResult[] = [];
      clientA.subscribePerspectiveQuery('not-a-provider', { kind: 'count' }, (r) => seen.push(r));
      await waitFor(() => seen.length > 0, 'refusal push');

      expect(seen.at(-1)).toMatchObject({ kind: 'refused' });
      expect(String((seen.at(-1) as { reason: string }).reason)).toContain(
        'not in the worker catalog',
      );
    } finally {
      close();
    }
  });

  it('refuses every query on a worker built without an engine', async () => {
    const hub = new SharedWorkerDataServicesHub();
    const wiring = createInPageWiring(attachPortToHub(hub), { disablePageHideClose: true });
    try {
      const seen: PerspectiveQueryResult[] = [];
      wiring.client.subscribePerspectiveQuery(
        'perspective-1', { kind: 'count' }, (r) => seen.push(r),
      );
      await waitFor(() => seen.length > 0, 'refusal push');

      expect(seen).toHaveLength(1);
      expect(String((seen[0] as { reason: string }).reason)).toContain(
        'hosts no Perspective engine',
      );
    } finally {
      wiring.close();
      await hub.dispose();
    }
  });
});
