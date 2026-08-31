/**
 * Hub ↔ provider sub-worker protocol (`dataPlane: 'subworker'`).
 *
 * Each provider's transport runs in its own **SharedWorker**
 * (`data-provider-worker.js`, name `starui-provider:<providerId>`). A
 * SharedWorker cannot spawn workers in Chromium (`Worker` is undefined in
 * `SharedWorkerGlobalScope`), so the hub never creates them: every window
 * that subscribes to the provider constructs / joins the worker and
 * transfers its `MessagePort` to the hub (`provider-port` request).
 *
 * As of Phase 3 the sub-worker owns the provider's whole data plane —
 * transport, row cache, replay cache, key accounting, thin-delta diffing
 * and chunk encoding. It runs the hub's own `applyProviderEmit` pipeline
 * against a worker-local slot and ships the finished wire-event templates
 * (`pw-bcast`); the hub only manages subscribers, relays those templates
 * verbatim, and asks for late-join replays (`pw-replay`). Rows never
 * cross into the hub as objects, and the hub never decodes or re-encodes.
 *
 * Chunk buffers are CLONED, never transferred: the same `EncodedChunk`
 * objects live on in the worker's replay cache, and a transfer would
 * detach them (a clone is a flat memcpy — ~2 MB/s at 40k rows/s).
 *
 * AppData (`{{name.key}}` template resolution) is mirrored into the
 * sub-worker: a full snapshot rides on `pw-start`, and every hub-side
 * change is forwarded as `pw-appdata`, so a reconnect inside the worker
 * resolves against current values exactly as the in-thread path does.
 *
 * Liveness: MessagePorts have no close event, and a provider SharedWorker
 * dies when its last window closes — the hub pings (`pw-ping` / `pw-pong`)
 * and treats a missed pong or a missed start ack as death, then fails
 * over to a spare port or to its own thread.
 */

import type { ProviderConfig } from '@wellsfargo-starui/types';
import type { AppDataRow, Event } from '../protocol.js';
import type { EncodedChunk, ProviderEmitEvent } from '../providers/Provider.js';

export type ProviderWorkerRequest =
  | {
      kind: 'pw-start';
      providerId: string;
      cfg: ProviderConfig;
      /** Current AppData rows for template resolution. */
      appData: readonly AppDataRow[];
      /** Data-mode listener count right now (encode is skipped at 0). */
      dataListenerCount: number;
      /**
       * Restart overlay to apply immediately after start — the hub's
       * CREATE+RESTART path (a window attaching with `extra`), and a
       * fail-over while an overlay was active.
       */
      extra?: Record<string, unknown>;
    }
  | { kind: 'pw-restart'; extra?: Record<string, unknown> }
  | { kind: 'pw-stop' }
  | { kind: 'pw-appdata'; op: 'upsert' | 'remove'; row: AppDataRow }
  /** Data-listener count changed — 0 lets the worker skip encode + broadcast work. */
  | { kind: 'pw-listeners'; data: number }
  /**
   * Send the current snapshot as replay chunks (`pw-replay-chunks`).
   * Answered synchronously in the worker, so the chunk run is atomic
   * against its own live stream: every batch emitted before the answer
   * is inside the snapshot, every one after it follows it on the port.
   */
  | { kind: 'pw-replay'; reqId: string }
  | { kind: 'pw-ping' };

/** Per-batch bookkeeping the hub folds into its stats / introspection. */
export interface ProviderWorkerBatchMeta {
  /** Rows in the upstream batch (before drops / dedupe). */
  rowCount: number;
  /** Worker cache size after applying the batch. */
  cacheSize: number;
  /** Serialized replay footprint, when every bucket is encoded. */
  cacheBytes: number | null;
  /** Cumulative key-drop count this (re)start cycle. */
  keyDropCount: number;
}

export type ProviderWorkerMessage =
  /** Pass-through transport events: status / byteSize / rowsReceived / timing. */
  | { kind: 'pw-emit'; event: ProviderEmitEvent }
  /**
   * One upstream rows batch, fully processed by the worker's
   * `applyProviderEmit`: cache upserted, replay seeded, key drops
   * accounted, and the resulting wire-event templates (`delta-bin` /
   * `delta` / `delta-patch`, `subId: ''`) ready for the hub to fan out
   * verbatim. `events` is empty when there were no data listeners or
   * nothing observably changed.
   */
  | { kind: 'pw-bcast'; events: readonly Event[]; meta: ProviderWorkerBatchMeta }
  /** Answer to `pw-replay`: the full snapshot as pre-encoded chunks. */
  | {
      kind: 'pw-replay-chunks';
      reqId: string;
      chunks: readonly EncodedChunk[];
      cacheSize: number;
    }
  /** `startProvider` returned a handle. */
  | { kind: 'pw-started' }
  /**
   * `fatal: true` — `startProvider` threw (no handle exists; the worker
   * is idle until the next `pw-start`). `fatal: false` — a `restart()`
   * rejected; the provider keeps running.
   */
  | { kind: 'pw-error'; error: string; fatal: boolean }
  /** Provider stopped; the worker stays alive for a later `pw-start`. */
  | { kind: 'pw-stopped' }
  | { kind: 'pw-pong' };

const REQUEST_KINDS = new Set([
  'pw-start', 'pw-restart', 'pw-stop', 'pw-appdata', 'pw-listeners', 'pw-replay', 'pw-ping',
]);
const MESSAGE_KINDS = new Set([
  'pw-emit', 'pw-bcast', 'pw-replay-chunks', 'pw-started', 'pw-error', 'pw-stopped', 'pw-pong',
]);

export function isProviderWorkerRequest(data: unknown): data is ProviderWorkerRequest {
  return !!data && typeof data === 'object' && REQUEST_KINDS.has((data as { kind?: string }).kind ?? '');
}

export function isProviderWorkerMessage(data: unknown): data is ProviderWorkerMessage {
  return !!data && typeof data === 'object' && MESSAGE_KINDS.has((data as { kind?: string }).kind ?? '');
}

/** `SharedWorker` name for a provider's sub-worker — one worker per provider per origin. */
export function providerWorkerName(providerId: string): string {
  return `starui-provider:${providerId}`;
}
