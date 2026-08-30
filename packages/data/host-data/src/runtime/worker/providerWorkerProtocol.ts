/**
 * Hub ↔ provider sub-worker protocol (`dataPlane: 'subworker'`).
 *
 * Each provider's transport runs in its own **SharedWorker**
 * (`data-provider-worker.js`, name `starui-provider:<providerId>`). A
 * SharedWorker cannot spawn workers in Chromium (`Worker` is undefined in
 * `SharedWorkerGlobalScope`), so the hub never creates them: every window
 * that subscribes to the provider constructs / joins the worker and
 * transfers its `MessagePort` to the hub (`provider-port` request). The hub
 * drives the transport over that port with the same three verbs a
 * `ProviderHandle` has (start / restart / stop) plus a heartbeat; the
 * sub-worker runs the ordinary `startProvider` and streams the transport's
 * `ProviderEmitEvent`s back unchanged, so the hub's cache / replay /
 * encode / fan-out pipeline (`applyProviderEmit`) is untouched.
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
import type { AppDataRow } from '../protocol.js';
import type { EncodedChunk, ProviderEmitEvent } from '../providers/Provider.js';

export type ProviderWorkerRequest =
  | {
      kind: 'pw-start';
      providerId: string;
      cfg: ProviderConfig;
      /** Current AppData rows for template resolution. */
      appData: readonly AppDataRow[];
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
  | { kind: 'pw-ping' };

export type ProviderWorkerMessage =
  | { kind: 'pw-emit'; event: ProviderEmitEvent }
  /**
   * A `{ rows }` emit whose rows were encoded on the worker thread with
   * the hub's own chunk codec rule (≤ `LATE_JOIN_CHUNK_SIZE` rows per
   * chunk, columnar unless `cfg.wireFormat === 'json'`). The buffers
   * travel in the transfer list (zero copy); the hub decodes them for
   * its cache and relays the very same chunks to windows. Used for
   * snapshot batches and any live batch of `LIVE_BIN_MIN_ROWS`+ rows —
   * smaller live ticks go as plain `pw-emit` objects, like the hub's
   * own small-delta path.
   */
  | {
      kind: 'pw-rows';
      encoded: readonly EncodedChunk[];
      rowCount: number;
      replace?: boolean;
      uniqueKeys?: boolean;
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

const REQUEST_KINDS = new Set(['pw-start', 'pw-restart', 'pw-stop', 'pw-appdata', 'pw-ping']);
const MESSAGE_KINDS = new Set(['pw-emit', 'pw-rows', 'pw-started', 'pw-error', 'pw-stopped', 'pw-pong']);

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
