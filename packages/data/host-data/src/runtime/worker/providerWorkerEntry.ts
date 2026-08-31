/**
 * Provider sub-worker — the worker side of `dataPlane: 'subworker'`.
 *
 * Hosts exactly one provider AND owns its data plane: the transport
 * (`startProvider` — STOMP socket, fast frame parser, conflation,
 * projection, unchanged) feeds the hub's own `applyProviderEmit`
 * pipeline running here against a worker-local `ProviderSlot` — row
 * cache, bucketed replay cache, dedupe / key-drop accounting, thin-delta
 * diffing, chunk encoding. One implementation, two threads: the hub runs
 * the very same pipeline for `dataPlane: 'hub'` providers.
 *
 * What leaves the worker: finished wire-event templates (`pw-bcast`)
 * that the hub fans out verbatim, replay chunk runs (`pw-replay-chunks`)
 * for late-joining windows, and pass-through transport events
 * (status / byteSize / rowsReceived / timing) as `pw-emit`. Row objects
 * cross only inside small live `delta` templates (< LIVE_BIN_MIN_ROWS),
 * exactly as the hub's own broadcast rule ships them to windows.
 *
 * Runs as a SharedWorker (production: every subscribing window connects,
 * which keeps it alive; the hub drives it over a transferred port) or as
 * a dedicated worker (tests). `installProviderWorker` takes the worker
 * global so tests can drive it with a fake; `providerWorkerMain.ts` is
 * the real script entry.
 */

import { startProvider } from '../providers/registry.js';
import type { ProviderEmit, ProviderHandle } from '../providers/Provider.js';
import type { Event, ProviderStatus } from '../protocol.js';
import type { ProviderConfig } from '@wellsfargo-starui/types';
import { WorkerAppDataStore } from './WorkerAppDataStore.js';
import { applyProviderEmit, type ProviderEmitContext } from './providerEmit.js';
import { resetProviderStats } from './hubHelpers.js';
import { newReplayCache, ensureReplayChunks, replayFootprintBytes } from './replayCache.js';
import { SEC_WINDOW, MIN_WINDOW, type ProviderSlot } from './hubTypes.js';
import {
  isProviderWorkerRequest,
  type ProviderWorkerMessage,
  type ProviderWorkerRequest,
} from './providerWorkerProtocol.js';

/** One hub-facing channel — a connected `MessagePort`, or the dedicated-worker global. */
export interface ProviderWorkerPort {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((ev: MessageEvent) => void) | null;
  start?(): void;
}

/** The subset of `SharedWorkerGlobalScope` / `DedicatedWorkerGlobalScope` the entry uses. */
export interface ProviderWorkerGlobal {
  /** SharedWorker mode (present, possibly null, on `SharedWorkerGlobalScope`). */
  onconnect?: ((ev: { ports: readonly MessagePort[] }) => void) | null;
  /** Dedicated-worker mode. */
  onmessage?: ((ev: MessageEvent) => void) | null;
  postMessage?(message: unknown): void;
  close?(): void;
}

/** Locations of the Perspective wasm assets for `dataPlane: 'engine'`. */
export interface ProviderEngineAssets {
  clientWasmUrl: string;
  serverWasmUrl: string;
}

export interface InstallProviderWorkerOpts {
  /**
   * Enables the `dataPlane: 'engine'` shadow. Absent (tests, hosts
   * without the wasm assets) an 'engine' cfg runs as plain 'subworker'
   * with a one-line warning.
   */
  engineAssets?: ProviderEngineAssets;
}

export interface InstalledProviderWorker {
  /** Route a request as if it arrived on `from` (tests). */
  handleRequest(req: ProviderWorkerRequest, from: ProviderWorkerPort): void;
  /** Adopt another hub-facing port (what `onconnect` does in SharedWorker mode). */
  connect(port: ProviderWorkerPort): void;
  /** The mirrored AppData lookup the transport resolves against (diagnostics / tests). */
  lookup(name: string, key: string): unknown;
  /** The worker-local slot's cache size (diagnostics / tests). */
  cacheSize(): number;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** A worker-local `ProviderSlot` — the same shape the hub builds, minus a live handle. */
function newWorkerSlot(cfg: ProviderConfig): ProviderSlot {
  const now = Date.now();
  const flags = cfg as { keyColumn?: string | readonly string[]; thinDeltas?: boolean; wireFormat?: string };
  return {
    handle: { stop() { /* owned by the entry */ }, restart() { /* owned by the entry */ } },
    cfg,
    dataPlane: 'subworker',
    cache: new Map<string, unknown>(),
    status: 'loading',
    byteCount: 0,
    msgCount: 0,
    msgsByBucket: Array.from({ length: SEC_WINDOW }, () => 0),
    bucketIdx: 0,
    startedAt: now,
    lastMessageAt: null,
    errorCount: 0,
    snapshotFetchStartedAt: now,
    snapshotFetchMs: null,
    restartRequestMs: null,
    firstMessageMs: null,
    snapshotReady: false,
    publishCount: 0,
    pubsByBucket: Array.from({ length: SEC_WINDOW }, () => 0),
    pubsByMinBucket: Array.from({ length: MIN_WINDOW }, () => 0),
    minBucketIdx: 0,
    publishWindowSeconds: 0,
    keyDropCount: 0,
    keyDropWarned: false,
    activeRestartExtra: null,
    replay: newReplayCache(),
    thinDeltas: flags.thinDeltas === true && flags.keyColumn !== undefined,
    columnar: flags.wireFormat !== 'json',
  };
}

export function installProviderWorker(
  selfRef: ProviderWorkerGlobal = globalThis as unknown as ProviderWorkerGlobal,
  installOpts: InstallProviderWorkerOpts = {},
): InstalledProviderWorker {
  const shared = 'onconnect' in selfRef;
  const appData = new WorkerAppDataStore();
  let handle: ProviderHandle | null = null;
  let slot: ProviderSlot | null = null;
  let providerId = '';
  let dataListenerCount = 0;
  /** `dataPlane: 'engine'` shadow (Phase 2 measurement stage). */
  let engine: import('./engine/providerEngine.js').ProviderEngine | null = null;
  /** True once the transport's raw-frame tap has fired — the rows-emit feed then stands down. */
  let engineFrameSeen = false;
  /** The port that sent the current `pw-start` — where emits go. */
  let active: ProviderWorkerPort | null = null;

  const post = (message: ProviderWorkerMessage): void => active?.postMessage(message);
  const appDataLookup = (name: string, key: string): unknown => appData.get(name, key);

  /** Wire-event templates collected by one `applyProviderEmit` rows call. */
  const batchEvents: Event[] = [];
  const workerCtx: ProviderEmitContext = {
    dataListenerCount: () => dataListenerCount,
    broadcast: (_providerId, _slot, eventTemplate) => {
      batchEvents.push(eventTemplate);
    },
    flushStats: () => {
      /* stats listeners live in the hub; timing/status flow via pw-emit */
    },
  };

  const emit: ProviderEmit = (event) => {
    const s = slot;
    if (!s) return;
    if ('rows' in event) {
      batchEvents.length = 0;
      applyProviderEmit(workerCtx, providerId, s, event);
      // Object-path engine feed — only until the transport's raw-frame
      // tap takes over (STOMP; text-first), so nothing ingests twice.
      if (engine && !engineFrameSeen) engine.ingest(event.rows, event.replace === true);
      const engineStats = engine?.stats();
      post({
        kind: 'pw-bcast',
        events: batchEvents.slice(),
        meta: {
          rowCount: event.rows.length,
          cacheSize: s.cache.size,
          cacheBytes: replayFootprintBytes(s.replay),
          keyDropCount: s.keyDropCount,
          engineRows: engineStats?.rows,
          engineError: engineStats?.error,
        },
      });
      return;
    }
    if ('status' in event) {
      // Mirror the two slot transitions the hub applies on status, so the
      // worker's binary/thin-delta decisions match the hub's view.
      if (event.status === 'loading') {
        resetProviderStats(s);
        engine?.reset(); // restart — the refilling stream rebuilds the table
      } else if (event.status === 'ready') s.snapshotReady = true;
      s.status = event.status as ProviderStatus;
    }
    post({ kind: 'pw-emit', event });
  };

  const start = (req: Extract<ProviderWorkerRequest, { kind: 'pw-start' }>, from: ProviderWorkerPort): void => {
    for (const row of req.appData) appData.upsert(row);
    if (handle) {
      const old = handle;
      handle = null;
      // Synchronous — a superseded transport must be torn down before the
      // replacement dials (same turn, like the hub's recreate always was).
      try {
        void Promise.resolve(old.stop()).catch(() => undefined);
      } catch { /* stop() threw synchronously — nothing left to tear down */ }
    }
    active = from;
    providerId = req.providerId;
    dataListenerCount = req.dataListenerCount;
    slot = newWorkerSlot(req.cfg);
    engine?.dispose();
    engine = null;
    engineFrameSeen = false;
    if ((req.cfg as { dataPlane?: string }).dataPlane === 'engine') {
      if (!installOpts.engineAssets) {
        // eslint-disable-next-line no-console
        console.warn(`[provider-worker] '${req.providerId}' asked for dataPlane 'engine' but no engine assets are configured — running as plain subworker`);
      } else {
        const assets = installOpts.engineAssets;
        const engineCfg = req.cfg as {
          keyColumn?: string | readonly string[];
          columnDefinitions?: readonly import('@wellsfargo-starui/types').ColumnDefinition[];
        };
        void import('./engine/providerEngine.js')
          .then((m) => m.startProviderEngine({
            providerId: req.providerId,
            keyColumn: engineCfg.keyColumn,
            columnDefinitions: engineCfg.columnDefinitions,
            clientWasmUrl: assets.clientWasmUrl,
            serverWasmUrl: assets.serverWasmUrl,
          }))
          .then((e) => {
            // A restart may have superseded this boot.
            if (slot && providerId === req.providerId) {
              engine = e;
              // One-shot catch-up: everything the stream delivered while
              // the engine booted is in the worker's row cache. Enqueued
              // FIRST, so tapped frames that follow apply on top.
              const cached = [...slot.cache.values()];
              if (cached.length > 0) e.ingest(cached, true);
            } else e.dispose();
          })
          .catch((err: unknown) => {
            // eslint-disable-next-line no-console
            console.warn(`[provider-worker] '${req.providerId}' engine boot failed — running as plain subworker`, err);
          });
      }
    }
    try {
      handle = startProvider(req.cfg, emit, {
        appDataLookup,
        // Raw-frame tap (STOMP): text-first engine ingest. Frames before
        // the engine boots are covered by the cache catch-up above.
        frameTap: (bodyText, rows) => {
          engineFrameSeen = true;
          engine?.ingestFrame(bodyText, rows);
        },
      });
    } catch (err) {
      post({ kind: 'pw-error', error: errorMessage(err), fatal: true });
      return;
    }
    post({ kind: 'pw-started' });
    if (req.extra) restart(req.extra);
  };

  const restart = (extra: Record<string, unknown> | undefined): void => {
    if (!handle) return;
    try {
      void Promise.resolve(handle.restart(extra)).catch((err: unknown) => {
        post({ kind: 'pw-error', error: errorMessage(err), fatal: false });
      });
    } catch (err) {
      post({ kind: 'pw-error', error: errorMessage(err), fatal: false });
    }
  };

  const replay = (reqId: string, from: ProviderWorkerPort): void => {
    const s = slot;
    if (!s) {
      from.postMessage({ kind: 'pw-replay-chunks', reqId, chunks: [], cacheSize: 0 } satisfies ProviderWorkerMessage);
      return;
    }
    // Synchronous, so the chunk run is atomic against the live stream.
    const chunks = s.cache.size === 0 ? [] : ensureReplayChunks(s.replay, s.cache, s.columnar);
    from.postMessage({
      kind: 'pw-replay-chunks',
      reqId,
      chunks,
      cacheSize: s.cache.size,
    } satisfies ProviderWorkerMessage);
  };

  const stop = (from: ProviderWorkerPort): void => {
    const current = handle;
    handle = null;
    slot = null;
    engine?.dispose();
    engine = null;
    // Synchronous — the hub's idle-teardown / explicit-stop semantics
    // expect the transport to disconnect in the same turn; only the
    // returned promise (if any) is awaited before the `pw-stopped` ack.
    let result: void | Promise<void>;
    try {
      result = current?.stop();
    } catch {
      result = undefined;
    }
    void Promise.resolve(result)
      .catch(() => undefined)
      .then(() => {
        from.postMessage({ kind: 'pw-stopped' } satisfies ProviderWorkerMessage);
        if (active === from) active = null;
        // A SharedWorker stays up for the next `pw-start` (other windows
        // may still hold it); a dedicated worker has nothing left to do.
        if (!shared) selfRef.close?.();
      });
  };

  const handleRequest = (req: ProviderWorkerRequest, from: ProviderWorkerPort): void => {
    switch (req.kind) {
      case 'pw-start':
        start(req, from);
        return;
      case 'pw-restart':
        restart(req.extra);
        return;
      case 'pw-appdata':
        if (req.op === 'upsert') appData.upsert(req.row);
        else appData.remove(req.row.configId);
        return;
      case 'pw-listeners':
        dataListenerCount = req.data;
        return;
      case 'pw-replay':
        replay(req.reqId, from);
        return;
      case 'pw-ping':
        from.postMessage({ kind: 'pw-pong' } satisfies ProviderWorkerMessage);
        return;
      case 'pw-stop':
        stop(from);
        return;
      default:
        return;
    }
  };

  const connect = (port: ProviderWorkerPort): void => {
    port.onmessage = (ev: MessageEvent) => {
      if (isProviderWorkerRequest(ev.data)) handleRequest(ev.data, port);
    };
    port.start?.();
  };

  if (shared) {
    selfRef.onconnect = (ev) => {
      const port = ev.ports[0];
      if (port) connect(port);
    };
  } else if (typeof selfRef.postMessage === 'function') {
    const globalPort: ProviderWorkerPort = {
      postMessage: (m) => selfRef.postMessage!(m),
      onmessage: null,
    };
    selfRef.onmessage = (ev: MessageEvent) => {
      if (isProviderWorkerRequest(ev.data)) handleRequest(ev.data, globalPort);
    };
  }

  return { handleRequest, connect, lookup: appDataLookup, cacheSize: () => slot?.cache.size ?? 0 };
}
