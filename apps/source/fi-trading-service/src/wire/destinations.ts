/**
 * Destination grammar.
 *
 * One grammar covers all six datasets:
 *
 *   subscribe : /snapshot/{dataset}/{clientId}
 *   trigger   : /snapshot/{dataset}/{clientId}/{rate}[/{batchSize}]
 *
 * plus a historical variant, positions only, mirroring the client:
 *
 *   subscribe : /snapshot/positions/{clientId}/{asOfDate}
 *   trigger   : /snapshot/positions/{clientId}/{asOfDate}[/{batchSize}]
 *
 * Why this shape and not something tidier: the client validates destinations
 * on every connect (`transports/stompPathContract.ts`). A listener topic
 * matching /^\/snapshot\/(positions|trades)\/[^/]+$/ is classified `live` and
 * its trigger is then REQUIRED to match
 * /^\/snapshot\/(positions|trades)\/([^/]+)\/(\d+)(?:\/(\d+))?$/ — the
 * provider errors out before a byte moves otherwise. Datasets outside that
 * alternation classify `unknown` and pass unconditionally. Reusing the same
 * grammar everywhere satisfies both branches with one parser here.
 *
 * The `{asOfDate}` / `{rate}` ambiguity is real and load-bearing: the client's
 * `parseAsOfDateSegment` accepts a bare `YYYYMMDD`, so `/snapshot/positions/
 * trd1/20260315` is a DATE, not a rate of 20,260,315. We resolve it the same
 * way the client does — date wins — and reject out-of-range rates explicitly
 * rather than letting one be silently reinterpreted.
 */

import { MAX_LIVE_ROWS_PER_SEC, SNAPSHOT_CHUNK_SIZE } from './contract.js';

export const DATASETS = [
  'positions',
  'trades',
  'securityMaster',
  'marketData',
  'orders',
  'taxLots',
] as const;

export type DatasetId = (typeof DATASETS)[number];

/** Datasets the client's path contract constrains. Others pass unchecked. */
export const CONTRACT_CONSTRAINED: ReadonlySet<DatasetId> = new Set<DatasetId>([
  'positions',
  'trades',
]);

/** Row identity per dataset. The hub silently drops rows that miss this. */
const KEY_COLUMNS: Record<DatasetId, string> = {
  positions: 'positionId',
  trades: 'tradeId',
  securityMaster: 'securityId',
  marketData: 'curvePointId',
  orders: 'orderId',
  taxLots: 'lotId',
};

export function keyColumnFor(dataset: DatasetId): string {
  return KEY_COLUMNS[dataset];
}

export function isDatasetId(value: string): value is DatasetId {
  return (DATASETS as readonly string[]).includes(value);
}

export interface SubscribeTarget {
  dataset: DatasetId;
  clientId: string;
  /** Set only for the historical positions path. */
  asOfDate: string | null;
}

export interface TriggerTarget {
  dataset: DatasetId;
  clientId: string;
  /** Target aggregate row-updates per second. 0 means snapshot only. */
  rate: number;
  batchSize: number;
  asOfDate: string | null;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function fail<T>(error: string): ParseResult<T> {
  return { ok: false, error };
}

/**
 * Normalize an as-of-date segment to `YYYY-MM-DD`, or null if it isn't one.
 * Accepts `YYYY-MM-DD` and bare `YYYYMMDD`, matching the client.
 */
export function parseAsOfDateSegment(segment: string): string | null {
  const dashed = /^(\d{4})-(\d{2})-(\d{2})$/.exec(segment);
  const bare = /^(\d{4})(\d{2})(\d{2})$/.exec(segment);
  const m = dashed ?? bare;
  if (m === null) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function splitDestination(destination: string): ParseResult<{ dataset: DatasetId; rest: string[] }> {
  const parts = destination.split('/');
  // A leading slash yields an empty first element.
  if (parts[0] !== '' || parts[1] !== 'snapshot') {
    return fail(`Destination must start with /snapshot/: ${destination}`);
  }
  const rawDataset = parts[2] ?? '';
  if (!isDatasetId(rawDataset)) {
    return fail(`Unknown dataset '${rawDataset}'. Known: ${DATASETS.join(', ')}`);
  }
  const rest = parts.slice(3);
  if (rest.length === 0 || rest[0] === '') {
    return fail(`Destination is missing a clientId: ${destination}`);
  }
  return { ok: true, value: { dataset: rawDataset, rest } };
}

/** Parse a SUBSCRIBE destination. */
export function parseSubscribeDestination(destination: string): ParseResult<SubscribeTarget> {
  const split = splitDestination(destination);
  if (!split.ok) return split;
  const { dataset, rest } = split.value;
  const clientId = rest[0] as string;

  if (rest.length === 1) {
    return { ok: true, value: { dataset, clientId, asOfDate: null } };
  }
  if (rest.length === 2 && dataset === 'positions') {
    const asOfDate = parseAsOfDateSegment(rest[1] as string);
    if (asOfDate === null) {
      return fail(`Historical positions topic needs a valid date, got '${rest[1]}'`);
    }
    return { ok: true, value: { dataset, clientId, asOfDate } };
  }
  return fail(`Unrecognised subscribe destination: ${destination}`);
}

function parseRate(segment: string): ParseResult<number> {
  if (!/^\d+$/.test(segment)) return fail(`Rate must be digits, got '${segment}'`);
  const rate = Number.parseInt(segment, 10);
  if (rate > MAX_LIVE_ROWS_PER_SEC) {
    return fail(
      `Rate ${rate} exceeds the ${MAX_LIVE_ROWS_PER_SEC} rows/sec ceiling. ` +
        `An 8-digit segment here is usually a YYYYMMDD date on the wrong dataset.`,
    );
  }
  return { ok: true, value: rate };
}

function parseBatchSize(segment: string | undefined): ParseResult<number> {
  if (segment === undefined) return { ok: true, value: SNAPSHOT_CHUNK_SIZE };
  if (!/^\d+$/.test(segment)) return fail(`Batch size must be digits, got '${segment}'`);
  const size = Number.parseInt(segment, 10);
  if (size <= 0) return fail(`Batch size must be positive, got ${size}`);
  return { ok: true, value: size };
}

/** Parse a SEND (trigger) destination. */
export function parseTriggerDestination(destination: string): ParseResult<TriggerTarget> {
  const split = splitDestination(destination);
  if (!split.ok) return split;
  const { dataset, rest } = split.value;
  const clientId = rest[0] as string;

  if (rest.length < 2 || rest.length > 3) {
    return fail(`Unrecognised trigger destination: ${destination}`);
  }

  // Positions only: a valid date in slot 2 means the historical path. The
  // client resolves the same ambiguity the same way, so we must agree.
  if (dataset === 'positions') {
    const asOfDate = parseAsOfDateSegment(rest[1] as string);
    if (asOfDate !== null) {
      const batch = parseBatchSize(rest[2]);
      if (!batch.ok) return batch;
      return {
        ok: true,
        value: { dataset, clientId, rate: 0, batchSize: batch.value, asOfDate },
      };
    }
  }

  const rate = parseRate(rest[1] as string);
  if (!rate.ok) return rate;
  const batch = parseBatchSize(rest[2]);
  if (!batch.ok) return batch;
  return {
    ok: true,
    value: { dataset, clientId, rate: rate.value, batchSize: batch.value, asOfDate: null },
  };
}

/** Format the subscribe destination a target corresponds to. */
export function subscribeDestination(target: SubscribeTarget): string {
  const base = `/snapshot/${target.dataset}/${target.clientId}`;
  return target.asOfDate === null ? base : `${base}/${target.asOfDate}`;
}

/** True when a trigger addresses the same stream as a subscription. */
export function triggerMatchesSubscription(
  trigger: TriggerTarget,
  sub: SubscribeTarget,
): boolean {
  return (
    trigger.dataset === sub.dataset &&
    trigger.clientId === sub.clientId &&
    trigger.asOfDate === sub.asOfDate
  );
}
