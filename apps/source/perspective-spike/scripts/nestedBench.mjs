/**
 * Nested-feed flattening gate (plan §5b): does a text-level, column-driven
 * flattener keep a WIDE NESTED feed inside the same per-row budget the hub
 * already pays for a FLAT feed?
 *
 * Runs in Node (same V8 as the SharedWorker) against the built package:
 *   npm run build            # from the repo root, once (packages/data dist)
 *   node source/perspective-spike/scripts/nestedBench.mjs [rows] [repeats]
 *
 * Corpora (deterministic LCG):
 *   nested  — 18 flat fields + risk{10} + rating{3,internal{2}} + legs[2]{6,schedule{3}}
 *             + tenorBuckets[10] + meta{3,tags[3],audit{3}} + greeks{8} + limits{var{2},stress{2}}
 *   flat    — the same 40 requested values as top-level keys (the control)
 *   ticks   — sparse nested updates (positionId + 4 nested values), 1000/batch
 *
 * Measured per corpus, median of `repeats` runs:
 *   JSON.parse            the cost the hub pays today (row objects)
 *   parse + flattenRow    object-level flatten (what we must NOT do at 20k/s)
 *   flattenJsonText       the text-level candidate (no row objects)
 */
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '../../../../packages/data/host-data/dist/runtime/providers/jsonFlatten.js');
const { compileFlattenPlan, flattenJsonText, flattenRow } = await import(`file://${dist.replace(/\\/g, '/')}`);

const ROWS = Number(process.argv[2] ?? 20_000);
const REPEATS = Number(process.argv[3] ?? 7);

let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const DESKS = ['IG Credit', 'HY Credit', 'Govies', 'EM', 'Rates'];
const RATINGS = ['Aaa', 'Aa1', 'A2', 'Baa1', 'Ba3', 'B1'];

function nestedRow(i) {
  const px = 90 + rnd() * 20;
  const leg = (n) => ({
    legId: `L${i}-${n}`,
    notional: Math.round(rnd() * 5e7),
    rate: rnd() * 0.08,
    ccy: n ? 'EUR' : 'USD',
    payRecv: n ? 'PAY' : 'RECV',
    dayCount: 'ACT/360',
    schedule: { start: '2026-01-15', end: `${2028 + (i % 15)}-01-15`, freq: n ? '6M' : '3M' },
  });
  return {
    positionId: `POS-${i.toString(16).padStart(8, '0')}`,
    cusip: `CUS${(i % 9000).toString().padStart(6, '0')}`,
    ticker: `TICK${i % 5000}`,
    instrumentName: `Corp ${2028 + (i % 15)} ${(rnd() * 8).toFixed(3)}%`,
    instrumentType: i % 3 === 0 ? 'CD' : 'IG',
    bookName: `BOOK00${i % 5}`,
    portfolio: `PORT${1000 + (i % 400)}`,
    trader: `Trader ${i % 40}`,
    desk: DESKS[i % DESKS.length],
    region: i % 2 ? 'EMEA' : 'AMER',
    country: i % 2 ? 'GB' : 'US',
    asOfDate: '2026-08-30',
    notionalAmount: Math.round(rnd() * 5e7),
    marketValue: Math.round(rnd() * 5e7),
    currentPrice: px,
    averagePrice: px - rnd(),
    pnl: (rnd() - 0.5) * 1e6,
    dailyPnl: (rnd() - 0.5) * 1e5,
    risk: {
      dv01: rnd() * 1e4, cs01: rnd() * 1e4, gamma: rnd() * 100, vega: rnd() * 100, theta: -rnd() * 50,
      rho: rnd() * 10, convexity: rnd() * 5, duration: rnd() * 12, spreadDur: rnd() * 10, ir01: rnd() * 1e3,
    },
    rating: {
      moody: RATINGS[i % RATINGS.length], sp: RATINGS[(i + 1) % RATINGS.length], fitch: RATINGS[(i + 2) % RATINGS.length],
      internal: { grade: `G${i % 9}`, outlook: i % 3 ? 'STABLE' : 'NEG' },
    },
    legs: [leg(0), leg(1)],
    tenorBuckets: Array.from({ length: 10 }, () => Math.round(rnd() * 1e5)),
    meta: {
      source: 'corp-feed', updatedAt: '2026-08-30T09:00:00Z', tags: ['live', 'eod', 'x'],
      audit: { createdBy: 'svc', createdAt: '2026-01-01T00:00:00Z', version: i % 100 },
    },
    greeks: { delta: rnd(), gamma: rnd(), vega: rnd(), theta: rnd(), rho: rnd(), vanna: rnd(), volga: rnd(), charm: rnd() },
    limits: { var: { d1: rnd() * 1e6, d10: rnd() * 3e6 }, stress: { up: rnd() * 1e6, down: -rnd() * 1e6 } },
  };
}

const COLUMNS = [
  'positionId', 'cusip', 'ticker', 'instrumentName', 'instrumentType', 'bookName', 'portfolio', 'trader', 'desk',
  'region', 'country', 'asOfDate', 'notionalAmount', 'marketValue', 'currentPrice', 'averagePrice', 'pnl', 'dailyPnl',
  'risk.dv01', 'risk.cs01', 'risk.gamma', 'rating.moody', 'rating.sp', 'rating.internal.grade',
  'legs[0].rate', 'legs[0].notional', 'legs[0].schedule.end', 'legs[1].rate', 'legs[1].notional', 'legs[1].schedule.end',
  'tenorBuckets[0]', 'tenorBuckets[3]', 'tenorBuckets[9]', 'meta.source', 'meta.audit.version',
  'greeks.delta', 'greeks.vega', 'limits.var.d10', 'limits.stress.down',
];

function tickRow(i) {
  return {
    positionId: `POS-${i.toString(16).padStart(8, '0')}`,
    pnl: (rnd() - 0.5) * 1e6,
    risk: { dv01: rnd() * 1e4 },
    legs: [{ rate: rnd() * 0.08 }, { rate: rnd() * 0.08 }],
    greeks: { delta: rnd() },
  };
}

const plan = compileFlattenPlan(COLUMNS);
const nestedRows = Array.from({ length: ROWS }, (_, i) => nestedRow(i));
const flatRows = nestedRows.map((r) => flattenRow(r, plan));
const nestedText = JSON.stringify(nestedRows);
const flatText = JSON.stringify(flatRows);
const tickBatches = Array.from({ length: 20 }, (_, b) =>
  JSON.stringify(Array.from({ length: 1000 }, (_, i) => tickRow((b * 1000 + i) % ROWS))));

// Correctness cross-check before timing anything (key order differs by
// design — text path emits in document order, object path in plan order).
{
  const canon = (o) => JSON.stringify(Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1))));
  const viaText = JSON.parse(flattenJsonText(nestedText, plan));
  for (let i = 0; i < ROWS; i += 997) {
    const a = canon(viaText[i]);
    const b = canon(flatRows[i]);
    if (a !== b) throw new Error(`text/object flatten mismatch at row ${i}:\n${a}\n${b}`);
  }
}

function median(xs) { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; }
function time(label, rows, bytes, fn) {
  const samples = [];
  let sink = 0;
  for (let r = 0; r < REPEATS; r++) {
    const t0 = performance.now();
    sink += fn();
    samples.push(performance.now() - t0);
  }
  const ms = median(samples);
  const usPerRow = (ms * 1000) / rows;
  const mbps = bytes / 1048576 / (ms / 1000);
  const shareAt20k = (usPerRow * 20_000) / 1e6;
  console.log(
    `${label.padEnd(34)} ${ms.toFixed(1).padStart(7)} ms  ${usPerRow.toFixed(2).padStart(6)} µs/row  ${mbps.toFixed(0).padStart(5)} MB/s  ` +
    `core@20k/s ${(shareAt20k * 100).toFixed(0).padStart(3)}%${sink === -1 ? '' : ''}`,
  );
  return { ms, usPerRow, mbps, shareAt20k };
}

const mb = (s) => `${(Buffer.byteLength(s) / 1048576).toFixed(1)} MB`;
console.log(`rows ${ROWS}  nested ${mb(nestedText)} (${(Buffer.byteLength(nestedText) / ROWS).toFixed(0)} B/row)  ` +
  `flat ${mb(flatText)} (${(Buffer.byteLength(flatText) / ROWS).toFixed(0)} B/row)  columns ${COLUMNS.length}  repeats ${REPEATS}\n`);

console.log('— snapshot, FLAT corpus (control: what the hub pays today for a flat feed)');
const flatParse = time('JSON.parse(flat)', ROWS, Buffer.byteLength(flatText), () => JSON.parse(flatText).length);
time('flattenJsonText(flat) [pass-through]', ROWS, Buffer.byteLength(flatText), () => flattenJsonText(flatText, plan).length);

console.log('\n— snapshot, NESTED corpus');
const nestedParse = time('JSON.parse(nested)', ROWS, Buffer.byteLength(nestedText), () => JSON.parse(nestedText).length);
time('JSON.parse + flattenRow (objects)', ROWS, Buffer.byteLength(nestedText), () => {
  const rows = JSON.parse(nestedText);
  let n = 0;
  for (const r of rows) n += Object.keys(flattenRow(r, plan)).length;
  return n;
});
time('  ↳ + JSON.stringify (engine-ready text)', ROWS, Buffer.byteLength(nestedText), () => {
  const rows = JSON.parse(nestedText);
  const flat = new Array(rows.length);
  for (let i = 0; i < rows.length; i++) flat[i] = flattenRow(rows[i], plan);
  return JSON.stringify(flat).length;
});
const nestedText2Flat = time('flattenJsonText(nested) [candidate]', ROWS, Buffer.byteLength(nestedText), () => flattenJsonText(nestedText, plan).length);
// Cost decomposition: pure skip (no columns) and key-match-only (one column).
const emptyPlan = compileFlattenPlan([]);
const keyOnlyPlan = compileFlattenPlan(['positionId']);
time('  ↳ skip everything (no columns)', ROWS, Buffer.byteLength(nestedText), () => flattenJsonText(nestedText, emptyPlan).length);
time('  ↳ match root keys only (1 column)', ROWS, Buffer.byteLength(nestedText), () => flattenJsonText(nestedText, keyOnlyPlan).length);
const outBytes = Buffer.byteLength(flattenJsonText(nestedText, plan));
console.log(`  output ${mb(flattenJsonText(nestedText, plan))} = ${(100 * outBytes / Buffer.byteLength(nestedText)).toFixed(0)}% of input; ` +
  `JSON.parse(output) would cost ~${flatParse.usPerRow.toFixed(2)} µs/row more if a JS consumer needs objects`);

console.log('\n— sparse nested ticks (1000-row batches, the streaming shape)');
const tickRows = 20 * 1000;
const tickBytes = tickBatches.reduce((n, t) => n + Buffer.byteLength(t), 0);
time('JSON.parse(ticks)', tickRows, tickBytes, () => tickBatches.reduce((n, t) => n + JSON.parse(t).length, 0));
time('parse + flattenRow + stringify (ticks)', tickRows, tickBytes, () =>
  tickBatches.reduce((n, t) => n + JSON.stringify(JSON.parse(t).map((r) => flattenRow(r, plan))).length, 0));
const tickText = time('flattenJsonText(ticks)', tickRows, tickBytes, () => tickBatches.reduce((n, t) => n + flattenJsonText(t, plan).length, 0));

console.log('\n— verdict');
const ratio = nestedText2Flat.usPerRow / flatParse.usPerRow;
console.log(`flattenJsonText(nested) = ${ratio.toFixed(2)}× the flat-feed JSON.parse budget per row ` +
  `(${nestedText2Flat.usPerRow.toFixed(2)} vs ${flatParse.usPerRow.toFixed(2)} µs/row); ` +
  `vs JSON.parse(nested) ${(nestedParse.usPerRow / nestedText2Flat.usPerRow).toFixed(2)}× faster`);
console.log(`streaming ticks: flattenJsonText = ${(tickText.shareAt20k * 100).toFixed(0)}% of a core at 20k ticks/s`);
console.log(ratio <= 1.0
  ? 'GATE PASS — text-level flattening of the wide nested feed is inside the flat-feed budget; no WASM tier needed for this shape.'
  : ratio <= 1.5
    ? 'GATE MARGINAL — within 1.5× of the flat budget; acceptable at 20k/s on a dedicated core, revisit if feeds are mostly-nested.'
    : 'GATE FAIL (full-row shape) — JS text-level flattening cannot beat native JSON.parse; wide full-row nested feeds at 20k rows/s need flat-at-source or the arrow-json WASM tier. Check the ticks line for the streaming shape.');
