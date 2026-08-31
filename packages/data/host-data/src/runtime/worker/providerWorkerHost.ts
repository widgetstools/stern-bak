/**
 * Hub side of `dataPlane: 'subworker'` — drives a provider's sub-worker
 * (which owns the whole data plane: transport, cache, replay, encoding)
 * over a transferred `MessagePort`, and presents it to the hub as an
 * ordinary `ProviderHandle` plus a small control surface for the things
 * only the hub initiates (late-join replays, listener-count updates).
 *
 * Lifecycle:
 *   - `pw-start` (cfg + AppData snapshot + listener count [+ overlay]) →
 *     expects `pw-started` within `startTimeoutMs`
 *   - hub AppData changes → `pw-appdata`; listener-count changes →
 *     `pw-listeners`; late-join → `pw-replay`
 *   - worker → hub: `pw-bcast` (finished wire-event templates + batch
 *     meta), `pw-replay-chunks`, and pass-through `pw-emit`
 *   - `pw-ping` every `pingIntervalMs`; a pong that does not arrive before
 *     the next ping is death
 *   - `handle.stop()` → `pw-stop`, then the port is closed on the ack (or
 *     after a grace period)
 *   - death (no start ack, missed heartbeat, fatal start error) →
 *     `onDead(reason)` once; the hub fails over to a spare port or to its
 *     own thread
 */

import type { ProviderConfig } from '@wellsfargo-starui/types';
import type { AppDataRow, Event } from '../protocol.js';
import type { EncodedChunk, ProviderEmit, ProviderHandle } from '../providers/Provider.js';
import {
  isProviderWorkerMessage,
  type ProviderWorkerBatchMeta,
  type ProviderWorkerRequest,
} from './providerWorkerProtocol.js';

/** The subset of `MessagePort` the host uses (tests inject an in-process pair). */
export interface ProviderWorkerPort {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((ev: MessageEvent) => void) | null;
  start?(): void;
  close?(): void;
}

/** What the host needs from the hub's AppData service. */
export interface ProviderWorkerAppData {
  snapshotRows(): readonly AppDataRow[];
  subscribe(listener: (op: 'upsert' | 'remove', row: AppDataRow) => void): () => void;
}

/** Hub-initiated operations beyond the `ProviderHandle` verbs. */
export interface ProviderWorkerControl {
  handle: ProviderHandle;
  /** Ask the worker for a replay chunk run (`onReplayChunks` answers). */
  requestReplay(reqId: string): void;
  /** Tell the worker how many data listeners exist (0 skips encode work). */
  setDataListenerCount(count: number): void;
}

export interface ProviderWorkerHostOpts {
  providerId: string;
  appData: ProviderWorkerAppData;
  /** The sub-worker's port, transferred from a window. Owned by the host from here on. */
  port: ProviderWorkerPort;
  /** Data-mode listener count at start. */
  dataListenerCount: number;
  /** Restart overlay to apply right after start (hub CREATE+RESTART / fail-over). */
  extra?: Record<string, unknown>;
  /** Pass-through transport events (status / byteSize / rowsReceived / timing). */
  emit: ProviderEmit;
  /** One fully-processed rows batch: fan the templates out, fold the meta into stats. */
  onBatch(events: readonly Event[], meta: ProviderWorkerBatchMeta): void;
  /** Answer to `requestReplay`. */
  onReplayChunks(reqId: string, chunks: readonly EncodedChunk[], cacheSize: number): void;
  /** Called once when the worker is judged dead; the control is inert afterwards. */
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

/** Start `cfg`'s data plane in the sub-worker behind `opts.port`. */
export function startProviderInWorker(
  cfg: ProviderConfig,
  opts: ProviderWorkerHostOpts,
): ProviderWorkerControl {
  const { port, providerId, emit } = opts;
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
      case 'pw-bcast':
        opts.onBatch(m.events, m.meta);
        return;
      case 'pw-replay-chunks':
        opts.onReplayChunks(m.reqId, m.chunks, m.cacheSize);
        return;
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
        emit({ status: 'error', error: m.error });
        if (m.fatal) die(`failed to start: ${m.error}`);
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
    dataListenerCount: opts.dataListenerCount,
    extra: opts.extra,
  });
  startTimer = setTimeout(() => {
    if (!started) die('did not acknowledge start');
  }, opts.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS);

  const handle: ProviderHandle = {
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

  return {
    handle,
    requestReplay(reqId) {
      if (!stopped && !dead) post({ kind: 'pw-replay', reqId });
    },
    setDataListenerCount(count) {
      if (!stopped && !dead) post({ kind: 'pw-listeners', data: count });
    },
  };
}
