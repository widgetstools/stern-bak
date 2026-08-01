/**
 * bootstrapDataServices() — low-level wiring for a pre-constructed SharedWorker.
 *
 * App entry should prefer {@link ensureDataServicesHub} /
 * {@link ensurePlatformReady} (catalog preload + hub bundle). This
 * function remains for bespoke worker setups and legacy call sites.
 *
 * Constructs a `SharedWorkerDataServicesClient` around a caller-
 * provided `SharedWorker`, attaches one `AppDataMirror` shared by
 * the whole app, and returns the bundle as a `DataServices` object.
 *
 * Idempotent by `appName`. Same `appName` → same object reference,
 * so two parts of the app booting independently still share one
 * client + one mirror.
 *
 * The caller constructs the `SharedWorker` because Vite's worker
 * plugin requires the literal
 *   `new SharedWorker(new URL('./file.ts', import.meta.url), {...})`
 * at the call site (static analysis emits the worker chunk and
 * rewrites the URL). Bootstrap can't construct it itself without
 * defeating that.
 */

import type { ConfigManager } from '@wellsfargo-starui/core/host/config';
import { SharedWorkerDataServicesClient } from '../client/SharedWorkerDataServicesClient.js';
import type { AppDataMirror } from '../mirror/AppDataMirror.js';

export interface BootstrapDataServicesOpts {
  /**
   * Idempotency key. Calls with the same `appName` return the same
   * `DataServices` object.
   *
   * NOT the `SharedWorker.name` — that's the caller's choice when
   * constructing the worker. This is bootstrap-side bookkeeping.
   */
  appName: string;

  /**
   * Pre-constructed SharedWorker. Bootstrap reads `worker.port` and
   * does nothing else with it — the caller retains ownership.
   *
   * Tests can pass `{ port: messageChannel.port1 }` cast as
   * `SharedWorker`; structural typing means only `.port` matters.
   */
  worker: SharedWorker;

  /**
   * Pre-constructed client around `worker.port`. When provided, bootstrap
   * adopts it instead of wrapping the port itself — used by the hub path
   * so an early-opened connection (worker warm-up) and the hub share one
   * MessagePort. `dispose()` closes it either way.
   */
  client?: SharedWorkerDataServicesClient;

  /**
   * ConfigManager used by the AppData mirror for persistence reads
   * (initial seed) and writes (durable upserts/removes).
   */
  configManager: ConfigManager;

  /**
   * Logged-in user id. Stamped onto AppData rows created by this
   * client. Same constant the rest of the app uses
   * (`LOGGED_IN_USER_ID`).
   */
  userId: string;
}

export interface DataServices {
  /** Live data subscription client. Wraps the SharedWorker port. */
  client: SharedWorkerDataServicesClient;
  /** App-wide AppDataMirror. Sync reads, async writes. */
  appData: AppDataMirror;
  /** ConfigManager passed in at bootstrap time. */
  configManager: ConfigManager;
  /** Resolves once the AppDataMirror's first snapshot has arrived. */
  ready: Promise<void>;
  /**
   * Tear down. Detaches the mirror, closes the client port, removes
   * the appName entry from the bootstrap registry. Idempotent.
   *
   * After dispose, a fresh `bootstrapDataServices({appName: ...})`
   * with the same appName produces a NEW `DataServices` object.
   */
  dispose(): void;
}

const registry = new Map<string, DataServices>();

export function bootstrapDataServices(opts: BootstrapDataServicesOpts): DataServices {
  const existing = registry.get(opts.appName);
  if (existing) return existing;

  const client = opts.client ?? new SharedWorkerDataServicesClient(opts.worker.port);
  // The mirror is now a pure RPC client — it sends operations to the
  // hub and receives snapshot/delta events back. The hub owns
  // IndexedDB persistence (it constructs its own ConfigManager inside
  // the SharedWorker context). `opts.configManager` stays on the
  // bundle for editor flows (`DataProviderConfigStore`) but doesn't
  // flow into the mirror anymore.
  const appData = client.attachAppData({ userId: opts.userId });

  // Fire the seed read + worker round-trip immediately. Errors here
  // surface through the mirror's existing `console.warn` path —
  // bootstrap doesn't await so callers aren't blocked at module
  // init. The `ready` promise is the explicit suspend point.
  void appData.attach();

  let disposed = false;

  const services: DataServices = {
    client,
    appData,
    configManager: opts.configManager,
    ready: appData.ready(),
    dispose() {
      if (disposed) return;
      disposed = true;
      try { client.detachAppData(appData); } catch { /* port may already be dead */ }
      try { client.close(); } catch { /* idempotent */ }
      if (registry.get(opts.appName) === services) {
        registry.delete(opts.appName);
      }
    },
  };

  registry.set(opts.appName, services);
  return services;
}

/**
 * Test-only escape hatch. The bootstrap registry is module-scope, so
 * vitest's per-file isolation isn't enough on its own — tests in the
 * same file would leak state across `it` blocks. Tests call this in
 * `afterEach`.
 *
 * Public consumers should use `dispose()` on the returned
 * `DataServices` object, which already removes the registry entry.
 */
export function _resetBootstrapRegistryForTests(): void {
  for (const services of registry.values()) {
    try { services.dispose(); } catch { /* best-effort */ }
  }
  registry.clear();
}
