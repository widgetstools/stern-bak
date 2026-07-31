/**
 * Nested-field test data for the fixture-based e2e suite.
 *
 * Distinct from `data.ts` (flat `Order`) so the existing 20 specs that
 * key off the flat shape stay untouched. Each `NestedOrder` carries the
 * dot-notation paths the recent fixes target:
 *
 *   - `pricing.{bid,ask,mid,last}`     — numeric, used by formatters,
 *                                         cell rules, calc cols, groups
 *   - `ratings.{sp,moodys,fitch}`      — string, used by formatters,
 *                                         cross-rule conditionals
 *   - `risk.{dv01,duration,convexity}` — numeric, used by row rules +
 *                                         aggregates
 *   - `issuer.{name,sector,country}`   — string, used in column groups
 *
 * Edge-case rows are seeded deliberately by index so specs can target
 * them with `getRowNode(id)` and assert determinate behaviour:
 *
 *   - `EDGE-NULL-PRICING`  — entire `pricing` object is null
 *   - `EDGE-MISS-PRICING`  — `pricing` key missing entirely (undefined)
 *   - `EDGE-PARTIAL`       — `pricing.bid` set, `pricing.ask` undefined
 *   - `EDGE-INVERTED`      — `pricing.bid > pricing.ask` (cross-rule)
 *   - `EDGE-ZERO-ASK`      — `pricing.ask == 0` (calc col / 0 guard)
 *   - `EDGE-NULL-RATINGS`  — `ratings: null`
 */

export interface NestedOrder {
  id: string;
  security: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  notional: number;
  pricing?: {
    bid?: number;
    ask?: number;
    mid?: number;
    last?: number;
  } | null;
  ratings?: {
    sp?: string;
    moodys?: string;
    fitch?: string;
  } | null;
  risk: {
    dv01: number;
    duration: number;
    convexity: number;
  };
  issuer: {
    name: string;
    sector: string;
    country: string;
  };
}

const SP = ['AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-', 'BBB+', 'BBB', 'BBB-', 'BB+', 'BB'];
const MOODYS = ['Aaa', 'Aa1', 'Aa2', 'Aa3', 'A1', 'A2', 'A3', 'Baa1', 'Baa2', 'Baa3', 'Ba1', 'Ba2'];
const FITCH = SP;
const SECTORS = ['Financials', 'Energy', 'Tech', 'Healthcare', 'Utilities', 'Industrials'];
const COUNTRIES = ['US', 'GB', 'DE', 'FR', 'JP', 'CA'];
const ISSUERS = ['ACME Corp', 'Globex Bank', 'Initech', 'Umbrella PLC', 'Stark Industries', 'Wayne Enterprises'];

function pick<T>(arr: T[], idx: number): T { return arr[idx % arr.length]; }
function rand(seed: number, min: number, max: number): number {
  // Mulberry32 — deterministic so e2e assertions are stable.
  let t = (seed * 0x9E3779B9) >>> 0;
  t = (t ^ (t >>> 15)) >>> 0;
  t = Math.imul(t, 0x85ebca6b) >>> 0;
  t = (t ^ (t >>> 13)) >>> 0;
  t = Math.imul(t, 0xc2b2ae35) >>> 0;
  t = (t ^ (t >>> 16)) >>> 0;
  return min + (t / 0xFFFFFFFF) * (max - min);
}

function generateRow(i: number, seedBase: number): NestedOrder {
  const seed = seedBase + i;
  const bid = Math.round(rand(seed, 95, 105) * 100) / 100;
  const ask = Math.round((bid + rand(seed + 1, 0.05, 0.4)) * 100) / 100;
  const mid = Math.round(((bid + ask) / 2) * 100) / 100;
  const last = Math.round(rand(seed + 2, bid, ask) * 100) / 100;
  const quantity = Math.round(rand(seed + 3, 1000, 50000) / 100) * 100;
  return {
    id: `N-${String(i + 1).padStart(5, '0')}`,
    security: `BOND-${i + 1}`,
    side: i % 2 === 0 ? 'BUY' : 'SELL',
    quantity,
    notional: Math.round(quantity * mid * 10) / 10,
    pricing: { bid, ask, mid, last },
    ratings: {
      sp: pick(SP, i),
      moodys: pick(MOODYS, i),
      fitch: pick(FITCH, i + 3),
    },
    risk: {
      dv01: Math.round(rand(seed + 5, 5, 250) * 100) / 100,
      duration: Math.round(rand(seed + 6, 0.5, 12) * 100) / 100,
      convexity: Math.round(rand(seed + 7, 0.05, 1.8) * 1000) / 1000,
    },
    issuer: {
      name: pick(ISSUERS, i),
      sector: pick(SECTORS, i),
      country: pick(COUNTRIES, i),
    },
  };
}

/**
 * Generate `count` nested-field rows. The first 6 rows are deterministic
 * edge cases (see file header); rows 7+ are the regular distribution.
 *
 * Edge-case row ids are stable across runs so e2e specs can target them.
 */
export function generateNestedOrders(count: number = 100): NestedOrder[] {
  const rows: NestedOrder[] = [];

  // Edge-case rows — explicit, deterministic shapes.
  const base = generateRow(0, 1);
  rows.push(
    { ...generateRow(0, 1), id: 'EDGE-NULL-PRICING', pricing: null },
    { ...generateRow(1, 1), id: 'EDGE-MISS-PRICING', pricing: undefined },
    { ...generateRow(2, 1), id: 'EDGE-PARTIAL', pricing: { bid: 99.5 } },
    { ...generateRow(3, 1), id: 'EDGE-INVERTED', pricing: { bid: 101.25, ask: 100.75, mid: 101.0, last: 101.0 } },
    {
      ...generateRow(4, 1),
      id: 'EDGE-ZERO-ASK',
      pricing: { bid: 99.0, ask: 0, mid: 49.5, last: 99.0 },
    },
    { ...generateRow(5, 1), id: 'EDGE-NULL-RATINGS', ratings: null },
  );
  void base;

  // Regular rows — start at index 6, seeded so the bulk gives us a mix
  // of values across the rule thresholds (some bid > 100, some < 100,
  // some risk.dv01 > 100, etc.).
  for (let i = 6; i < count; i++) {
    rows.push(generateRow(i, 100));
  }
  return rows;
}

import type { ColDef } from 'ag-grid-community';

/**
 * Column defs covering every nested path the fixtures and specs assert
 * against. AG-Grid's `field: 'a.b'` triggers automatic dot-walk; we
 * also set `colId` explicitly so the conditional-styling / column-
 * customization keys match what specs target.
 *
 * Returned as `ColDef[]` (no generic) — AG-Grid's strongly-typed
 * `ColDef<NestedOrder>['field']` rejects arbitrary dot-notation paths
 * because TypeScript can't enumerate every nested path; the runtime
 * accepts them fine. Loosening the generic here keeps the data file
 * declarative without sprinkling `as` casts.
 */
export function nestedColumnDefs(): ColDef[] {
  return [
    { colId: 'id', field: 'id', headerName: 'ID', initialWidth: 140, pinned: 'left' as const },
    { colId: 'security', field: 'security', headerName: 'Security', initialWidth: 120 },
    { colId: 'side', field: 'side', headerName: 'Side', initialWidth: 70 },
    { colId: 'quantity', field: 'quantity', headerName: 'Qty', initialWidth: 90 },
    { colId: 'notional', field: 'notional', headerName: 'Notional', initialWidth: 120 },

    // Nested — pricing.*
    { colId: 'pricing.bid', field: 'pricing.bid', headerName: 'Bid', initialWidth: 90 },
    { colId: 'pricing.ask', field: 'pricing.ask', headerName: 'Ask', initialWidth: 90 },
    { colId: 'pricing.mid', field: 'pricing.mid', headerName: 'Mid', initialWidth: 90 },
    { colId: 'pricing.last', field: 'pricing.last', headerName: 'Last', initialWidth: 90 },

    // Nested — ratings.*
    { colId: 'ratings.sp', field: 'ratings.sp', headerName: 'S&P', initialWidth: 80 },
    { colId: 'ratings.moodys', field: 'ratings.moodys', headerName: "Moody's", initialWidth: 80 },
    { colId: 'ratings.fitch', field: 'ratings.fitch', headerName: 'Fitch', initialWidth: 80 },

    // Nested — risk.*
    { colId: 'risk.dv01', field: 'risk.dv01', headerName: 'DV01', initialWidth: 90 },
    { colId: 'risk.duration', field: 'risk.duration', headerName: 'Duration', initialWidth: 90 },
    { colId: 'risk.convexity', field: 'risk.convexity', headerName: 'Convexity', initialWidth: 100 },

    // Nested — issuer.*
    { colId: 'issuer.name', field: 'issuer.name', headerName: 'Issuer', initialWidth: 140 },
    { colId: 'issuer.sector', field: 'issuer.sector', headerName: 'Sector', initialWidth: 110 },
    { colId: 'issuer.country', field: 'issuer.country', headerName: 'Country', initialWidth: 80 },
  ];
}
