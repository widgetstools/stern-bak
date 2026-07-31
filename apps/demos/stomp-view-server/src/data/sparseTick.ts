import type { PositionRecord, TradeRecord } from "./fiRecords.js";

/**
 * Hot-field tick engine — mimics how a real trading feed updates rows.
 *
 * A live row update never rewrites the whole record: it touches a small
 * random subset of the handful of fields that actually move intraday
 * (price, valuations, PnL, spreads, risk sensitivities). This module
 * owns that field pool (≤15 fields per data type) and the weighted /
 * correlated draw of which fields change on a given row tick.
 *
 * Both live wire modes ride the same engine:
 *   - `legacy` (default) — the row is mutated in place and the FULL row
 *     is shipped; only hot-field VALUES differ from the previous image.
 *     This matches real full-image feeds and is what makes the
 *     platform's `thinDeltas` diffing representative.
 *   - `sparse` — the same mutation, but the wire carries only the row
 *     key + the changed fields (partial delta).
 */

/** Headline position fields eligible for live ticks (hard cap: 15). */
export const SPARSE_TICK_FIELDS = [
  "currentPrice",
  "marketValue",
  "totalValue",
  "pnl",
  "unrealizedPnl",
  "dailyPnl",
  "mtdPnl",
  "ytdPnl",
  "yield",
  "spread",
  "zSpread",
  "oas",
  "dv01",
  "pv01",
  "cs01",
] as const;

export type SparseTickField = (typeof SPARSE_TICK_FIELDS)[number];

export type SparsePositionDelta = Partial<
  Pick<PositionRecord, SparseTickField>
> & {
  positionId: string;
};

/** Headline trade fields eligible for live ticks. */
export const TRADE_TICK_FIELDS = [
  "price",
  "yield",
  "spread",
  "accruedInterest",
  "totalConsideration",
  "fxRate",
  "baseCurrencyAmount",
] as const;

export type TradeTickField = (typeof TRADE_TICK_FIELDS)[number];

export type SparseTradeDelta = Partial<
  Pick<TradeRecord, TradeTickField>
> & {
  tradeId: string;
};

/**
 * Weighted draw for how many distinct fields change on one row tick.
 * Small subsets dominate — most real ticks are a price or a PnL mark,
 * not a broadside — but occasional wide re-marks touch most of the pool.
 */
const FIELD_COUNT_WEIGHTS: readonly [count: number, weight: number][] = [
  [1, 0.30],
  [2, 0.24],
  [3, 0.16],
  [4, 0.10],
  [5, 0.07],
  [6, 0.05],
  [7, 0.03],
  [8, 0.02],
  [9, 0.01],
  [10, 0.01],
  [12, 0.005],
  [15, 0.005],
];

function random(): number {
  return Math.random();
}

function pickFieldCount(rng: () => number = random): number {
  const roll = rng();
  let cumulative = 0;
  for (const [count, weight] of FIELD_COUNT_WEIGHTS) {
    cumulative += weight;
    if (roll <= cumulative) return count;
  }
  return 1;
}

function shuffleFields<T>(fields: readonly T[], rng: () => number): T[] {
  const copy = [...fields];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = copy[i]!;
    copy[i] = copy[j]!;
    copy[j] = tmp;
  }
  return copy;
}

function uniqueFields<T>(fields: T[]): T[] {
  return [...new Set(fields)];
}

/**
 * Pick an erratic subset of headline fields. Correlation bundles mimic
 * real feeds: a price move usually carries the valuations and PnL with
 * it; spread shocks pull the curve family (yield / zSpread / OAS); risk
 * sensitivities re-mark together; a daily PnL tick rolls into MTD/YTD.
 */
export function pickErraticFields(rng: () => number = random): SparseTickField[] {
  const count = pickFieldCount(rng);
  let fields = shuffleFields(SPARSE_TICK_FIELDS, rng).slice(0, count);

  if (fields.includes("currentPrice") && rng() < 0.65) {
    fields = uniqueFields([...fields, "marketValue", "pnl"]);
  }
  if (fields.includes("marketValue")) {
    if (rng() < 0.4 && !fields.includes("pnl")) fields.push("pnl");
    if (rng() < 0.5 && !fields.includes("totalValue")) fields.push("totalValue");
  }
  if (fields.includes("pnl")) {
    if (rng() < 0.45 && !fields.includes("unrealizedPnl")) fields.push("unrealizedPnl");
    if (rng() < 0.3 && !fields.includes("dailyPnl")) fields.push("dailyPnl");
  }
  if (fields.includes("dailyPnl") && rng() < 0.5 && !fields.includes("mtdPnl")) {
    fields.push("mtdPnl");
  }
  if (fields.includes("mtdPnl") && rng() < 0.6 && !fields.includes("ytdPnl")) {
    fields.push("ytdPnl");
  }
  if (fields.includes("spread")) {
    if (rng() < 0.45 && !fields.includes("yield")) fields.push("yield");
    if (rng() < 0.4 && !fields.includes("zSpread")) fields.push("zSpread");
    if (rng() < 0.35 && !fields.includes("oas")) fields.push("oas");
  }
  if (fields.includes("yield") && rng() < 0.35 && !fields.includes("spread")) {
    fields.push("spread");
  }
  if (fields.includes("pv01") && rng() < 0.38 && !fields.includes("dv01")) {
    fields.push("dv01");
  }
  if (fields.includes("dv01")) {
    if (rng() < 0.3 && !fields.includes("pv01")) fields.push("pv01");
    if (rng() < 0.3 && !fields.includes("cs01")) fields.push("cs01");
  }

  return uniqueFields(fields);
}

function applyFieldTick(
  row: PositionRecord,
  field: SparseTickField,
  rng: () => number,
): void {
  const jitter = () => (rng() - 0.5) * 2;

  switch (field) {
    case "currentPrice": {
      const notional = Number(row.notionalAmount) || 1;
      const price = Number(row.currentPrice) * (1 + jitter() * 0.01);
      row.currentPrice = Number(price.toFixed(4));
      row.marketValue = Math.round((notional * Number(row.currentPrice)) / 100);
      row.pnl = Math.round(
        Number(row.marketValue) - Number(row.bookValue ?? row.marketValue),
      );
      break;
    }
    case "marketValue": {
      const mv = Number(row.marketValue) * (1 + jitter() * 0.008);
      row.marketValue = Math.round(mv);
      row.pnl = Math.round(
        Number(row.marketValue) - Number(row.bookValue ?? row.marketValue),
      );
      break;
    }
    case "totalValue": {
      row.totalValue = Math.round(
        Number(row.marketValue ?? row.totalValue ?? 0) +
          Number(row.accruedInterest ?? 0),
      );
      break;
    }
    case "pnl": {
      row.pnl = Math.round(Number(row.pnl) + jitter() * 5000);
      break;
    }
    case "unrealizedPnl": {
      row.unrealizedPnl = Math.round(
        Number(row.pnl ?? 0) * 0.8 + jitter() * 2500,
      );
      break;
    }
    case "dailyPnl": {
      row.dailyPnl = Math.round(Number(row.dailyPnl ?? 0) + jitter() * 3000);
      break;
    }
    case "mtdPnl": {
      row.mtdPnl = Math.round(Number(row.mtdPnl ?? 0) + jitter() * 4000);
      break;
    }
    case "ytdPnl": {
      row.ytdPnl = Math.round(Number(row.ytdPnl ?? 0) + jitter() * 6000);
      break;
    }
    case "yield": {
      const y = Number(row.yield) * (1 + jitter() * 0.015);
      row.yield = Number(Math.max(0, y).toFixed(3));
      break;
    }
    case "spread": {
      row.spread = Math.round(Number(row.spread) + jitter() * 8);
      break;
    }
    case "zSpread": {
      row.zSpread = Math.round(Number(row.zSpread ?? 0) + jitter() * 8);
      break;
    }
    case "oas": {
      row.oas = Math.round(Number(row.oas ?? 0) + jitter() * 8);
      break;
    }
    case "dv01": {
      row.dv01 = Number(
        (Number(row.dv01) * (1 + jitter() * 0.04)).toFixed(2),
      );
      break;
    }
    case "pv01": {
      row.pv01 = Number(
        (Number(row.pv01) * (1 + jitter() * 0.04)).toFixed(2),
      );
      break;
    }
    case "cs01": {
      row.cs01 = Number(
        (Number(row.cs01 ?? 0) * (1 + jitter() * 0.04)).toFixed(2),
      );
      break;
    }
  }
}

function applyTradeFieldTick(
  row: TradeRecord,
  field: TradeTickField,
  rng: () => number,
): void {
  const jitter = () => (rng() - 0.5) * 2;

  switch (field) {
    case "price": {
      row.price = Number(
        (Number(row.price) * (1 + jitter() * 0.01)).toFixed(4),
      );
      break;
    }
    case "yield": {
      const y = Number(row.yield) * (1 + jitter() * 0.015);
      row.yield = Number(Math.max(0, y).toFixed(3));
      break;
    }
    case "spread": {
      row.spread = Math.round(Number(row.spread) + jitter() * 8);
      break;
    }
    case "accruedInterest": {
      row.accruedInterest = Number(
        (Number(row.accruedInterest ?? 0) * (1 + jitter() * 0.01)).toFixed(2),
      );
      break;
    }
    case "totalConsideration": {
      row.totalConsideration = Math.round(
        Number(row.principalAmount ?? row.totalConsideration ?? 0) +
          Number(row.accruedInterest ?? 0),
      );
      break;
    }
    case "fxRate": {
      row.fxRate = Number(
        (Number(row.fxRate ?? 1) * (1 + jitter() * 0.002)).toFixed(4),
      );
      break;
    }
    case "baseCurrencyAmount": {
      row.baseCurrencyAmount = Math.round(
        Number(row.notionalAmount ?? row.baseCurrencyAmount ?? 0) *
          Number(row.fxRate ?? 1),
      );
      break;
    }
  }
}

/** Erratic subset draw for trades — smaller pool, same shape. */
export function pickErraticTradeFields(
  rng: () => number = random,
): TradeTickField[] {
  const count = Math.min(TRADE_TICK_FIELDS.length, pickFieldCount(rng));
  let fields = shuffleFields(TRADE_TICK_FIELDS, rng).slice(0, count);

  if (fields.includes("price") && rng() < 0.5 && !fields.includes("totalConsideration")) {
    fields.push("totalConsideration");
  }
  if (fields.includes("fxRate") && rng() < 0.6 && !fields.includes("baseCurrencyAmount")) {
    fields.push("baseCurrencyAmount");
  }
  return uniqueFields(fields);
}

/**
 * Mutate `row` in place for the erratic field subset and return a sparse
 * wire payload (`positionId` + changed fields only). Full-row wire modes
 * call this for the mutation and ship the row itself.
 */
export function sparseErraticTickPosition(
  row: PositionRecord,
  rng: () => number = random,
): SparsePositionDelta | null {
  const fields = pickErraticFields(rng);
  if (fields.length === 0) return null;

  const delta: SparsePositionDelta = { positionId: row.positionId };
  for (const field of fields) {
    applyFieldTick(row, field, rng);
    delta[field] = row[field] as PositionRecord[SparseTickField];
  }
  return delta;
}

/** Trade twin of {@link sparseErraticTickPosition}. */
export function sparseErraticTickTrade(
  row: TradeRecord,
  rng: () => number = random,
): SparseTradeDelta | null {
  const fields = pickErraticTradeFields(rng);
  if (fields.length === 0) return null;

  const delta: SparseTradeDelta = { tradeId: row.tradeId };
  for (const field of fields) {
    applyTradeFieldTick(row, field, rng);
    delta[field] = row[field] as TradeRecord[TradeTickField];
  }
  return delta;
}
