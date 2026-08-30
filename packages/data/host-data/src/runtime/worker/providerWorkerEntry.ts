/**
 * Provider sub-worker — the worker side of `dataPlane: 'subworker'`.
 *
 * Hosts exactly one provider. Runs as a SharedWorker (production: every
 * subscribing window connects, which keeps it alive; the hub drives it
 * over a port one of those windows transferred) or as a dedicated worker
 * (a runtime whose hub can spawn workers, or tests). On `pw-start` it runs
 * the ordinary `startProvider(cfg, emit)` — STOMP socket + fast frame
 * parser + conflation + projection, the whole transport, unchanged — with
 * `emit` bound to the port that sent `pw-start`, so every
 * `ProviderEmitEvent` reaches the hub as a `pw-emit` message.
 *
 * `installProviderWorker` takes the worker global so tests can drive it
 * with a fake; `providerWorkerMain.ts` is the real script entry.
 */

import { startProvider } from '../providers/registry.js';
import type { EncodedChunk, ProviderEmit, ProviderHandle } from '../providers/Provider.js';
import { WorkerAppDataStore } from './WorkerAppDataStore.js';
import { encodeChunk } from './hubEncoding.js';
import { LATE_JOIN_CHUNK_SIZE, LIVE_BIN_MIN_ROWS } from './hubTypes.js';
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

/**
 * A chunk's bytes as a transferable buffer: the encoder may hand back a
 * view into a larger (possibly reused) buffer, which must be copied
 * rather than detached from under it.
 */
function transferableBuffer(chunk: EncodedChunk): ArrayBuffer {
  const { buf } = chunk;
  if (buf.byteOffset === 0 && buf.byteLength === buf.buffer.byteLength && buf.buffer instanceof ArrayBuffer) {
    return buf.buffer;
  }
  const copy = buf.slice();
  chunk.buf = copy;
  return copy.buffer as ArrayBuffer;
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

export interface InstalledProviderWorker {
  /** Route a request as if it arrived on `from` (tests). */
  handleRequest(req: ProviderWorkerRequest, from: ProviderWorkerPort): void;
  /** Adopt another hub-facing port (what `onconnect` does in SharedWorker mode). */
  connect(port: ProviderWorkerPort): void;
  /** The mirrored AppData lookup the transport resolves against (diagnostics / tests). */
  lookup(name: string, key: string): unknown;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function installProviderWorker(
  selfRef: ProviderWorkerGlobal = globalThis as unknown as ProviderWorkerGlobal,
): InstalledProviderWorker {
  const shared = 'onconnect' in selfRef;
  const appData = new WorkerAppDataStore();
  let handle: ProviderHandle | null = null;
  /** The port that sent the current `pw-start` — where emits go. */
  let active: ProviderWorkerPort | null = null;
  /** `cfg.wireFormat !== 'json'` for the running provider — the hub's own chunk codec rule. */
  let columnar = true;

  const post = (message: ProviderWorkerMessage, transfer?: Transferable[]): void =>
    active?.postMessage(message, transfer);

  // Encode here what the hub would otherwise encode on its thread —
  // snapshot batches and large live batches — and ship the bytes
  // zero-copy. The hub decodes once for its cache and relays the chunks.
  const emit: ProviderEmit = (event) => {
    if ('rows' in event && (event.replace || event.rows.length >= LIVE_BIN_MIN_ROWS)) {
      const encoded: EncodedChunk[] = [];
      const transfer: Transferable[] = [];
      for (let i = 0; i < event.rows.length; i += LATE_JOIN_CHUNK_SIZE) {
        const chunk = encodeChunk(event.rows.slice(i, i + LATE_JOIN_CHUNK_SIZE), columnar);
        encoded.push(chunk);
        transfer.push(transferableBuffer(chunk));
      }
      post(
        { kind: 'pw-rows', encoded, rowCount: event.rows.length, replace: event.replace, uniqueKeys: event.uniqueKeys },
        transfer,
      );
      return;
    }
    post({ kind: 'pw-emit', event });
  };
  const appDataLookup = (name: string, key: string): unknown => appData.get(name, key);

  const stopCurrent = (): Promise<void> => {
    const current = handle;
    handle = null;
    return Promise.resolve()
      .then(() => current?.stop())
      .catch(() => undefined);
  };

  const start = (req: Extract<ProviderWorkerRequest, { kind: 'pw-start' }>, from: ProviderWorkerPort): void => {
    for (const row of req.appData) appData.upsert(row);
    if (handle) void stopCurrent();
    active = from;
    columnar = (req.cfg as { wireFormat?: string }).wireFormat !== 'json';
    try {
      handle = startProvider(req.cfg, emit, { appDataLookup });
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

  const stop = (from: ProviderWorkerPort): void => {
    void stopCurrent().then(() => {
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

  return { handleRequest, connect, lookup: appDataLookup };
}
