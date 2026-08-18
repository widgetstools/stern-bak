/**
 * STOMP provider — `startStomp(cfg, emit)` + `probeStomp(cfg)` for
 * the editor's Test Connection / Infer Fields buttons.
 *
 * **IDataProvider alignment (streaming provider):**
 *   - `start()` → connect + subscribe; snapshot phase buffers rows
 *     locally and emits `{ rowsReceived }` for loading overlays.
 *   - Snapshot flush → chunked `{ rows, replace }` to the hub;
 *     client `SnapshotReassembler` assembles + fires `onSnapshotData`.
 *   - Live phase → keyed `{ rows }` deltas (maps to `onTick`).
 *   - `refresh()` on the adapter replays hub cache; `restart(extra)`
 *     reconnects and re-runs the snapshot lifecycle.
 *
 * Lifecycle:
 *   start():
 *     1. Connect WebSocket via @stomp/stompjs.
 *     2. On `onConnect`: subscribe to `cfg.listenerTopic`, publish
 *        the trigger frame to `cfg.requestMessage` (body =
 *        `cfg.requestBody ?? ''`).
 *     3. Each frame body is parsed as JSON. Arrays expand; single
 *        objects become a 1-element batch.
 *     4. **Snapshot phase** (before the case-insensitive
 *        `cfg.snapshotEndToken` matches a frame): rows are
 *        accumulated in an in-memory buffer. Each batch emits
 *        `{ rowsReceived: buffer.length }` so the hub can surface
 *        progressive counts before the cache exists. Row payloads are
 *        not emitted per-frame. When the end-token arrives we flush the
 *        buffer as chunked `emit({ rows, replace })` frames followed
 *        by `emit({ status: 'ready' })`. The Hub merges chunks into
 *        its cache; listeners apply via `setGridOption('rowData', ...)`
 *        (one cheap reset instead of N small `add` transactions).
 *     5. **Live phase** (after the end-token): each frame emits as
 *        keyed deltas via `emit({ rows })` — Hub upserts into its
 *        cache, listeners receive `{replace: false}` and route to
 *        `applyTransactionAsync` (split into adds vs updates by
 *        `getRowNode` on the consumer side).
 *     6. **No end-token configured** (legacy / probe paths): we
 *        cannot tell snapshot from live, so every frame emits as a
 *        delta. Status stays `loading` until something else flips
 *        it (typically the consumer relies on the cache filling up).
 *
 *   restart(extra):
 *     Disconnects, clears local state, emits `{ rows: [], replace:
 *     true }` + status: 'loading', re-runs start(). The previous
 *     session's WebSocket close runs OFF the critical path (the new
 *     dial does not wait for stompjs `deactivate()` — a bumped
 *     `connectGeneration` fences stale frames), so a slow broker
 *     disconnect no longer delays the new request. The `extra` overlay
 *     is merged into the trigger body (if it's JSON) — that lets the
 *     historical path send `{ asOfDate }` without re-authoring the cfg.
 *
 *   stop():
 *     Disconnects. No emit (Hub clears its cache when the slot
 *     drops).
 *
 * The stompjs Client lazy-loads via dynamic import so consumers who
 * never use STOMP don't pay for the dep.
 */

import type { StompProviderConfig, StompSsrmProviderConfig } from '@wellsfargo-starui/types';
import { STOMP_TUNING_DEFAULTS } from '@wellsfargo-starui/types';

/** STOMP wire config — CSRM `stomp` or SSRM `stomp-ssrm` share the same transport. */
export type StompTransportConfig = StompProviderConfig | StompSsrmProviderConfig;
import { createFieldProjector } from '../fieldProjection.js';
import { composeRowId } from '@wellsfargo-starui/types';
import type { ProviderEmit, ProviderHandle } from '../Provider.js';
import { bufferedDispatch } from './bufferedDispatch.js';
import { resolveBracketCfg } from '../../template/bracketResolver.js';
import {
  assertAppDataResolved,
  resolveCfg,
  type AppDataLookup,
} from '../../template/resolver.js';
import { traceStompProviderCfg, traceStompWireDestinations } from '../../template/templateTrace.js';
import { validateStompPathContract } from './stompPathContract.js';

/**
 * Maximum rows to ship in a single `postMessage` from the worker.
 * Larger snapshots are split into multiple replace+delta frames so
 * the receiving main-thread `message` handler completes inside
 * Chromium's 50ms long-task budget (the source of the
 * "[Violation] 'message' handler took 266ms" advisories).
 *
 * 500 is a balance: empirically a 500-row structured-clone of
 * typical position rows takes ~10–25ms; halving it makes no
 * material difference but doubles the round-trips.
 *
 * Overridable per provider via `cfg.snapshotChunkSize` (settable in
 * code or the provider editor); this is the fallback default.
 */
const SNAPSHOT_CHUNK_SIZE = STOMP_TUNING_DEFAULTS.snapshotChunkSize;

// ─── Minimal structural type for the stompjs Client we use ────────

interface StompClient {
  connected: boolean;
  reconnectDelay: number;
  onConnect: (() => void) | undefined;
  onStompError: ((frame: { headers: Record<string, string> }) => void) | undefined;
  onWebSocketError: ((event: unknown) => void) | undefined;
  onDisconnect: (() => void) | undefined;
  subscribe(
    destination: string,
    cb: (msg: { body: string; headers: Record<string, string> }) => void,
  ): { unsubscribe(): void };
  publish(params: { destination: string; body?: string }): void;
  activate(): void;
  deactivate(options?: { force?: boolean }): Promise<void> | void;
}

interface StompClientCfg {
  brokerURL: string;
  reconnectDelay: number;
  heartbeatIncoming: number;
  heartbeatOutgoing: number;
  debug?: (msg: string) => void;
}

export type StompClientFactory = (cfg: StompClientCfg) => StompClient;

let _ctorPromise: Promise<new (cfg: StompClientCfg) => StompClient> | null = null;
let _ctor: (new (cfg: StompClientCfg) => StompClient) | null = null;

/** Resolve Client from @stomp/stompjs ESM or UMD interop shapes (Vite/Rollup). */
export function resolveStompClientCtor(
  mod: unknown,
): new (cfg: StompClientCfg) => StompClient {
  const root = mod as Record<string, unknown>;
  const defaultNs =
    root.default && typeof root.default === 'object'
      ? (root.default as Record<string, unknown>)
      : undefined;

  const candidates: unknown[] = [
    root.Client,
    defaultNs?.Client,
    typeof root.default === 'function' ? root.default : undefined,
    root.StompJs && typeof root.StompJs === 'object'
      ? (root.StompJs as Record<string, unknown>).Client
      : undefined,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'function') {
      return candidate as new (cfg: StompClientCfg) => StompClient;
    }
  }

  const keys = [
    ...Object.keys(root),
    ...(defaultNs ? Object.keys(defaultNs).map((k) => `default.${k}`) : []),
  ].join(', ');

  throw new Error(
    '[stomp] @stomp/stompjs loaded but Client constructor not found on the module namespace ' +
      '(tried `Client`, `default.Client`, `default` as ctor, `StompJs.Client`). Module keys: ' +
      keys,
  );
}

async function loadDefaultClientCtor(): Promise<new (cfg: StompClientCfg) => StompClient> {
  if (_ctor) return _ctor;
  if (!_ctorPromise) {
    _ctorPromise = import('@stomp/stompjs').then((m) => {
      const Ctor = resolveStompClientCtor(m);
      _ctor = Ctor;
      return _ctor;
    });
  }
  return _ctorPromise;
}

export interface StompOpts {
  /** Inject the Client constructor for tests. */
  createClient?: StompClientFactory;
  /**
   * Skip the snapshot-phase row buffer and forward every batch as a
   * `{rows}` delta in real time. Used by `probeStomp` (which wants
   * the first N rows ASAP regardless of where the end-token sits)
   * and by callers that just want raw frame fan-out. Default: false
   * — Hub consumers want the buffered, replace-flagged snapshot.
   * Also disables live-phase conflation/throttle (probe wants raw
   * frames as they arrive).
   */
  passthroughSnapshot?: boolean;
  /** Resolve `{{name.key}}` on every STOMP connect/restart (worker AppData). */
  appDataLookup?: AppDataLookup;
  /** Clock injection for the live-phase throttle. Defaults to setTimeout/clearTimeout. */
  setTimer?: (cb: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

/** Keys commonly used for historical as-of dates in STOMP destination templates. */
export function isHistoricalDateAppDataKey(key: string): boolean {
  const normalized = key.replace(/-/g, '').toLowerCase();
  return normalized === 'asofdate' || normalized === 'positionasofdate';
}

/**
 * Merge worker AppData lookup with `restart({ asOfDate })` overlay.
 * When overlay carries `asOfDate`, it wins for historical date keys so
 * toolbar reload is deterministic even if AppData is stale or still syncing.
 */
export function lookupWithRestartOverlay(
  lookup: AppDataLookup | undefined,
  overlay: Record<string, unknown> | undefined,
): AppDataLookup | undefined {
  const asOfDate = typeof overlay?.asOfDate === 'string' ? overlay.asOfDate : undefined;
  if (!lookup && !asOfDate) return undefined;
  return (name, key) => {
    if (asOfDate && isHistoricalDateAppDataKey(key)) return asOfDate;
    return lookup?.(name, key);
  };
}

export interface StompWireDestinations {
  listenerTopic: string;
  requestMessage?: string;
  requestBody?: string;
}

/** @deprecated Prefer `validateStompWireReady`. */
export function stompWireDestinationsUnresolved(
  destinations: Pick<StompWireDestinations, 'listenerTopic' | 'requestMessage'>,
): string | null {
  return validateStompWireReady(destinations);
}

/**
 * Deterministic pre-wire gate: no `{{name.key}}` tokens on the broker path and
 * historical/live trigger shapes match the stomp-view-server contract.
 */
export function validateStompWireReady(destinations: StompWireDestinations): string | null {
  if (destinations.listenerTopic.includes('{{')) {
    return `Unresolved AppData template in STOMP listenerTopic: ${destinations.listenerTopic}`;
  }
  if (destinations.requestMessage?.includes('{{')) {
    return `Unresolved AppData template in STOMP requestMessage: ${destinations.requestMessage}`;
  }
  if (destinations.requestBody?.includes('{{')) {
    return `Unresolved AppData template in STOMP requestBody: ${destinations.requestBody}`;
  }
  return validateStompPathContract(
    destinations.listenerTopic,
    destinations.requestMessage,
  );
}

/** Resolve catalog cfg + overlay into broker wire destinations (deterministic order). */
export function resolveEffectiveStompCfg(
  templateCfg: StompTransportConfig,
  lookup: AppDataLookup | undefined,
  overlay: Record<string, unknown> | undefined,
): {
  cfg: StompTransportConfig;
  destinations: ReturnType<typeof resolveStompDestinations>;
} {
  const mergedLookup = lookupWithRestartOverlay(lookup, overlay);
  const cfgAfterAppData = mergedLookup
    ? resolveCfg(templateCfg, mergedLookup) as StompProviderConfig
    : templateCfg;
  return {
    cfg: cfgAfterAppData,
    destinations: resolveStompDestinations(cfgAfterAppData, overlay),
  };
}

/** Tear down STOMP subscription + session; disable auto-reconnect. */
async function teardownStompConnection(
  client: StompClient | null,
  sub: { unsubscribe(): void } | null,
): Promise<void> {
  if (sub) {
    try { sub.unsubscribe(); } catch { /* ignore */ }
  }
  if (!client) return;

  client.onConnect = undefined;
  client.onStompError = undefined;
  client.onWebSocketError = undefined;
  client.onDisconnect = undefined;
  client.reconnectDelay = 0;

  try {
    await client.deactivate();
  } catch {
    try {
      await client.deactivate({ force: true });
    } catch { /* ignore */ }
  }
}

// ─── start() — long-running provider ───────────────────────────────

export function startStomp(
  cfg: StompTransportConfig,
  emit: ProviderEmit,
  opts: StompOpts = {},
): ProviderHandle {
  // `hasEndToken` decides whether we buffer-then-flush (true) or
  // straight-pass each frame (false). When the cfg has no end token
  // there is no defined "snapshot complete" moment, so buffering
  // would never flush.
  // `passthroughSnapshot` (probe / debug callers) also disables
  // buffering — they want frames as they arrive.
  const hasEndToken = Boolean(cfg.snapshotEndToken);
  const buffering = hasEndToken && !opts.passthroughSnapshot;
  const endTokenRe = buildEndTokenMatcher(cfg.snapshotEndToken);

  // Snapshot flush chunk size — `cfg.snapshotChunkSize` overrides the
  // default (settable in code or via the provider editor).
  const chunkSize =
    cfg.snapshotChunkSize && cfg.snapshotChunkSize > 0
      ? Math.floor(cfg.snapshotChunkSize)
      : SNAPSHOT_CHUNK_SIZE;

  // Live-phase conflation + trailing-edge throttle. Driven by
  // `cfg.throttleMs` (window) and `cfg.conflateByKey` / `cfg.keyColumn`
  // (upsert key). Two explicit master switches (both default ON) let a
  // config — or the provider editor — turn each off independently:
  //   • `conflateEnabled: false` disables conflation even though
  //     `keyColumn` could supply a key (drops the `?? keyColumn`
  //     fallback that previously made conflation impossible to disable).
  //   • `throttleEnabled: false` disables batching while preserving the
  //     `throttleMs` value, so re-enabling restores the window.
  // Conflation still only takes effect when a throttle window is live;
  // without it the dispatch is a passthrough. The probe path
  // (`passthroughSnapshot`) wants raw frames ASAP, so it skips dispatch.
  // Field projection (`cfg.projectFields`): prune incoming rows to the
  // columnDefinitions field paths + keyColumn at frame-parse time, so
  // unused upstream fields never enter the snapshot buffer, hub cache
  // or any window. The probe path must see RAW rows — Infer Fields
  // exists to discover the fields projection would strip.
  const projector =
    cfg.projectFields && !opts.passthroughSnapshot
      ? createFieldProjector(cfg.columnDefinitions, cfg.keyColumn)
      : null;

  const conflateEnabled = cfg.conflateEnabled !== false;
  const throttleEnabled = cfg.throttleEnabled !== false;
  const conflateColumns = conflateEnabled ? cfg.conflateByKey ?? cfg.keyColumn : undefined;
  const conflateKeyFn = conflateColumns
    ? (row: unknown): unknown =>
        row && typeof row === 'object'
          ? composeRowId(row as Record<string, unknown>, conflateColumns)
          : null
    : undefined;
  // Default 25 ms conflation window: an unconfigured provider on a
  // 10k msg/sec feed otherwise ran bufferedDispatch in passthrough
  // mode — one emit → encode → fan-out PER MESSAGE.
  const liveThrottleMs = throttleEnabled ? (cfg.throttleMs ?? STOMP_TUNING_DEFAULTS.throttleMs) : 0;
  // `uniqueKeys` only when the conflation MAP actually builds the
  // batch — with a zero window, bufferedDispatch passes rows through
  // un-conflated and the claim would be false.
  const liveConflated = typeof conflateKeyFn === 'function' && liveThrottleMs > 0;
  const liveDispatch = opts.passthroughSnapshot
    ? null
    : bufferedDispatch<unknown>({
        conflateKeyFn,
        throttleMs: liveThrottleMs,
        flush: liveConflated
          ? (rows) => emit({ rows, uniqueKeys: true })
          : (rows) => emit({ rows }),
        setTimer: opts.setTimer,
        clearTimer: opts.clearTimer,
      });

  const state = {
    client: null as StompClient | null,
    sub: null as { unsubscribe(): void } | null,
    snapshotComplete: !buffering, // no buffering → start in live phase
    receivingSnapshot: false,
    snapshotBuffer: [] as unknown[],
    overlay: undefined as Record<string, unknown> | undefined,
    stopped: false,
    /** Bumped on stop/restart so in-flight connect callbacks are ignored. */
    connectGeneration: 0,
    /**
     * True from creation until the initial `start()` settles. While the
     * initial connect is still pre-dial (`client === null`), a `restart()`
     * just adopts its overlay into the pending dial instead of tearing
     * down and dialing again — the Hub's CREATE+RESTART / RESTART+RECONFIG
     * paths call `restart()` synchronously right after `startStomp()`.
     */
    connectPending: true,
    /** True after the first successful STOMP session (subscribe + trigger). */
    hadSuccessfulConnect: false,
    /** When set, the next onConnect restarts the snapshot from scratch. */
    reconnectRestartPending: false,
  };

  // ─── Lifecycle timing trace ────────────────────────────────────
  // Diagnoses "restart takes a while before connecting": every line
  // reports the elapsed time since the user's Restart click. The
  // click epoch rides for free in the `extra.__refresh` overlay
  // (DiagnosticsTab/toolbar set it to Date.now()). These logs fire
  // only on lifecycle transitions — restart, dial, handshake,
  // trigger publish, snapshot end — never per-frame, so they're
  // cheap enough to stay on permanently.
  const timing = {
    /** Date.now() at the user's Restart click (from extra.__refresh). */
    clickAt: null as number | null,
    /** When restart() began tearing down the previous session. */
    restartAt: null as number | null,
    /** When client.activate() was called (WebSocket dial start). */
    dialAt: null as number | null,
    /** When the broker completed the STOMP handshake (onConnect). */
    connectAt: null as number | null,
    /** When the snapshot trigger frame was published. */
    publishAt: null as number | null,
    /** When the first frame of the current cycle arrived from the broker. */
    firstMessageAt: null as number | null,
  };
  const sinceClick = (now = Date.now()) =>
    timing.clickAt === null ? 'n/a' : `+${now - timing.clickAt}ms`;
  const since = (from: number | null, now = Date.now()) =>
    from === null ? 'n/a' : `${now - from}ms`;
   
  const trace = (msg: string) => console.log(`[v2/stomp][trace] ${msg} (sinceClick=${sinceClick()})`);

  const beginSnapshotPhase = () => {
    // Drop any live deltas still pending in the throttle window — they
    // belong to the session being reset and would arrive after the
    // replace:true below.
    liveDispatch?.teardown();
    state.snapshotComplete = !buffering;
    state.receivingSnapshot = false;
    state.snapshotBuffer = [];
    emit({ rows: [], replace: true });
    emit({ status: 'loading' });
  };

  const markDisconnected = () => {
    if (state.stopped || !state.hadSuccessfulConnect) return;
    state.reconnectRestartPending = true;
    emit({ status: 'error', error: 'Provider disconnected' });
  };

  const flushSnapshot = () => {
    // Stream the snapshot in chunks so each `postMessage` across the
    // worker→main boundary stays small enough that the receiving
    // `message` handler completes under Chromium's 50ms long-task
    // threshold. The first chunk carries `replace: true` so the Hub
    // resets its cache and the consumer's snapshot promise can
    // resolve; subsequent chunks ride as `replace: false` deltas
    // (the Hub merges them into its cache, the client buffers them
    // until `onUpdate` is registered, then they flush as live
    // updates). A zero-row snapshot still emits one replace=true
    // frame so consumers see the deterministic snapshot-complete
    // signal.
    // Dedupe by keyColumn before chunking so the same row id doesn't
    // appear in two different chunks. Non-chunked snapshots used to
    // ride a single replace=true broadcast which the Hub deduped via
    // its cache; with chunking, chunks 1..N broadcast their own batch
    // values, so an id appearing in both chunk0 (set in cache) and
    // chunk1 (set in cache again) would be sent twice — once via
    // replace=true cache snapshot, once via replace=false batch — and
    // the consumer would see a duplicate. Last-write-wins ordering is
    // preserved by Map's insertion semantics.
    const keyColumn = (cfg as { keyColumn?: string | readonly string[] }).keyColumn;
    const buffer = dedupSnapshotBuffer(state.snapshotBuffer, keyColumn);
    state.snapshotBuffer = [];
    state.receivingSnapshot = false;
     
    console.log(
      `[v2/stomp] flushSnapshot: ${buffer.length} rows in ${
        Math.max(1, Math.ceil(buffer.length / chunkSize))
      } chunk(s) of ${chunkSize}`,
    );
    if (buffer.length === 0) {
      emit({ rows: [], replace: true });
      return;
    }
    for (let offset = 0; offset < buffer.length; offset += chunkSize) {
      const chunk = buffer.slice(offset, offset + chunkSize);
      emit({ rows: chunk, replace: offset === 0 });
    }
  };

  const handleFrame = (body: string) => {
    if (state.stopped) return;

    // First frame of this connection cycle — report the request→first
    // message latency to the diagnostics pane. `firstMessageAt` is reset
    // to null on every (re)start via start().
    if (timing.firstMessageAt === null) {
      timing.firstMessageAt = Date.now();
      trace(`first message — ${since(timing.publishAt, timing.firstMessageAt)} after publish`);
      if (timing.publishAt !== null) {
        emit({ timing: { firstMessageMs: timing.firstMessageAt - timing.publishAt } });
      }
    }

    const trimmed = body.trim();
    const byteSize = body.length;

    // End-of-snapshot token (case-insensitive substring match).
    if (endTokenRe !== null && endTokenRe.test(trimmed)) {
       
      console.log(
        `[v2/stomp] end-token matched: "${cfg.snapshotEndToken}" — closing snapshot phase ` +
          `(snapshot stream ${since(timing.publishAt)} since publish, sinceClick=${sinceClick()})`,
      );
      if (!state.snapshotComplete) {
        flushSnapshot();
        state.snapshotComplete = true;
      }
      emit({ byteSize });
      emit({ status: 'ready' });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Non-JSON frame (heartbeat, comment) — count bytes, ignore.
      emit({ byteSize });
      return;
    }
    const rawRows = extractRows(parsed);
    if (rawRows.length === 0) {
      emit({ byteSize });
      return;
    }
    const rows = projector ? rawRows.map(projector) : rawRows;

    if (!state.snapshotComplete) {
      // Snapshot phase: accumulate in memory; surface progressive count.
      if (rows.length > 0) {
        state.receivingSnapshot = true;
      }
      // Indexed push — arg-spread (`push(...rows)`) copies the batch
      // onto the call stack and overflows past ~65k rows.
      for (let i = 0; i < rows.length; i++) state.snapshotBuffer.push(rows[i]);
      emit({ rowsReceived: state.snapshotBuffer.length });
      emit({ byteSize });
      return;
    }

    // Live phase: route through the conflation/throttle dispatch (or
    // straight to emit on the probe passthrough path).
    if (liveDispatch) liveDispatch.push(rows);
    else emit({ rows });
    emit({ byteSize });
  };

  const start = async () => {
    if (state.stopped) return;
    const generation = ++state.connectGeneration;
    state.receivingSnapshot = false;
    emit({ status: 'loading' });
    const reconnectDelayMs = cfg.reconnect?.initialDelayMs ?? STOMP_TUNING_DEFAULTS.reconnectInitialDelayMs;
    trace(`start() gen=${generation} → loading`);

    let client: StompClient;
    try {
      const Ctor = opts.createClient
        ? null
        : await loadDefaultClientCtor();
      if (state.stopped || generation !== state.connectGeneration) {
        trace(`start() gen=${generation} superseded pre-dial — abandoned`);
        return;
      }
      const factory: StompClientFactory = opts.createClient
        ?? ((c) => new Ctor!(c));
      client = factory({
        brokerURL: cfg.websocketUrl,
        reconnectDelay: reconnectDelayMs,
        heartbeatIncoming: cfg.heartbeat?.incoming ?? STOMP_TUNING_DEFAULTS.heartbeatMs,
        heartbeatOutgoing: cfg.heartbeat?.outgoing ?? STOMP_TUNING_DEFAULTS.heartbeatMs,
      });
    } catch (err) {
      emit({ status: 'error', error: err instanceof Error ? err.message : String(err) });
      return;
    }
    if (state.stopped || generation !== state.connectGeneration) {
      trace(`start() gen=${generation} superseded pre-activate — abandoned`);
      return;
    }

    state.client = client;

    client.onConnect = () => {
      if (state.stopped || generation !== state.connectGeneration) return;
      timing.connectAt = Date.now();
      trace(
        `onConnect gen=${generation} — handshake ${since(timing.dialAt, timing.connectAt)} after dial`,
      );
      if (state.reconnectRestartPending) {
        state.reconnectRestartPending = false;
        beginSnapshotPhase();
      }
      state.hadSuccessfulConnect = true;
      const { cfg: resolvedCfg, destinations } = resolveEffectiveStompCfg(
        cfg,
        opts.appDataLookup,
        state.overlay,
      );
      traceStompProviderCfg(
        'stomp.onConnect (after worker AppData resolve)',
        resolvedCfg,
        { extra: state.overlay, lookup: lookupWithRestartOverlay(opts.appDataLookup, state.overlay) },
      );
      const publishBody = destinations.requestMessage
        ? mergeOverlay(resolvedCfg.requestBody ?? '', state.overlay)
        : undefined;
      traceStompWireDestinations('stomp.onConnect (wire destinations sent to broker)', {
        listenerTopic: destinations.listenerTopic,
        requestMessage: destinations.requestMessage,
        requestBody: publishBody,
        overlay: state.overlay,
        cfgHadUnresolvedTemplates:
          resolvedCfg.listenerTopic.includes('{{')
          || Boolean(resolvedCfg.requestMessage?.includes('{{'))
          || Boolean(resolvedCfg.requestBody?.includes('{{'))
          || Boolean(publishBody?.includes('{{')),
      });
      const cfgUnresolved = assertAppDataResolved(resolvedCfg, 'STOMP provider cfg');
      if (cfgUnresolved) {
        emit({ status: 'error', error: cfgUnresolved });
        return;
      }
      const wireError = validateStompWireReady({
        listenerTopic: destinations.listenerTopic,
        requestMessage: destinations.requestMessage,
        requestBody: publishBody,
      });
      if (wireError) {
        emit({ status: 'error', error: wireError });
        return;
      }
      try {
        state.sub = client.subscribe(destinations.listenerTopic, (msg) => handleFrame(msg.body));
      } catch (err) {
        emit({ status: 'error', error: err instanceof Error ? err.message : String(err) });
        return;
      }
      // Publish the trigger frame. The body can be a literal string or
      // a JSON template; if `extra` was supplied AND the body parses
      // as JSON, we merge the overlay in (the historical-mode pattern).
      if (destinations.requestMessage) {
        const body = publishBody ?? mergeOverlay(resolvedCfg.requestBody ?? '', state.overlay);
        // Log the exact frame sent to the broker — the publish
        // destination and the verbatim body string (the same value
        // passed to stompjs `client.publish`). Runs in the SharedWorker,
        // so it surfaces in the SharedWorker console
        // (chrome://inspect → Shared workers, or the worker's own
        // DevTools). `JSON.stringify(body)` keeps whitespace/quoting
        // visible so an empty or padded body is unambiguous.
        timing.publishAt = Date.now();
         
        console.log('[v2/stomp] publish → broker', {
          destination: destinations.requestMessage,
          body,
          bodyJson: JSON.stringify(body),
          bodyLength: body.length,
          sinceConnect: since(timing.connectAt, timing.publishAt),
          sinceClick: sinceClick(timing.publishAt),
        });
        // Report the click→request-sent latency to the diagnostics pane
        // (only meaningful when a Restart click stamped `clickAt`).
        if (timing.clickAt !== null) {
          emit({ timing: { requestSentMs: timing.publishAt - timing.clickAt } });
        }
        try {
          client.publish({ destination: destinations.requestMessage, body });
        } catch (err) {
          emit({ status: 'error', error: err instanceof Error ? err.message : String(err) });
        }
      }
    };
    client.onDisconnect = () => {
      if (state.stopped || generation !== state.connectGeneration) return;
      trace(`onDisconnect gen=${generation} — stompjs will auto-redial in ${reconnectDelayMs}ms`);
      markDisconnected();
    };
    client.onWebSocketError = () => {
      if (state.stopped || generation !== state.connectGeneration) return;
      trace(
        `WebSocket error gen=${generation} (hadSuccessfulConnect=${state.hadSuccessfulConnect}) ` +
          `— stompjs will auto-redial in ${reconnectDelayMs}ms`,
      );
      if (state.hadSuccessfulConnect) {
        markDisconnected();
      } else {
        emit({ status: 'error', error: 'WebSocket connection failed' });
      }
    };
    client.onStompError = (frame) => {
      if (state.stopped || generation !== state.connectGeneration) return;
      trace(`STOMP error gen=${generation}: ${frame.headers['message'] ?? '(no message)'}`);
      emit({ status: 'error', error: frame.headers['message'] ?? 'STOMP error' });
    };

    try {
      timing.dialAt = Date.now();
      timing.connectAt = null;
      timing.publishAt = null;
      timing.firstMessageAt = null;
      trace(`activate() gen=${generation} — dialing ${cfg.websocketUrl} (reconnectDelay=${reconnectDelayMs}ms)`);
      client.activate();
    } catch (err) {
      emit({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  };

  const stop = async () => {
    state.stopped = true;
    state.connectGeneration += 1;
    liveDispatch?.teardown();
    const client = state.client;
    const sub = state.sub;
    state.sub = null;
    state.client = null;
    state.receivingSnapshot = false;
    state.snapshotBuffer = [];
    await teardownStompConnection(client, sub);
  };

  // Kick off async start so listeners attached after `startStomp`
  // returns still see the loading status event (Hub calls us
  // synchronously from attach).
  void start().finally(() => { state.connectPending = false; });

  return {
    stop,
    restart: async (extra) => {
      // `extra.__refresh` is Date.now() at the user's Restart click —
      // adopt it as the trace epoch so every subsequent line reports
      // true click-to-X latency.
      timing.clickAt = typeof extra?.__refresh === 'number' ? extra.__refresh : Date.now();
      timing.restartAt = Date.now();
      state.overlay = extra;
      if (state.connectPending && state.client === null) {
        // The initial start() is still pre-dial (awaiting the stompjs
        // import). It reads `state.overlay` in onConnect, so the new
        // overlay rides the in-flight connect — no second dial needed.
        trace('restart() adopted by in-flight initial connect — overlay applied, single dial');
        return;
      }
      state.connectGeneration += 1;
      const client = state.client;
      const sub = state.sub;
      state.sub = null;
      state.client = null;
      // Tear down the previous session OFF the critical path. The
      // synchronous portion of `teardownStompConnection` runs immediately
      // (unsubscribe + null the old client's callbacks + `reconnectDelay=0`),
      // so the old session stops delivering frames right away; only the
      // stompjs `deactivate()` WebSocket close handshake lingers, and the
      // bumped `connectGeneration` already fences any late frames from it.
      // Awaiting that close here previously serialized it BEFORE the new
      // dial — and a broker that doesn't promptly ack `DISCONNECT` makes
      // `deactivate()` block for up to a full heartbeat interval (~4s),
      // which landed squarely in the "Restart → request sent" latency.
      // Dialing the new connection in parallel removes that wait entirely.
      trace(`restart() begin — tearing down previous session off critical path (hadClient=${Boolean(client)})`);
      void teardownStompConnection(client, sub).then(() => {
        trace(`restart() previous session torn down in ${since(timing.restartAt)}`);
      });
      // Reset snapshot tracking. `snapshotComplete` returns to its
      // initial value (`!buffering`) so the new connection re-buffers
      // its snapshot phase if buffering is enabled.
      state.reconnectRestartPending = false;
      beginSnapshotPhase();
      if (!state.stopped) void start();
    },
  };
}

// ─── probeStomp() — one-shot connect + collect snapshot ───────────

export interface ProbeResult {
  ok: boolean;
  rows?: readonly unknown[];
  error?: string;
}

export interface ProbeOpts {
  /** Maximum rows to collect before resolving. Default 200. */
  maxRows?: number;
  /** Hard timeout in ms. Default 15s. */
  timeoutMs?: number;
  /** Inject the client factory for tests. */
  createClient?: StompClientFactory;
}

export async function probeStomp(
  cfg: StompTransportConfig,
  opts: ProbeOpts = {},
): Promise<ProbeResult> {
  // Resolve [bracket] tokens before probing — same as startProvider does
  // for the live path. Without this, tokens like [sid] reach the server
  // as literal strings instead of session-unique IDs.
  const resolvedCfg = resolveBracketCfg(cfg, new Map());
  const max = opts.maxRows ?? 200;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const collected: unknown[] = [];
  let settled = false;

  return new Promise<ProbeResult>((resolve) => {
    const finish = (result: ProbeResult) => {
      if (settled) return;
      settled = true;
      void handle.stop();
      resolve(result);
    };

    const timer = setTimeout(() => finish({ ok: false, error: `Probe timed out after ${timeoutMs}ms` }), timeoutMs);

    const handle = startStomp(resolvedCfg, (event) => {
      if ('rows' in event && event.rows) {
        for (const r of event.rows) {
          collected.push(r);
          if (collected.length >= max) {
            clearTimeout(timer);
            finish({ ok: true, rows: collected });
            return;
          }
        }
      }
      if ('status' in event) {
        if (event.status === 'ready') {
          clearTimeout(timer);
          finish({ ok: true, rows: collected });
        }
        if (event.status === 'error') {
          clearTimeout(timer);
          finish({ ok: false, error: event.error ?? 'Unknown STOMP error' });
        }
      }
    }, {
      // Probe must see rows as they arrive so it can cap at maxRows
      // and resolve quickly. Buffering the snapshot would defer
      // every row to the end-token (or never, if there isn't one).
      passthroughSnapshot: true,
      ...(opts.createClient ? { createClient: opts.createClient } : {}),
    });
  });
}

// ─── connectStomp() — pure socket connection test ─────────────────

/**
 * connectStomp — pure connection test for the editor's "Test
 * Connection" button. Opens the WebSocket + STOMP session and resolves
 * `{ ok: true }` the moment the broker completes the handshake
 * (`client.onConnect`). It does **not** subscribe to the listener
 * topic, publish a trigger frame, or wait for any rows — a green
 * result means "the broker is reachable and the STOMP handshake
 * succeeded", nothing more. Auto-reconnect is disabled
 * (`reconnectDelay: 0`) so a failed test fails fast instead of
 * silently retrying.
 *
 * Contrast with `probeStomp`, which runs the full data path (subscribe
 * + trigger + collect rows) because field inference needs real rows.
 * The Test button uses `connectStomp`; Infer Fields uses `probeStomp`.
 */
export async function connectStomp(
  cfg: StompTransportConfig,
  opts: ProbeOpts = {},
): Promise<ProbeResult> {
  // Resolve [bracket] tokens before connecting — same as the live path,
  // so the brokerURL the client opens matches what the provider will use.
  const resolvedCfg = resolveBracketCfg(cfg, new Map());
  const timeoutMs = opts.timeoutMs ?? 15_000;

  if (!resolvedCfg.websocketUrl || resolvedCfg.websocketUrl.includes('{{')) {
    return {
      ok: false,
      error: `Unresolved or missing WebSocket URL: ${resolvedCfg.websocketUrl || '(empty)'}`,
    };
  }

  let client: StompClient | null = null;
  let settled = false;

  return new Promise<ProbeResult>((resolve) => {
    const finish = (result: ProbeResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // No subscription was opened, so tear down with sub = null.
      void teardownStompConnection(client, null);
      resolve(result);
    };

    const timer = setTimeout(
      () => finish({ ok: false, error: `Connection timed out after ${timeoutMs}ms` }),
      timeoutMs,
    );

    void (async () => {
      let Ctor: (new (c: StompClientCfg) => StompClient) | null = null;
      try {
        Ctor = opts.createClient ? null : await loadDefaultClientCtor();
      } catch (err) {
        finish({ ok: false, error: err instanceof Error ? err.message : String(err) });
        return;
      }
      if (settled) return;

      const factory: StompClientFactory = opts.createClient ?? ((c) => new Ctor!(c));
      try {
        client = factory({
          brokerURL: resolvedCfg.websocketUrl,
          // A connection test must not auto-retry — fail fast.
          reconnectDelay: 0,
          heartbeatIncoming: resolvedCfg.heartbeat?.incoming ?? STOMP_TUNING_DEFAULTS.heartbeatMs,
          heartbeatOutgoing: resolvedCfg.heartbeat?.outgoing ?? STOMP_TUNING_DEFAULTS.heartbeatMs,
        });
      } catch (err) {
        finish({ ok: false, error: err instanceof Error ? err.message : String(err) });
        return;
      }

      client.onConnect = () => finish({ ok: true });
      client.onWebSocketError = () => finish({ ok: false, error: 'WebSocket connection failed' });
      client.onStompError = (frame) =>
        finish({ ok: false, error: frame.headers['message'] ?? 'STOMP error' });

      try {
        client.activate();
      } catch (err) {
        finish({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    })();
  });
}

// ─── helpers ───────────────────────────────────────────────────────

/**
 * Build the end-of-snapshot matcher ONCE per provider start. The old
 * shape (`body.toLowerCase().includes(token.toLowerCase())`) allocated
 * and scanned a full lowercased COPY of every frame body — several
 * MB/sec of garbage at streaming rates, paid on every live frame. A
 * precompiled case-insensitive regex is a single pass with zero copies
 * and identical substring semantics.
 */
function buildEndTokenMatcher(token: string | undefined): RegExp | null {
  if (!token) return null;
  return new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

/**
 * Deduplicate a snapshot buffer by keyColumn, preserving last-write-
 * wins ordering. Rows without a resolvable key fall through unchanged
 * (we can't dedup them, and dropping them would lose data). When the
 * cfg has no keyColumn, the buffer is returned as-is — the consumer
 * must already accept arbitrary duplicates in that mode.
 */
function dedupSnapshotBuffer(
  rows: readonly unknown[],
  keyColumn: string | readonly string[] | undefined,
): unknown[] {
  if (!keyColumn || rows.length === 0) return rows.slice();
  const byKey = new Map<string, unknown>();
  const noKey: unknown[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') {
      noKey.push(row);
      continue;
    }
    const id = composeRowId(row as Record<string, unknown>, keyColumn);
    if (id === null) {
      noKey.push(row);
      continue;
    }
    byKey.set(id, row);
  }
  // Keyed rows first (last-write-wins per key), then keyless tail.
  return [...byKey.values(), ...noKey];
}

function extractRows(parsed: unknown): unknown[] {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return [];
  const obj = parsed as Record<string, unknown>;
  if (Array.isArray(obj.rows)) return obj.rows;
  if (Array.isArray(obj.data)) return obj.data;
  return [obj];
}

/**
 * Drop `__`-prefixed overlay keys (e.g. the `__refresh` cache-buster
 * stamped by the Restart button). They exist only to defeat client-side
 * restart dedup and must never reach the broker. Returns `undefined`
 * when nothing publishable remains.
 */
function publicOverlayKeys(
  overlay: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!overlay) return undefined;
  const entries = Object.entries(overlay).filter(([k]) => !k.startsWith('__'));
  if (entries.length === 0) return undefined;
  if (entries.length === Object.keys(overlay).length) return overlay;
  return Object.fromEntries(entries);
}

/**
 * If `body` is JSON-shaped and `overlay` has publishable keys, merge
 * them onto the parsed body and re-stringify. Otherwise return body
 * as-is. This is the cheap "pass {asOfDate} through to the historical
 * provider's trigger" path. Internal `__`-prefixed keys never reach
 * the wire.
 */
function mergeOverlay(body: string, overlay: Record<string, unknown> | undefined): string {
  const wireOverlay = publicOverlayKeys(overlay);
  if (!wireOverlay) return body;
  const trimmed = body.trim();
  if (!trimmed) return JSON.stringify(wireOverlay);
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return body;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return body;
  return JSON.stringify({ ...(parsed as Record<string, unknown>), ...wireOverlay });
}

/** Substitute `overlay.asOfDate` into STOMP destination strings for historical snapshots. */
export function resolveStompDestinations(
  cfg: Pick<StompProviderConfig, 'listenerTopic' | 'requestMessage'>,
  overlay: Record<string, unknown> | undefined,
): { listenerTopic: string; requestMessage: string | undefined } {
  const asOfDate = typeof overlay?.asOfDate === 'string' ? overlay.asOfDate : undefined;
  if (!asOfDate) {
    return {
      listenerTopic: cfg.listenerTopic,
      requestMessage: cfg.requestMessage,
    };
  }
  const replaceAsOfDate = (value: string) =>
    value
      .replace(/\{\{positions\.asOfDate\}\}/g, asOfDate)
      .replace(/\{\{asOfDate\}\}/g, asOfDate);
  return {
    listenerTopic: replaceAsOfDate(cfg.listenerTopic),
    requestMessage: cfg.requestMessage ? replaceAsOfDate(cfg.requestMessage) : undefined,
  };
}
