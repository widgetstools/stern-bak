/**
 * Wire-compatible with stomp-fixed-income-server `protocolContract.js`.
 * Extensions (optional STOMP headers) are documented below — omitting them preserves client behavior.
 */

export const STOMP_VERSION = "1.2";
export const SERVER_NAME = "stomp-fixed-income/1.0.0";
export const HEART_BEAT = "0,0";

export const DESTINATION_ERRORS = "/errors";

/** Client-specific trigger: /snapshot/{positions|trades}/{clientId}/{rate}[/{batchSize}] */
export const TRIGGER_CLIENT_SPECIFIC =
  /^\/snapshot\/(positions|trades)\/([^/]+)\/(\d+)(?:\/(\d+))?$/;

/** Legacy trigger: /snapshot/{positions|trades}/{rate}[/{batchSize}] */
export const TRIGGER_LEGACY =
  /^\/snapshot\/(positions|trades)\/(\d+)(?:\/(\d+))?$/;

/**
 * Historical positions snapshot (no live updates):
 * /snapshot/positions/{clientId}/{asOfDate}[/{batchSize}]
 * `asOfDate`: `YYYY-MM-DD` or `YYYYMMDD`
 */
export const TRIGGER_AS_OF_DATE_POSITIONS =
  /^\/snapshot\/positions\/([^/]+)\/([^/]+)(?:\/(\d+))?$/;

export const DEFAULT_AS_OF_DATE_BATCH_SIZE = 50;

/** Subscription path /snapshot/{positions|trades}/{clientId} */
export const CLIENT_TOPIC_REGEX = /^\/snapshot\/(positions|trades)\/[^/]+$/;

/**
 * Snapshot batches are pumped back-to-back (setImmediate between
 * batches) the moment the trigger arrives — there is no artificial
 * inter-batch delay. This is only the retry delay while the socket's
 * send buffer is above the backpressure high-water mark.
 */
export const SNAPSHOT_BACKPRESSURE_RETRY_MS = 5;

/** Optional extension — existing clients do not send this; server uses env defaults. */
export const HEADER_SNAPSHOT_ROWS = "snapshot-rows";

/**
 * Optional extension — live update wire shape. `sparse` (alias
 * `sparse-erratic`) emits partial position deltas (headline fields
 * only, erratic subset per row). Omitted → env `LIVE_MODE` default
 * (`legacy` = full rows whose hot-field values changed).
 */
export const HEADER_LIVE_MODE = "live-mode";

export const HEADER = {
  MESSAGE_TYPE: "message-type",
  CONTENT_TYPE: "content-type",
  BATCH_NUMBER: "batch-number",
  CLIENT_ID: "client-id",
  UPDATE_NUMBER: "update-number",
  SUBSCRIPTION: "subscription",
  MESSAGE_ID: "message-id",
  DESTINATION: "destination",
} as const;

export const MESSAGE_TYPE = {
  SNAPSHOT: "snapshot",
  SNAPSHOT_COMPLETE: "snapshot-complete",
  LIVE_UPDATE: "live-update",
} as const;

export function connectedHeaders(sessionId: string): Record<string, string> {
  return {
    version: STOMP_VERSION,
    session: sessionId,
    server: SERVER_NAME,
    "heart-beat": HEART_BEAT,
  };
}

export function genericSubscriptionDestination(dataType: string): string {
  return `/snapshot/${dataType}`;
}

export function clientSubscriptionDestination(
  dataType: string,
  clientId: string,
): string {
  return `/snapshot/${dataType}/${clientId}`;
}

/** Subscribe + receive historical positions for one as-of date (separate from live topic). */
export function asOfDateSubscriptionDestination(
  clientId: string,
  asOfDateDisplay: string,
): string {
  return `/snapshot/positions/${clientId}/${asOfDateDisplay}`;
}

/**
 * Snapshot batch size when the trigger omits `batchSize`. `rate` is the
 * requested aggregate row-updates/sec, so scale with it but keep
 * batches inside a sane band — snapshot delivery is drain-paced, not
 * interval-paced, so the batch size only shapes frame granularity.
 */
export function defaultBatchSize(rate: number): number {
  return Math.min(2000, Math.max(100, Math.floor(rate / 10)));
}

export function legacySnapshotCompleteText(
  totalRecords: number,
  dataType: string,
): string {
  return `Success: All ${totalRecords} ${dataType} snapshot records delivered. Starting live updates...`;
}

export function clientSnapshotCompleteText(
  totalRecords: number,
  dataType: string,
  clientId: string,
): string {
  return `Success: All ${totalRecords} ${dataType} records delivered to client '${clientId}'. Starting live updates...`;
}

export function parseAsOfDateSegment(segment: string): string | null {
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/;
  const isoMatch = segment.match(isoDate);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    ) {
      return parsed.toISOString();
    }
    return null;
  }

  if (/^\d{8}$/.test(segment)) {
    const year = Number(segment.slice(0, 4));
    const month = Number(segment.slice(4, 6));
    const day = Number(segment.slice(6, 8));
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() === month - 1 &&
      parsed.getUTCDate() === day
    ) {
      return parsed.toISOString();
    }
  }

  return null;
}

export function parseAsOfDateTrigger(requestString: string): {
  clientId: string;
  asOfDateIso: string;
  asOfDateDisplay: string;
  batchSize: number;
} | null {
  const match = requestString.match(TRIGGER_AS_OF_DATE_POSITIONS);
  if (!match) return null;

  const asOfDateIso = parseAsOfDateSegment(match[2] ?? "");
  if (!asOfDateIso) return null;

  const batchRaw = match[3];
  const parsedBatch = batchRaw ? Number.parseInt(batchRaw, 10) : NaN;
  const batchSize =
    Number.isFinite(parsedBatch) && parsedBatch >= 1
      ? parsedBatch
      : DEFAULT_AS_OF_DATE_BATCH_SIZE;

  return {
    clientId: match[1] ?? "",
    asOfDateIso,
    asOfDateDisplay: match[2] ?? "",
    batchSize,
  };
}

export function asOfDateSnapshotCompleteText(
  totalRecords: number,
  asOfDateDisplay: string,
  clientId: string,
): string {
  return `Success: All ${totalRecords} positions snapshot records delivered for as-of date '${asOfDateDisplay}' to client '${clientId}'.`;
}
