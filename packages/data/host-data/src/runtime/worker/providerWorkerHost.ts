/**
 * Hub side of `dataPlane: 'subworker'` — drives a provider's transport
 * running in its sub-worker over a transferred `MessagePort`, and presents
 * it to the hub as an ordinary `ProviderHandle`, so `createProvider` /
 * `applyProviderEmit` need no knowledge of threads.
 *
 * Lifecycle:
 *   - `pw-start` (cfg + AppData snapshot [+ restart overlay]) → expects
 *     `pw-started` within `startTimeoutMs`
 *   - hub AppData changes → `pw-appdata` (keeps `{{name.key}}` resolution
 *     current for reconnects inside the worker)
 *   - `pw-ping` every `pingIntervalMs`; a pong that does not arrive before
 *     the next ping is death
 *   - `handle.restart(extra)` → `pw-restart`
 *   - `handle.stop()` → `pw-stop`, then the port is closed on the ack (or
 *     after a grace period)
 *   - death (no start ack, no pong, fatal start error) → `onDead(reason)`
 *     once; the hub fails over to a spare port or to its own thread
 */

import type { ProviderConfig } from '@wellsfargo-starui/types';
import type { AppDataRow } from '../protocol.js';
import type { EncodedChunk, ProviderEmit, ProviderHandle } from '../providers/Provider.js';
import { decodeColumnar } from '../wire/columnarCodec.js';
import { isProviderWorkerMessage, type ProviderWorkerRequest } from './providerWorkerProtocol.js';

const CHUNK_DECODER = new TextDecoder();

/** Rows of one pre-encoded chunk (the hub needs objects for its cache / replay / thin deltas). */
function decodeChunk(chunk: EncodedChunk): unknown[] {
  return chunk.enc === 'col'
    ? decodeColumnar(chunk.buf)
    : (JSON.parse(CHUNK_DECODER.decode(chunk.buf)) as unknown[]);
}

function decodeChunks(chunks: readonly EncodedChunk[]): unknown[] {
  if (chunks.length === 1) return decodeChunk(chunks[0] as EncodedChunk);
  const out: unknown[] = [];
  for (const c of chunks) {
    const rows = decodeChunk(c);
    for (let i = 0; i < rows.length; i++) out.push(rows[i]);
  }
  return out;
}

/** The subset of `MessagePort` the host uses (tests inject an in-process pair). */
export interface ProviderWorkerPort {
  postMessage(message: unknown): void;
  onmessage: ((ev: MessageEvent) => void) | null;
  start?(): void;
  close?(): void;
}

/** What the host needs from the hub's AppData service. */
export interface ProviderWorkerAppData {
  snapshotRows(): readonly AppDataRow[];
  subscribe(listener: (op: 'upsert' | 'remove', row: AppDataRow) => void): () => void;
}

export interface ProviderWorkerHostOpts {
  providerId: string;
  appData: ProviderWorkerAppData;
  /** The sub-worker's port, transferred from a window. Owned by the host from here on. */
  port: ProviderWorkerPort;
  /** Restart overlay to apply right after start (hub CREATE+RESTART / fail-over). */
  extra?: Record<string, unknown>;
  /** Called once when the worker is judged dead; the handle is inert afterwards. */
  onDead(reason: string): void;
  /** `pw-started` must arrive within this. Default 4000ms. */
  startTimeoutMs?: number;
  /** Heartbeat period; a pong must arrive before the next ping. Default 10000ms. */
  pingIntervalMs?: number;
  /** Grace for the worker's `pw-stopped` ack before the port is closed. Default 1000ms. */
  stopGraceMs?: number;
}

const DEFAULT_START_TIMEOUT_MS = 4000;
const DEFAULT_PING_INTERVAL_MS = 10_000;
const DEFAULT_STOP_GRACE_MS = 1000;

/** Start `cfg`'s transport in the sub-worker behind `opts.port`. */
export function startProviderInWorker(
  cfg: ProviderConfig,
  emit: ProviderEmit,
  opts: ProviderWorkerHostOpts,
): ProviderHandle {
  const { port, providerId } = opts;
  let stopped = false;
  let dead = false;
  let started = false;
  let startTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let awaitingPong = false;

  const post = (req: ProviderWorkerRequest): void => {
    try {
      port.postMessage(req);
    } catch (err) {
      die(`post failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const clearTimers = (): void => {
    if (startTimer !== null) clearTimeout(startTimer);
    startTimer = null;
    if (pingTimer !== null) clearInterval(pingTimer);
    pingTimer = null;
  };

  const unsubscribeAppData = opts.appData.subscribe((op, row) => {
    if (!dead && !stopped) post({ kind: 'pw-appdata', op, row });
  });

  const detach = (): void => {
    clearTimers();
    unsubscribeAppData();
    port.onmessage = null;
  };

  function die(reason: string): void {
    if (dead || stopped) return;
    dead = true;
    detach();
    try {
      port.close?.();
    } catch {
      /* already gone */
    }
    // eslint-disable-next-line no-console
    console.warn(`[hub] provider '${providerId}' sub-worker ${reason}`);
    opts.onDead(reason);
  }

  const ping = (): void => {
    if (awaitingPong) {
      die('missed heartbeat');
      return;
    }
    awaitingPong = true;
    post({ kind: 'pw-ping' });
  };

  port.onmessage = (ev: MessageEvent) => {
    const m = ev.data;
    if (!isProviderWorkerMessage(m) || dead || stopped) return;
    switch (m.kind) {
      case 'pw-emit':
        emit(m.event);
        return;
      case 'pw-rows': {
        let rows: unknown[];
        try {
          rows = decodeChunks(m.encoded);
        } catch (err) {
          emit({ status: 'error', error: `sub-worker chunk decode failed: ${err instanceof Error ? err.message : String(err)}` });
          return;
        }
        emit({ rows, replace: m.replace, uniqueKeys: m.uniqueKeys, encoded: m.encoded });
        return;
      }
      case 'pw-started':
        started = true;
        if (startTimer !== null) clearTimeout(startTimer);
        startTimer = null;
        pingTimer = setInterval(ping, opts.pingIntervalMs ?? DEFAULT_PING_INTERVAL_MS);
        return;
      case 'pw-pong':
        awaitingPong = false;
        return;
      case 'pw-error':
        if (m.fatal) {
          emit({ status: 'error', error: m.error });
          die(`failed to start: ${m.error}`);
        } else {
          emit({ status: 'error', error: m.error });
        }
        return;
      default:
        return;
    }
  };
  port.start?.();

  post({
    kind: 'pw-start',
    providerId,
    cfg,
    appData: opts.appData.snapshotRows(),
    extra: opts.extra,
  });
  startTimer = setTimeout(() => {
    if (!started) die('did not acknowledge start');
  }, opts.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS);

  return {
    stop() {
      if (stopped || dead) return;
      stopped = true;
      clearTimers();
      unsubscribeAppData();
      const grace = setTimeout(() => port.close?.(), opts.stopGraceMs ?? DEFAULT_STOP_GRACE_MS);
      port.onmessage = (ev: MessageEvent) => {
        if ((ev.data as { kind?: string } | null)?.kind === 'pw-stopped') {
          clearTimeout(grace);
          port.onmessage = null;
          port.close?.();
        }
      };
      post({ kind: 'pw-stop' });
    },
    restart(extra) {
      if (stopped || dead) return;
      post({ kind: 'pw-restart', extra });
    },
  };
}
