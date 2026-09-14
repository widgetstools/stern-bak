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
 * lives in `createDataServicesWorker()` / `createPlatformServicesWorker()`
 * behind `ensurePlatformReady` — apps should not duplicate a worker entry
 * unless they need bespoke hub wiring.
 *
 * `installSharedWorkerHub` and `installPlatformServicesHost` share one
 * port-lifecycle `install()`. The SharedWorker `onconnect` handler is
 * registered synchronously at its start — ports that connect while the
 * platform host hydrates its catalog + AppData are queued and attached once
 * it is ready, so early main-thread clients are not dropped. The data hub
 * has nothing to hydrate (worker-split W1c): it reads config on demand at
 * provider lifecycle moments.
 */

import {
  SharedWorkerDataServicesHub,
  type SharedWorkerDataServicesHubOpts,
  type PortLike,
} from './SharedWorkerDataServicesHub.js';
import { PlatformServicesHost, type PlatformServicesHostOpts } from './PlatformServicesHost.js';
import { isRequest, isAppDataRequest } from '../protocol.js';

interface SharedWorkerLike {
  onconnect: ((ev: { ports: readonly MessagePort[] }) => void) | null;
}

interface DedicatedWorkerLike {
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
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

/**
 * The request surface `install()` needs — satisfied by both the full data
 * hub and the platform-services host, so one attach/dispatch/hydrate path
 * serves both worker kinds (worker-split plan W1b).
 */
interface InstallableHost {
  handleRequest(port: PortLike, req: never): void;
  /** AppData is served by the platform-services host only (worker-split W1c). */
  handleAppDataRequest?(port: PortLike, req: never): void;
  hydrateCatalog?(): Promise<void>;
  hydrateAppData?(userId?: string): Promise<void>;
  onPortClosed(port: PortLike): void;
  dispose(): Promise<void>;
}

export interface InstalledPlatformServices {
  host: PlatformServicesHost;
  stop(): Promise<void>;
}

/**
 * Install the PLATFORM-SERVICES host on this worker global — catalog RPCs
 * + AppData only (worker-split plan W1b). Same port lifecycle as
 * {@link installSharedWorkerHub}, different brain.
 */
export async function installPlatformServicesHost(
  opts: PlatformServicesHostOpts & Pick<InstallOpts, 'selfRef' | 'hydrateUserId' | 'adoptPorts'> = {},
): Promise<InstalledPlatformServices> {
  const host = new PlatformServicesHost(opts);
  await install(host as InstallableHost, opts, Boolean(opts.configManager));
  return { host, stop: () => host.dispose() };
}

export async function installSharedWorkerHub(opts: InstallOpts = {}): Promise<InstalledWorker> {
  const hub = new SharedWorkerDataServicesHub(opts);

  await install(hub as unknown as InstallableHost, opts, Boolean(opts.configManager), opts.hydrateUserId);
  return {
    hub,
    stop: () => hub.dispose(),
  };
}

/**
 * Shared port-lifecycle install for both worker brains.
 *
 * ORDERING IS THE CONTRACT (WORKLOG item 14 class, worker-split plan W2):
 * every port gets its message listener the moment it is known — adopted
 * ports immediately, `onconnect` ports as they arrive — and dispatch is
 * merely DEFERRED until hydrate completes. `defaultEntry` had to
 * `start()` each port to receive the bootstrap handshake, and a started
 * port with no listener drops messages on the floor: attaching adopted
 * ports only after the hydrate awaits lost every request a window sent in
 * that window (its AppData attach, `hub-ready`, the first `get-config`),
 * so the window's readiness promises never settled and the first grid
 * paid the client-side retry. Requests now queue, in arrival order, and
 * replay once the host is ready; a request's reply is bounded by
 * `hubCatalogRpc`'s deadline from the moment it is dispatched.
 */
async function install(
  host: InstallableHost,
  opts: Pick<InstallOpts, 'selfRef' | 'adoptPorts'>,
  hydrate: boolean,
  hydrateUserId?: string,
): Promise<void> {
  const globalRef = (opts.selfRef ?? globalThis) as
    Partial<SharedWorkerLike> & Partial<DedicatedWorkerLike>;

  // Requests received before hydrate finished, in arrival order.
  const backlog: Array<[PortLike, unknown]> = [];
  let ready = false;

  const route = (target: PortLike, data: unknown) => {
    if (isRequest(data)) host.handleRequest(target, data as never);
    else if (isAppDataRequest(data)) host.handleAppDataRequest?.(target, data as never);
  };
  const dispatch = (target: PortLike, data: unknown) => {
    if (ready) route(target, data);
    else backlog.push([target, data]);
  };

  const attach = (port: MessagePort): PortLike => {
    const onMessage = (ev: MessageEvent) => dispatch(portLike, ev.data);
    const onError = () => host.onPortClosed(portLike);
    const portLike: PortLike = {
      postMessage: (m) => port.postMessage(m),
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
  // a handler set only after the hydrate awaits drops the first port and
  // `appData.ready()` hangs forever. The port is attached at once; what
  // it sends during hydrate lands in the backlog.
  if ('onconnect' in globalRef) {
    (globalRef as SharedWorkerLike).onconnect = (ev) => {
      const port = ev.ports[0];
      if (port) attach(port);
    };
  }

  // Adopt first: the listener goes on NOW, and each port's pre-handover
  // buffer is queued ahead of anything it sends afterwards, so per-port
  // order holds across the handover.
  for (const adopted of opts.adoptPorts ?? []) {
    const portLike = attach(adopted.port);
    for (const data of adopted.buffered) backlog.push([portLike, data]);
  }

  // Hydrate catalog + AppData from IndexedDB before answering any request.
  // No-op when no ConfigManager was supplied (e.g. test installs that
  // don't exercise persistence).
  if (hydrate) {
    await host.hydrateCatalog?.();
    await host.hydrateAppData?.(hydrateUserId ?? 'worker');
  }

  ready = true;
  for (const [target, data] of backlog) route(target, data);
  backlog.length = 0;

  // Dedicated Worker path — the worker's own message channel.
  if ('onmessage' in globalRef && 'postMessage' in globalRef) {
    const dw = globalRef as DedicatedWorkerLike;
    const fakePort: PortLike = { postMessage: (m) => dw.postMessage(m) };
    dw.onmessage = (ev: MessageEvent) => dispatch(fakePort, ev.data);
  }
}
