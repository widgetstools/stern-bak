/**
 * Phase-1 stand-in for the live position book.
 *
 * Its only job is to prove the wire end to end: a deterministic set of rows,
 * a dirty set, and a tick that mutates a subset. The real book — a columnar
 * store fed by the factor model — replaces it wholesale in a later phase, so
 * nothing here tries to be economically meaningful.
 *
 * Two properties ARE load-bearing and carry over:
 *
 *  - No field value may contain the substring "success" in any casing. The
 *    client tests `snapshotEndToken` as a case-insensitive substring against
 *    every frame body BEFORE parsing it, so a row carrying that word would
 *    truncate the snapshot and the rest would be misread as live deltas.
 *    `assertNoSentinelCollision` enforces it and a test calls it.
 *  - Live batches are unique by key, because the dirty set is a Set of row
 *    indices. That puts the hub on its `uniqueKeys` fast branch.
 */

import type { DatasetId } from '../wire/destinations.js';
import type { RowSource } from './RowSource.js';

/** Deterministic LCG — same shape as the generator elsewhere in the repo. */
function createRng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const ASSET_CLASSES = ['Rates', 'CorpIG', 'CorpHY', 'Muni', 'AgencyMBS', 'CMBS', 'ABS', 'CDS'] as const;
const SECTORS = ['Treasury', 'Banking', 'Energy', 'Utilities', 'Technology', 'Healthcare', 'Transportation'] as const;
const RATINGS = ['AAA', 'AA+', 'AA', 'A+', 'A', 'BBB+', 'BBB', 'BB+', 'BB', 'B'] as const;
const DESKS = ['Rates', 'IG Credit', 'HY Credit', 'Munis', 'Securitized'] as const;
const TRADERS = ['T. Wong', 'A. Perez', 'C. Lindqvist', 'D. Sharma', 'E. Rossi'] as const;
const BOOKS = ['BOOK-01', 'BOOK-02', 'BOOK-03', 'BOOK-04'] as const;
const STATUSES = ['Open', 'Closing', 'Closed'] as const;

function pick<T>(arr: readonly T[], r: number): T {
  return arr[Math.floor(r * arr.length) % arr.length] as T;
}

function round(n: number, dp: number): number {
  return Number(n.toFixed(dp));
}

export interface SyntheticRow extends Record<string, unknown> {
  positionId: string;
  cusip: string;
  midPrice: number;
  lastUpdate: number;
}

export interface SyntheticBookOptions {
  rowCount?: number;
  seed?: number;
  dataset?: DatasetId;
}

export class SyntheticBook implements RowSource {
  readonly dataset: DatasetId;
  readonly keyColumn = 'positionId';

  private readonly rows: SyntheticRow[] = [];
  private readonly dirty = new Set<number>();
  private tickSeq = 0;

  constructor(options: SyntheticBookOptions = {}) {
    this.dataset = options.dataset ?? 'positions';
    const rowCount = options.rowCount ?? 5000;
    const rng = createRng(options.seed ?? 20260907);
    for (let i = 0; i < rowCount; i++) this.rows.push(buildRow(i, rng));
  }

  size(): number {
    return this.rows.length;
  }

  pendingLive(): number {
    return this.dirty.size;
  }

  async *snapshot(batchSize: number): AsyncIterable<readonly SyntheticRow[]> {
    for (let i = 0; i < this.rows.length; i += batchSize) {
      yield this.rows.slice(i, i + batchSize);
    }
  }

  drainLive(max: number): readonly SyntheticRow[] {
    if (max <= 0 || this.dirty.size === 0) return [];
    const out: SyntheticRow[] = [];
    for (const idx of this.dirty) {
      out.push(this.rows[idx] as SyntheticRow);
      this.dirty.delete(idx);
      if (out.length >= max) break;
    }
    return out;
  }

  /** Mutate `count` rows and mark them dirty. Returns rows actually touched. */
  tick(count: number): number {
    if (this.rows.length === 0) return 0;
    const rng = createRng(0x9e3779b1 ^ (this.tickSeq += 1));
    const now = Date.now();
    const touched = Math.min(count, this.rows.length);
    for (let i = 0; i < touched; i++) {
      const idx = Math.floor(rng() * this.rows.length);
      this.rows[idx] = repriceRow(this.rows[idx] as SyntheticRow, rng, now);
      this.dirty.add(idx);
    }
    return touched;
  }

  /** Every row, for the sentinel-collision test. */
  allRows(): readonly SyntheticRow[] {
    return this.rows;
  }
}

function buildRow(i: number, rng: () => number): SyntheticRow {
  const assetClass = pick(ASSET_CLASSES, rng());
  const couponRate = round(1 + rng() * 7, 3);
  const years = round(0.5 + rng() * 29.5, 2);
  const midYield = round(2.5 + rng() * 5, 4);
  const mid = round(100 - (midYield - couponRate) * years * 0.82, 4);
  const spread = assetClass === 'Rates' ? 0 : round(20 + rng() * 480, 1);
  const duration = round(Math.max(0.25, years * 0.85), 4);
  const face = Math.round((1 + Math.floor(rng() * 20)) * 1_000_000);
  const halfSpread = assetClass === 'CorpHY' ? 0.35 : assetClass === 'Rates' ? 0.02 : 0.08;
  const avgCost = round(mid * (0.94 + rng() * 0.1), 4);
  const marketValue = round((mid / 100) * face, 2);

  return {
    positionId: `POS-${String(i + 1).padStart(7, '0')}`,
    cusip: `${String(100000 + i).slice(0, 6)}A${String(i % 10)}${String((i * 7) % 10)}`,
    ticker: `TKR${String(i % 999).padStart(3, '0')}`,
    issuerName: `Issuer ${String(i % 650).padStart(3, '0')} Holdings`,
    assetClass,
    sector: pick(SECTORS, rng()),
    compositeRating: pick(RATINGS, rng()),
    currency: 'USD',
    couponRate,
    maturityDate: new Date(Date.now() + years * 365 * 86400000).toISOString().slice(0, 10),
    yearsToMaturity: years,
    bidPrice: round(mid - halfSpread, 4),
    askPrice: round(mid + halfSpread, 4),
    midPrice: mid,
    lastPrice: mid,
    priceChange: 0,
    priceChangePct: 0,
    yieldToMaturity: midYield,
    yieldToWorst: round(midYield - 0.05, 4),
    zSpread: spread,
    oas: spread === 0 ? 0 : round(spread - 4, 1),
    modifiedDuration: duration,
    convexity: round(duration * duration * 0.11, 4),
    dv01: round((duration * mid) / 10000, 6),
    spreadDuration: duration,
    quantityFace: face,
    avgCost,
    marketValue,
    accruedInterest: round((couponRate / 100) * face * (90 / 360), 2),
    unrealizedPnL: round(marketValue - (avgCost / 100) * face, 2),
    dailyPnL: 0,
    desk: pick(DESKS, rng()),
    book: pick(BOOKS, rng()),
    trader: pick(TRADERS, rng()),
    positionStatus: pick(STATUSES, rng()),
    lastUpdate: Date.now(),
  };
}

function repriceRow(row: SyntheticRow, rng: () => number, now: number): SyntheticRow {
  const oldMid = row.midPrice;
  const mid = round(oldMid + (rng() - 0.5) * 0.06, 4);
  const face = row.quantityFace as number;
  const avgCost = row.avgCost as number;
  const marketValue = round((mid / 100) * face, 2);
  const halfSpread = row.assetClass === 'CorpHY' ? 0.35 : row.assetClass === 'Rates' ? 0.02 : 0.08;
  return {
    ...row,
    bidPrice: round(mid - halfSpread, 4),
    askPrice: round(mid + halfSpread, 4),
    midPrice: mid,
    lastPrice: mid,
    priceChange: round(mid - oldMid, 4),
    priceChangePct: round(((mid - oldMid) / oldMid) * 100, 4),
    yieldToMaturity: round((row.yieldToMaturity as number) - (mid - oldMid) * 0.18, 4),
    marketValue,
    unrealizedPnL: round(marketValue - (avgCost / 100) * face, 2),
    dailyPnL: round(marketValue - (avgCost / 100) * face, 2),
    lastUpdate: now,
  };
}

/**
 * Throw if any value would collide with a snapshot end token.
 *
 * See the class comment: a row containing "success" truncates the snapshot at
 * the client. This is cheap to check and impossible to notice otherwise —
 * the symptom is a short grid, not an error.
 */
export function assertNoSentinelCollision(
  rows: readonly Record<string, unknown>[],
  tokens: readonly string[],
): void {
  const needles = tokens.map((t) => t.toLowerCase());
  for (const row of rows) {
    for (const [field, value] of Object.entries(row)) {
      if (typeof value !== 'string') continue;
      const hay = value.toLowerCase();
      for (const needle of needles) {
        if (hay.includes(needle)) {
          throw new Error(
            `Field '${field}' value ${JSON.stringify(value)} contains snapshot end token ` +
              `'${needle}' — it would truncate the snapshot at the client.`,
          );
        }
      }
    }
  }
}
