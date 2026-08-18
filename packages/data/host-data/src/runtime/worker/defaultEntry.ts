/**
 * Default SharedWorker entry for `@wellsfargo-starui/data`.
 *
 * Bootstrap fields (`appId`, `userId`, seed URL, REST URL) arrive as a
 * `worker-bootstrap` message on the first client port.
 *
 * They used to be written to localStorage by the main thread and read back
 * here — which could never work: a SharedWorker global has neither
 * `localStorage` nor `sessionStorage`, so the read always returned `null`
 * and all four fields were always `undefined`. The worker's ConfigManager
 * then silently ran local/anonymous, ignoring `configServiceRestUrl`
 * entirely. The port is the only channel that actually reaches in here.
 *
 * Ordering matters. The ConfigManager cannot be constructed until the
 * payload arrives (`createConfigManager` takes `appId`/`identity`/REST URL
 * at construction), and the payload cannot arrive until we are listening —
 * so this entry accepts ports itself, buffers what they send, and hands
 * them to `installSharedWorkerHub` via `adoptPorts` once the hub is
 * buildable. Nothing a client sent in the meantime is dropped.
 *
 * Apps that need bespoke worker setup should keep their own worker file and
 * call `installSharedWorkerHub({...})` directly.
 */

import { installSharedWorkerHub, type AdoptedPort } from './index.js';
import { createConfigManager } from '@wellsfargo-starui/core/host/config';
import {
  isWorkerBootstrapRequest,
  type WorkerBootstrapPayload,
} from '../protocol.js';

/**
 * How long to wait for a client's bootstrap handshake before booting
 * local/anonymous. Clients post it immediately on connect, so this only
 * trips for a client predating the handshake — in which case degrading to
 * the old local-only behaviour beats hanging the worker forever.
 */
const BOOTSTRAP_TIMEOUT_MS = 5_000;

interface CapturedPort {
  port: MessagePort;
  buffered: unknown[];
  listener: (ev: MessageEvent) => void;
}

const captured: CapturedPort[] = [];
let resolveBootstrap: ((payload: WorkerBootstrapPayload | null) => void) | null = null;
let settled = false;

const firstBootstrap = new Promise<WorkerBootstrapPayload | null>((resolve) => {
  resolveBootstrap = resolve;
});

function settle(payload: WorkerBootstrapPayload | null): void {
  if (settled) return;
  settled = true;
  resolveBootstrap?.(payload);
}

/**
 * Accept a port before the hub exists. Registered synchronously at module
 * evaluation: browsers fire `connect` as soon as the main thread constructs
 * the SharedWorker, and a port dropped here is a client that hangs forever.
 */
function capture(port: MessagePort): void {
  const entry: CapturedPort = {
    port,
    buffered: [],
    listener: (ev: MessageEvent) => {
      if ((ev.data as { kind?: string } | null)?.kind === 'worker-bootstrap') {
        // A malformed/identity-less handshake still settles — it is an
        // explicit "boot anonymous" answer, not a reason to wait out the
        // timeout.
        settle(isWorkerBootstrapRequest(ev.data) ? ev.data.payload : null);
        return;
      }
      entry.buffered.push(ev.data);
    },
  };
  captured.push(entry);
  port.addEventListener('message', entry.listener);
  port.start();
}

const globalRef = globalThis as unknown as {
  onconnect: ((ev: { ports: readonly MessagePort[] }) => void) | null;
};
globalRef.onconnect = (ev) => {
  const port = ev.ports[0];
  if (port) capture(port);
};

/**
 * Hand every captured port to the hub.
 *
 * Our listener deliberately STAYS attached: `installSharedWorkerHub` awaits
 * `hydrateCatalog()` + `hydrateAppData()` before it can attach its own, and
 * these ports are already `start()`ed — a started MessagePort discards
 * messages that arrive with no listener rather than re-queueing them. So
 * detaching here would silently drop everything a client sent across that
 * hydration window, which is precisely when clients send `appdata-attach`.
 *
 * Instead the hub calls `release()` synchronously immediately before it
 * attaches, and reads the (live, still-growing) `buffered` array in the same
 * turn. Nothing can slip through: port messages arrive as tasks.
 */
function takeCapturedPorts(): AdoptedPort[] {
  const adopted = captured.map(({ port, buffered, listener }) => ({
    port,
    buffered,
    release: () => port.removeEventListener('message', listener),
  }));
  captured.length = 0;
  return adopted;
}

function withTimeout(): Promise<WorkerBootstrapPayload | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
       
      console.warn(
        '[@wellsfargo-starui/data worker] no worker-bootstrap message within '
          + `${BOOTSTRAP_TIMEOUT_MS}ms — booting local/anonymous. The client is `
          + 'likely older than the bootstrap handshake.',
      );
      resolve(null);
    }, BOOTSTRAP_TIMEOUT_MS);
    void firstBootstrap.then((payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

async function boot(): Promise<void> {
  const payload = await withTimeout();

  const configManager = createConfigManager({
    configServiceRestUrl: payload?.configServiceRestUrl,
    appId: payload?.appId,
    identity: payload?.userId
      ? { userId: payload.userId, displayName: payload.userId }
      : undefined,
    seedConfigUrl: payload?.seedConfigUrl,
    seedConfigReload: payload?.seedConfigReload,
  });
  // Full init (including seedIfEmpty) is intentional and must stay. The
  // worker is the deterministic seeder + the stale-warm safety net: a
  // SharedWorker has no localStorage/sessionStorage, so it cannot read
  // the cross-window "warm" marker and therefore cannot attach the way a
  // warm main-thread window does. seedIfEmpty's in-lock emptiness check
  // makes this a no-op (no fetch, no write) whenever the DB is already
  // populated, so there is no redundant work to "optimize away" here —
  // converting this to attach mode would silently break recovery after a
  // wiped IndexedDB. See docs/CONFIG_SERVICE_BASELINE.md §4.5.
  await configManager.init();

  // Must stay in one synchronous turn: `installSharedWorkerHub` reassigns
  // `onconnect` before its first await, so no port can connect between
  // handover and the hub taking over.
  const adoptPorts = takeCapturedPorts();
  await installSharedWorkerHub({ configManager, adoptPorts });

   
  console.info(
    `[@wellsfargo-starui/data worker] ConfigManager initialised (mode: ${configManager.isRestMode() ? 'REST' : 'local'})`,
  );
   
  console.info('[@wellsfargo-starui/data worker] catalog + AppData hydrated; hub waiting for ports');
}

boot().catch((err) => {
   
  console.error('[@wellsfargo-starui/data worker] boot failed', err);
  throw err;
});
