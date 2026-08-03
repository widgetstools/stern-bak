/**
 * Worker entry — installs the SharedWorkerDataServicesHub on a
 * SharedWorker / dedicated Worker global. Consumers import this from
 * their own worker file:
 *
 *     // app/dataServices.sharedWorker.ts
 *     import { installSharedWorkerHub } from '@wellsfargo-starui/data/runtime/sharedWorker';
 *     import { createConfigManager } from '@wellsfargo-starui/core/host/config';
 *
 *     const cm = createConfigManager({});
 *     await cm.init();
 *     await installSharedWorkerHub({ configManager: cm });
 *
 * The colocated `new SharedWorker(new URL('../../assets/data-services-worker.mjs', import.meta.url))`
 * lives in `createDataServicesClient()` — apps should not duplicate a worker
 * entry unless they need bespoke hub wiring.
 *
 * `installSharedWorkerHub` is async so callers can await the hub's
 * AppData hydration before port traffic is handled. The SharedWorker
 * `onconnect` handler is registered synchronously at the start of
 * install — ports that connect during hydration are queued and
 * attached once the hub is ready, so early main-thread clients are
 * not dropped.
 */

import {
  SharedWorkerDataServicesHub,
  type SharedWorkerDataServicesHubOpts,
  type PortLike,
} from './SharedWorkerDataServicesHub.js';
import { isRequest, isAppDataRequest } from '../protocol.js';

interface SharedWorkerLike {
  onconnect: ((ev: { ports: readonly MessagePort[] }) => void) | null;
}

interface DedicatedWorkerLike {
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

/**
 * A port the caller accepted *before* the hub existed, handed over for the
 * hub to take ownership of.
 *
 * `defaultEntry` must accept ports before `installSharedWorkerHub` is even
 * callable: it cannot build the hub's ConfigManager until a client sends the
 * bootstrap payload, and the only way to receive that is to already be
 * listening. Anything else that arrived on the port meanwhile (a client
 * fires `appdata-attach` immediately after connecting) is buffered by the
 * caller and replayed here, in arrival order, so no request is lost.
 */
export interface AdoptedPort {
  port: MessagePort;
  /** Non-bootstrap messages received before adoption, in arrival order. */
  buffered: readonly unknown[];
}

export interface InstallOpts extends SharedWorkerDataServicesHubOpts {
  /** Inject the global for tests. Defaults to `globalThis`. */
  selfRef?: unknown;
  /**
   * userId passed to `hub.hydrateAppData()` — only used as a
   * placeholder argument since AppData rows are global. Default
   * `'worker'`.
   */
  hydrateUserId?: string;
  /**
   * Ports already accepted by the caller, with anything they received
   * before handover. The caller MUST have removed its own listeners
   * first, and MUST call this in the same synchronous turn as building
   * the list — `onconnect` is reassigned below without an intervening
   * await, so no connection can slip between the two.
   */
  adoptPorts?: readonly AdoptedPort[];
}

export interface InstalledWorker {
  hub: SharedWorkerDataServicesHub;
  /** Stop accepting new ports, dispose the Hub. Used by tests. */
  stop(): Promise<void>;
}

export async function installSharedWorkerHub(opts: InstallOpts = {}): Promise<InstalledWorker> {
  const hub = new SharedWorkerDataServicesHub(opts);

  const globalRef = (opts.selfRef ?? globalThis) as
    Partial<SharedWorkerLike> & Partial<DedicatedWorkerLike>;

  const pendingPorts: MessagePort[] = [];
  let attachPort: ((port: MessagePort) => void) | null = null;

  const dispatch = (target: PortLike, data: unknown) => {
    if (isRequest(data)) hub.handleRequest(target, data);
    else if (isAppDataRequest(data)) hub.handleAppDataRequest(target, data);
  };

  const attach = (port: MessagePort): PortLike => {
    const onMessage = (ev: MessageEvent) => dispatch(portLike, ev.data);
    const onError = () => hub.onPortClosed(portLike);
    const portLike: PortLike = {
      // Two overloads rather than always passing the list: `postMessage(m,
      // [])` is legal but `postMessage(m, undefined)` is not, and every
      // caller except the Perspective attach reply omits it.
      postMessage: (m, transfer) =>
        transfer && transfer.length > 0
          ? port.postMessage(m, transfer as Transferable[])
          : port.postMessage(m),
      dispose: () => {
        try {
          port.removeEventListener('message', onMessage);
          port.removeEventListener('messageerror', onError);
        } catch {
          /* port may already be closed */
        }
      },
    };
    port.addEventListener('message', onMessage);
    port.addEventListener('messageerror', onError);
    port.start();
    return portLike;
  };

  // Register onconnect BEFORE async hydration. Browsers fire `connect`
  // as soon as the main thread constructs `new SharedWorker(...)` —
  // if we only set this handler after `await hub.hydrateAppData()`,
  // the first port is dropped and `appData.ready()` hangs forever.
  if ('onconnect' in globalRef) {
    (globalRef as SharedWorkerLike).onconnect = (ev) => {
      const port = ev.ports[0];
      if (!port) return;
      if (attachPort) attachPort(port);
      else pendingPorts.push(port);
    };
  }

  // Hydrate catalog + AppData from IndexedDB before handling port traffic.
  // No-op when no ConfigManager was supplied (e.g. test installs that
  // don't exercise persistence).
  if (opts.configManager) {
    await hub.hydrateCatalog();
    await hub.hydrateAppData(opts.hydrateUserId ?? 'worker');
  }

  attachPort = attach;

  // Adopt first, and replay each port's backlog immediately after attaching
  // it, so a client's pre-handover messages are still processed ahead of
  // anything it sends afterwards.
  for (const adopted of opts.adoptPorts ?? []) {
    const portLike = attach(adopted.port);
    for (const data of adopted.buffered) dispatch(portLike, data);
  }

  for (const port of pendingPorts) attach(port);
  pendingPorts.length = 0;

  // Dedicated Worker path — the worker's own message channel.
  if ('onmessage' in globalRef && 'postMessage' in globalRef) {
    const dw = globalRef as DedicatedWorkerLike;
    const fakePort: PortLike = {
      postMessage: (m, transfer) =>
        transfer && transfer.length > 0
          ? dw.postMessage(m, transfer as Transferable[])
          : dw.postMessage(m),
    };
    dw.onmessage = (ev: MessageEvent) => {
      if (isRequest(ev.data)) hub.handleRequest(fakePort, ev.data);
      else if (isAppDataRequest(ev.data)) hub.handleAppDataRequest(fakePort, ev.data);
    };
  }

  return {
    hub,
    stop: () => hub.dispose(),
  };
}
