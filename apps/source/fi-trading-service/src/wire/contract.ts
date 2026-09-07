/**
 * Wire constants for the STOMP-on-WebSocket surface.
 *
 * Every value here is pinned against something in the browser client
 * (`packages/data/host-data/src/runtime/providers/transports/`) or the
 * SharedWorker hub (`runtime/worker/`). Changing one without changing
 * its counterpart is a silent performance or correctness regression,
 * so each carries the reason it holds the value it does.
 */

export const STOMP_VERSION = '1.2';
export const SERVER_NAME = 'fi-trading-service/1.0.0';

/**
 * Snapshot rows per MESSAGE frame.
 *
 * Pinned to the hub's `LATE_JOIN_CHUNK_SIZE` (worker/hubTypes.ts) and the
 * client's default `snapshotChunkSize` (transports/stomp.ts). When the wire
 * frame, the client flush chunk and the hub replay bucket share one boundary,
 * `seedAppendedReplayChunks` (worker/providerEmit.ts) adopts the broadcast
 * encoding for free. Any other value costs a full re-encode of the whole
 * cache for every late-joining window.
 */
export const SNAPSHOT_CHUNK_SIZE = 500;

/**
 * Live rows per MESSAGE frame.
 *
 * The ceiling stays at the snapshot chunk size so both paths share buffers.
 * The floor is above the hub's `LIVE_BIN_MIN_ROWS` (64), so every live frame
 * takes the pre-encoded `delta-bin` path — one encode, N byte-copies — rather
 * than N structured clones per subscribed window.
 */
export const LIVE_MAX_ROWS_PER_FRAME = 500;
export const LIVE_MIN_ROWS_PER_FRAME = 64;

/** Live publish cadence. 25 Hz — see the tick budget in the plan. */
export const LIVE_TICK_MS = 40;

/** Hard cap on work inside one live tick, so heartbeats can never starve. */
export const LIVE_TICK_BUDGET_MS = 8;

/**
 * Heartbeat we advertise, in ms.
 *
 * The reference server sends `0,0`, which disables heartbeats and lets a
 * half-open TCP connection stall the provider forever. Advertising 10s arms
 * the client's watchdog (fastStompClient closes after 2x silence), turning a
 * dead socket into a clean reconnect. In exchange the server owes a bare LF
 * every interval, emitted on its own timer.
 */
export const SERVER_HEARTBEAT_MS = 10_000;

/** Stop producing when the socket has this many bytes queued. */
export const OUTBOUND_HIGH_WATER_BYTES = 8 * 1024 * 1024;
/** Resume once it drains back below this. */
export const OUTBOUND_LOW_WATER_BYTES = 2 * 1024 * 1024;
/** Poll interval while waiting for a backed-up socket to drain. */
export const BACKPRESSURE_RETRY_MS = 5;

/** Reject absurd trigger rates rather than trying to honour them. */
export const MAX_LIVE_ROWS_PER_SEC = 1_000_000;

export const DESTINATION_ERRORS = '/errors';

export const HEADER = {
  contentType: 'content-type',
  contentLength: 'content-length',
  messageType: 'message-type',
  subscription: 'subscription',
  messageId: 'message-id',
  destination: 'destination',
  batchNumber: 'batch-number',
  updateNumber: 'update-number',
  clientId: 'client-id',
  receipt: 'receipt',
  receiptId: 'receipt-id',
  /** CSV of column names — server-side projection, see the plan. */
  fields: 'fields',
} as const;

export const MESSAGE_TYPE = {
  snapshot: 'snapshot',
  snapshotComplete: 'snapshot-complete',
  liveUpdate: 'live-update',
  orderAck: 'order-ack',
} as const;

export const CONTENT_TYPE_JSON = 'application/json';

/**
 * Preferred snapshot sentinel token.
 *
 * The client tests `snapshotEndToken` as a case-insensitive SUBSTRING against
 * every frame body, BEFORE JSON.parse (transports/stomp.ts, `handleFrame`).
 * So a data row containing the word "success" — an order status, a fill state
 * — would terminate the snapshot early and the remainder would be misread as
 * live deltas. This token cannot occur in data.
 */
export const SNAPSHOT_END_TOKEN = '__SNAPSHOT_COMPLETE__';

/** The legacy token, still the client's default when a config omits one. */
export const LEGACY_SNAPSHOT_END_TOKEN = 'Success';

/**
 * Completion sentinel body. Carries BOTH tokens so it terminates the snapshot
 * whether the provider config uses the safe token or falls back to the
 * client's default.
 */
export function snapshotCompleteBody(
  dataset: string,
  rowCount: number,
  clientId: string,
): string {
  return (
    `${SNAPSHOT_END_TOKEN} ${LEGACY_SNAPSHOT_END_TOKEN}: ` +
    `All ${rowCount} ${dataset} records delivered to client '${clientId}'. ` +
    `Starting live updates...`
  );
}
