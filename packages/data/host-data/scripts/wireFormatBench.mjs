/**
 * One-off benchmark: JSON vs columnar wire formats + thin-delta wire size.
 * Run: node packages/data/host-data/scripts/wireFormatBench.mjs
 */
import { performance } from 'node:perf_hooks';
import { tryEncodeColumnar, decodeColumnar } from '../dist/runtime/wire/columnarCodec.js';
import { diffTopLevel } from '../dist/runtime/wire/rowDiff.js';

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder();

function jsonEncode(rows) {
  return ENCODER.encode(JSON.stringify(rows));
}

function jsonDecode(buf) {
  return JSON.parse(DECODER.decode(buf));
}

function bench(name, fn, iterations = 200) {
  // Warmup
  for (let i = 0; i < 10; i++) fn();
  const t0 = performance.now();
  let last;
  for (let i = 0; i < iterations; i++) last = fn();
  const ms = performance.now() - t0;
  return { name, ms, perOpUs: (ms / iterations) * 1000, last };
}

/** Slim blotter row (~40 top-level primitives) — ROW_PROFILE=slim shape. */
function makeSlimRow(i) {
  return {
    positionId: `POS-${i}`,
    cusip: `912828${String(i % 1000).padStart(3, '0')}`,
    marketValue: 1_000_000 + i * 137.5,
    currentPrice: 98.5 + (i % 100) * 0.01,
    pnl: (i % 50) * 42.3 - 1000,
    yield: 4.2 + (i % 20) * 0.05,
    spread: 120 + (i % 30),
    pv01: 4500 + i * 0.7,
    dv01: 3200 + i * 0.5,
    quantity: 10000 + i * 10,
    notional: 5_000_000 + i * 500,
    duration: 4.5 + (i % 10) * 0.1,
    convexity: 0.12 + (i % 5) * 0.01,
    beta: 0.95 + (i % 7) * 0.02,
    live: i % 2 === 0,
    side: i % 2 === 0 ? 'B' : 'S',
    desk: `Desk-${i % 8}`,
    book: `Book-${i % 12}`,
    trader: `T${i % 50}`,
    sector: `SEC-${i % 15}`,
    currency: 'USD',
    country: 'US',
    rating: 'A',
    maturity: '2030-06-15',
    coupon: 3.5,
    accrued: 12.4,
    factor: 1.0,
    priceDate: '2026-06-12',
    asOfDate: '2026-06-12',
    source: 'STOMP',
    venue: 'NYSE',
    liquidity: 0.85,
    var99: 125000 + i,
    stressPnl: -5000 + i * 2,
    dayPnl: 1200 + i,
    mtdPnl: 45000 + i * 3,
    ytdPnl: 120000 + i * 5,
    costBasis: 990000 + i,
    unrealizedPnl: 10000 + i,
    realizedPnl: 500 + i,
    haircut: 0.02,
    margin: 50000 + i,
    exposure: 1_100_000 + i * 10,
    limit: 2_000_000,
    utilization: 0.55,
    status: 'Open',
    lastUpdate: Date.now(),
  };
}

/** Projected row (~200 top-level primitives) — projectFields on wide feed. */
function makeProjectedRow(i) {
  const row = makeSlimRow(i);
  for (let f = 0; f < 160; f++) {
    row[`field${f}`] = f % 3 === 0 ? i * 1.1 + f : f % 3 === 1 ? `v${i}_${f}` : f % 2 === 0;
  }
  return row;
}

/** Wide row with nested objects — ROW_PROFILE=wide shape (columnar demotes nested to json cols). */
function makeWideRow(i) {
  const slim = makeSlimRow(i);
  return {
    ...slim,
    risk: { var99: 125000, es: 98000, beta: 0.95, duration: 4.5 },
    analytics: { pv01: 4500, dv01: 3200, convexity: 0.12 },
    compliance: { limit: 2e6, utilization: 0.55, breached: false },
    attributes: Object.fromEntries(
      Array.from({ length: 50 }, (_, j) => [`attr${j}`, j % 3 === 0 ? i + j : `x${j}`]),
    ),
    tags: ['fi', 'govt', `bucket-${i % 5}`],
  };
}

/** Sparse touch: same row, 5 fields changed (stomp-view-server sparse live mode). */
function sparseTouch(row) {
  return {
    ...row,
    currentPrice: row.currentPrice + 0.01,
    marketValue: row.marketValue + 137,
    pnl: row.pnl + 42,
    yield: row.yield + 0.001,
    lastUpdate: Date.now(),
  };
}

function measureFrame(label, rows, iterations = 150) {
  const jsonBuf = jsonEncode(rows);
  const colBuf = tryEncodeColumnar(rows);

  const jsonEnc = bench(`${label} JSON encode`, () => jsonEncode(rows), iterations);
  const jsonDec = bench(`${label} JSON decode`, () => jsonDecode(jsonBuf), iterations);

  const results = {
    label,
    rowCount: rows.length,
    fieldCount: Object.keys(rows[0] ?? {}).length,
    jsonBytes: jsonBuf.byteLength,
    colBytes: colBuf?.byteLength ?? null,
    colFallback: colBuf === null,
    jsonEncodeUs: jsonEnc.perOpUs,
    jsonDecodeUs: jsonDec.perOpUs,
    colEncodeUs: null,
    colDecodeUs: null,
    decodeSpeedup: null,
    sizeRatio: null,
  };

  if (colBuf) {
    const colEnc = bench(`${label} COL encode`, () => tryEncodeColumnar(rows), iterations);
    const colDec = bench(`${label} COL decode`, () => decodeColumnar(colBuf), iterations);
    results.colEncodeUs = colEnc.perOpUs;
    results.colDecodeUs = colDec.perOpUs;
    results.decodeSpeedup = jsonDec.perOpUs / colDec.perOpUs;
    results.sizeRatio = jsonBuf.byteLength / colBuf.byteLength;
  }

  return results;
}

function measureThinDelta(rows, prevRows) {
  const patches = [];
  for (let i = 0; i < rows.length; i++) {
    const k = String(rows[i].positionId);
    const diff = diffTopLevel(prevRows[i], rows[i]);
    if (diff === 'identical') continue;
    if (diff === 'opaque') patches.push({ k, f: rows[i] });
    else patches.push({ k, ...diff });
  }
  const fullWire = jsonEncode(rows).byteLength;
  const patchWire = jsonEncode(patches).byteLength;
  return {
    rowCount: rows.length,
    patchCount: patches.length,
    fullWireBytes: fullWire,
    patchWireBytes: patchWire,
    shrinkRatio: fullWire / patchWire,
  };
}

// Build host-data dist if needed — caller should run build first
const scenarios = [
  { label: 'Live tick (100 rows, slim)', rows: Array.from({ length: 100 }, (_, i) => makeSlimRow(i)) },
  { label: 'Live tick (100 rows, projected 200f)', rows: Array.from({ length: 100 }, (_, i) => makeProjectedRow(i)) },
  { label: 'Snapshot chunk (500 rows, slim)', rows: Array.from({ length: 500 }, (_, i) => makeSlimRow(i)) },
  { label: 'Snapshot chunk (500 rows, projected)', rows: Array.from({ length: 500 }, (_, i) => makeProjectedRow(i)) },
  { label: 'Snapshot chunk (500 rows, wide nested)', rows: Array.from({ length: 500 }, (_, i) => makeWideRow(i)) },
  { label: 'Stress sweep (2200 rows, slim)', rows: Array.from({ length: 2200 }, (_, i) => makeSlimRow(i)) },
];

const frameResults = scenarios.map((s) => measureFrame(s.label, s.rows));

const slim100 = Array.from({ length: 100 }, (_, i) => makeSlimRow(i));
const slim100Touched = slim100.map(sparseTouch);
const proj100 = Array.from({ length: 100 }, (_, i) => makeProjectedRow(i));
const proj100Touched = proj100.map(sparseTouch);

const thinResults = [
  { label: 'Sparse touch (100 slim rows, ~5 fields)', ...measureThinDelta(slim100Touched, slim100) },
  { label: 'Sparse touch (100 projected rows, ~5 fields)', ...measureThinDelta(proj100Touched, proj100) },
];

console.log(JSON.stringify({ frameResults, thinResults }, null, 2));
