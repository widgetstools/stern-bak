import { describe, expect, it } from "vitest";
import type { PositionRecord, TradeRecord } from "./fiRecords.js";
import {
  SPARSE_TICK_FIELDS,
  TRADE_TICK_FIELDS,
  pickErraticFields,
  sparseErraticTickPosition,
  sparseErraticTickTrade,
} from "./sparseTick.js";

function sampleRow(): PositionRecord {
  return {
    positionId: "POS-test-1",
    cusip: "TEST12345",
    instrumentType: "Corporate",
    notionalAmount: 1_000_000,
    currentPrice: 100,
    marketValue: 1_000_000,
    bookValue: 990_000,
    pnl: 10_000,
    yield: 4.5,
    spread: 120,
    pv01: 5000,
    dv01: 5200,
  };
}

describe("pickErraticFields", () => {
  it("caps the hot-field pool at 15 fields", () => {
    expect(SPARSE_TICK_FIELDS.length).toBeLessThanOrEqual(15);
    expect(TRADE_TICK_FIELDS.length).toBeLessThanOrEqual(15);
  });

  it("returns a bounded subset of known headline fields", () => {
    for (let i = 0; i < 200; i++) {
      const fields = pickErraticFields();
      expect(fields.length).toBeGreaterThanOrEqual(1);
      expect(fields.length).toBeLessThanOrEqual(SPARSE_TICK_FIELDS.length);
      for (const f of fields) {
        expect(SPARSE_TICK_FIELDS).toContain(f);
      }
    }
  });

  it("draws small subsets most of the time (not all fields at once)", () => {
    let small = 0;
    const draws = 500;
    for (let i = 0; i < draws; i++) {
      if (pickErraticFields().length <= 5) small++;
    }
    // Weighted draw: 1–3 fields dominate; ≤5 fields should be the vast
    // majority even after correlation bundles expand a pick.
    expect(small / draws).toBeGreaterThan(0.6);
  });

  it("can expand price picks to marketValue and pnl", () => {
    let n = 0;
    const rng = () => {
      n++;
      if (n === 1) return 0;
      if (n === 2) return 0;
      return 0.1;
    };
    const fields = pickErraticFields(rng);
    if (fields.includes("currentPrice")) {
      expect(fields).toContain("marketValue");
      expect(fields).toContain("pnl");
    }
  });
});

describe("sparseErraticTickPosition", () => {
  it("returns positionId plus only selected fields", () => {
    const row = sampleRow();
    const delta = sparseErraticTickPosition(row, () => 0.05);
    expect(delta).not.toBeNull();
    expect(delta!.positionId).toBe("POS-test-1");
    const keys = Object.keys(delta!).filter((k) => k !== "positionId");
    expect(keys.length).toBeGreaterThanOrEqual(1);
    for (const key of keys) {
      expect(SPARSE_TICK_FIELDS).toContain(
        key as (typeof SPARSE_TICK_FIELDS)[number],
      );
    }
  });

  it("mutates the in-memory row for each selected field", () => {
    const row = sampleRow();
    const delta = sparseErraticTickPosition(row, () => 0.05);
    expect(delta).not.toBeNull();
    for (const key of Object.keys(delta!)) {
      if (key === "positionId") continue;
      expect(row[key as keyof PositionRecord]).toEqual(
        delta![key as keyof typeof delta],
      );
    }
  });

  it("never touches fields outside the hot pool", () => {
    const row = sampleRow();
    const before = { ...row };
    for (let i = 0; i < 50; i++) sparseErraticTickPosition(row);
    const hot = new Set<string>(SPARSE_TICK_FIELDS);
    for (const key of Object.keys(before)) {
      if (hot.has(key)) continue;
      expect(row[key]).toEqual(before[key]);
    }
  });
});

describe("sparseErraticTickTrade", () => {
  function sampleTrade(): TradeRecord {
    return {
      tradeId: "TRD-test-1",
      cusip: "TEST12345",
      side: "BUY",
      quantity: 500,
      notionalAmount: 500_000,
      principalAmount: 500_000,
      price: 101.5,
      yield: 4.2,
      spread: 95,
      accruedInterest: 1_200,
      totalConsideration: 501_200,
      fxRate: 1.08,
      baseCurrencyAmount: 540_000,
    };
  }

  it("returns tradeId plus only hot trade fields, mutating the row", () => {
    const row = sampleTrade();
    const delta = sparseErraticTickTrade(row, () => 0.05);
    expect(delta).not.toBeNull();
    expect(delta!.tradeId).toBe("TRD-test-1");
    for (const key of Object.keys(delta!)) {
      if (key === "tradeId") continue;
      expect(TRADE_TICK_FIELDS).toContain(
        key as (typeof TRADE_TICK_FIELDS)[number],
      );
      expect(row[key as keyof TradeRecord]).toEqual(
        delta![key as keyof typeof delta],
      );
    }
  });

  it("never touches fields outside the hot pool", () => {
    const row = sampleTrade();
    const before = { ...row };
    for (let i = 0; i < 50; i++) sparseErraticTickTrade(row);
    const hot = new Set<string>(TRADE_TICK_FIELDS);
    for (const key of Object.keys(before)) {
      if (hot.has(key)) continue;
      expect(row[key]).toEqual(before[key]);
    }
  });
});
