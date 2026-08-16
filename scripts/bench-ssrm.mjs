#!/usr/bin/env node
/**
 * SSRM query-plane benchmark.
 *
 * Exists because two design decisions in this engine are only defensible with
 * numbers, and both were regressions waiting to happen:
 *
 *  1. `RowStore` used to maintain a `column -> value -> Set<key>` inverted
 *     index on every ingested row. Nothing read it. At 100k x 130 it cost
 *     ~1.7 GB of heap and dominated both snapshot load and every live tick.
 *  2. `QueryEngine` used to re-scan and re-sort the whole filtered set for
 *     every 100-row block. Scrolling one query paid that cost per block.
 *
 * Run it after touching `RowStore` / `QueryEngine`:
 *
 *   npm run bench:ssrm                  # default 100k rows x 130 cols
 *   ROWS=250000 COLS=60 npm run bench:ssrm
 *
 * Requires `npm run build:packages` first — it measures the built output.
 * Heap figures need `--expose-gc` (the npm script passes it).
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(
  here,
  '..',
  'packages/data/host-data/dist/runtime/ssrm/index.js',
);

let RowStore;
let QueryEngine;
let SsrmServer;
try {
  ({ RowStore, QueryEngine, SsrmServer } = await import(dist));
} catch {
  console.error(
    `\nCannot load ${path.relative(process.cwd(), dist)}\n` +
      `Run "npm run build:packages" first — this benchmark measures built output.\n`,
  );
  process.exit(1);
}

const ROWS = Number(process.env.ROWS ?? 100_000);
const COLS = Number(process.env.COLS ?? 130);
const BLOCK = Number(process.env.BLOCK ?? 100);

const numericCols = [];
const stringCols = [];
for (let c = 0; c < COLS; c++) {
  if (c % 3 === 0) stringCols.push(`s${c}`);
  else numericCols.push(`n${c}`);
}

const heapMB = () => {
  if (global.gc) global.gc();
  return process.memoryUsage().heapUsed / 1024 / 1024;
};

function makeRows() {
  const books = ['ALPHA', 'BETA', 'GAMMA', 'DELTA', 'EPSILON'];
  const out = [];
  for (let i = 0; i < ROWS; i++) {
    const row = { id: `POS-${i}` };
    for (const c of numericCols) row[c] = ((i * 7919) % 100_000) / 100;
    for (const c of stringCols) row[c] = `${books[i % books.length]}-${i % 997}`;
    row.book = books[i % books.length];
    out.push(row);
  }
  return out;
}

const row = (label, value, unit) =>
  console.log(`  ${label.padEnd(46)} ${String(value).padStart(7)} ${unit}`);

function time(label, fn, runs = 1) {
  fn();
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) fn();
  const ms = (performance.now() - t0) / runs;
  row(label, ms.toFixed(1), 'ms');
  return ms;
}

console.log(`\nSSRM plane benchmark — ${ROWS} rows x ${COLS} cols, ${BLOCK}-row blocks\n`);

const rows = makeRows();

console.log('Ingest');
const beforeStore = heapMB();
const store = new RowStore({ keyColumn: 'id' });
const t0 = performance.now();
store.replaceSnapshot(rows);
row('replaceSnapshot', (performance.now() - t0).toFixed(0), 'ms');
row('plane heap', (heapMB() - beforeStore).toFixed(0), 'MB');

const engine = new QueryEngine({ store });
const baseReq = {
  startRow: 0,
  endRow: BLOCK,
  filterModel: {},
  sortModel: [],
  groupKeys: [],
  rowGroupCols: [],
  valueCols: [],
  pivotCols: [],
  pivotMode: false,
};
const sortModel = [{ colId: numericCols[0], sort: 'desc' }];
const filterModel = {
  book: { filterType: 'text', type: 'equals', filter: 'ALPHA' },
};

console.log('\nBlocks (cold = first block of a query, warm = later blocks)');
// Each cold measurement mutates the store first so the order cache misses.
const cold = (label, req) =>
  time(label, () => {
    store.upsert([{ id: 'POS-0', [numericCols[0]]: Math.random() }]);
    engine.getRows(req);
  }, 3);

cold('unsorted block, cold', baseReq);
time('unsorted block, warm', () => engine.getRows(baseReq), 20);
cold('sorted block, cold', { ...baseReq, sortModel });
time('sorted block, warm', () => engine.getRows({ ...baseReq, sortModel }), 20);
time(
  'sorted block @50k, warm',
  () => engine.getRows({ ...baseReq, sortModel, startRow: 50_000, endRow: 50_000 + BLOCK }),
  20,
);
cold('filtered + sorted, cold', { ...baseReq, filterModel, sortModel });
time(
  'filtered + sorted, warm',
  () => engine.getRows({ ...baseReq, filterModel, sortModel }),
  20,
);
cold('grouped by book, cold', {
  ...baseReq,
  rowGroupCols: [{ id: 'book', field: 'book' }],
  valueCols: [{ field: numericCols[0], aggFunc: 'sum' }],
});

console.log('\nQuick filter (CSRM-parity substring search over the whole store)');
// The unscoped path is one cached-string lookup per row. The scoped path adds
// a per-row build over the named columns, but ONLY for rows the cached
// (all-fields) string already admitted — the cache is a superset, so a row it
// rejects cannot match a narrower column set either.
const quickReq = { ...baseReq, quickFilterText: 'ALPHA' };
const scopedCols = ['book', ...stringCols.slice(0, 7)];
cold('quick filter, all fields, cold', quickReq);
time('quick filter, all fields, warm', () => engine.getRows(quickReq), 20);
cold('quick filter scoped to 8 columns, cold', {
  ...quickReq,
  quickFilterColumns: scopedCols,
});
cold('quick filter matching nothing, cold', { ...baseReq, quickFilterText: 'zzzznomatch' });

console.log('\nCalculated columns (expression enrichment on returned blocks)');
// A column-wide aggregate is a fold over the DATASET, so the plane materialises
// the store once per revision and memoises the folded column — the block then
// costs the same as a row-local one. What the numbers have to show is that the
// per-revision pass is paid ONCE, not once per block: `aggregate, warm` reuses
// the same revision, `aggregate, cold` ticks first and rebuilds it.
//
// A grid with NO calculated column must pay none of this, which is what the
// `none` line is for — it is the configuration every other section above runs
// under.
const calcReq = { ...baseReq, sortModel };
time('none configured', () => engine.getRows(calcReq), 20);
engine.configureExpressions([
  { id: 'c-local', kind: 'calculated', field: 'calcLocal', expression: `[${numericCols[0]}] * 2` },
]);
time('row-local, warm', () => engine.getRows(calcReq), 20);
engine.configureExpressions([
  { id: 'c-agg', kind: 'calculated', field: 'calcTotal', expression: `SUM([${numericCols[0]}])` },
]);
cold('aggregate, cold (one store pass)', calcReq);
time('aggregate, warm (memoised column)', () => engine.getRows(calcReq), 20);
engine.configureExpressions([]);

console.log('\nScrolling one query (what a user actually does)');
const scroll = (label) => {
  store.upsert([{ id: 'POS-1', [numericCols[0]]: Math.random() }]);
  const t = performance.now();
  for (let b = 0; b < 20; b++) {
    engine.getRows({
      ...baseReq,
      sortModel,
      startRow: b * BLOCK,
      endRow: b * BLOCK + BLOCK,
    });
  }
  row(label, (performance.now() - t).toFixed(0), 'ms');
};
scroll('20 sorted blocks, one tick at the start');

console.log('\nLive ticks');
const tick = (n) => {
  const payload = rows.slice(0, n).map((r) => ({
    ...r,
    [numericCols[0]]: Math.random(),
  }));
  time(`upsert ${n}-row tick`, () => store.upsert(payload), 10);
};
tick(100);
tick(500);
tick(2000);

console.log('\nWindowed publish (25 frames of an 800-row tick: passthrough vs 200ms window)');

/** One-shot `setTimeout` fake, matching `engineContract.test.ts`'s `fakeTimers()`. */
function fakeTimers() {
  const cbs = new Map();
  let id = 0;
  return {
    set: (cb) => (cbs.set(++id, cb), id),
    clear: (h) => void cbs.delete(h),
    fire: () => { const all = [...cbs.values()]; cbs.clear(); all.forEach((f) => f()); },
  };
}

const frame = (i) =>
  rows.slice(0, 800).map((r) => ({ ...r, [numericCols[0]]: i * 1000 + Math.random() }));

// Passthrough: publishWindowMs 0 (default) — one flush per store tick.
const passthrough = new SsrmServer({ keyColumn: 'id', publishWindowMs: 0 });
passthrough.replaceSnapshot(rows.slice(0, 2000));
for (let i = 0; i < 25; i++) passthrough.upsert(frame(i));
const passthroughStats = passthrough.getStats();
const passthroughFlushes = passthroughStats.flushes - 1; // exclude the snapshot flush
const passthroughUpdates = passthroughStats.updatesAccumulated;
const passthroughKeys = passthroughStats.keysFlushed;

// Windowed: publishWindowMs 200 with an injected fake timer — one conflated
// flush for all 25 frames once the trailing-edge window fires.
const t = fakeTimers();
const windowed = new SsrmServer({
  keyColumn: 'id', publishWindowMs: 200, setTimer: t.set, clearTimer: t.clear,
});
windowed.replaceSnapshot(rows.slice(0, 2000));
for (let i = 0; i < 25; i++) windowed.upsert(frame(i));
t.fire();
const windowedStats = windowed.getStats();
const windowedFlushes = windowedStats.flushes - 1; // exclude the snapshot flush
const windowedUpdates = windowedStats.updatesAccumulated;
const windowedKeys = windowedStats.keysFlushed;

row('passthrough (0ms): flushes for 25 frames', passthroughFlushes, 'flushes');
row('passthrough (0ms): updatesAccumulated', passthroughUpdates, 'updates');
row('passthrough (0ms): keysFlushed', passthroughKeys, 'keys');
row('windowed (200ms): flushes for 25 frames', windowedFlushes, 'flushes');
row('windowed (200ms): updatesAccumulated', windowedUpdates, 'updates');
row('windowed (200ms): keysFlushed', windowedKeys, 'keys');
row(
  'conflation ratio (passthrough:windowed flushes)',
  `${(passthroughFlushes / Math.max(1, windowedFlushes)).toFixed(0)}:1`,
  '',
);
row(
  'conflation ratio (updatesAccumulated:keysFlushed, windowed)',
  (windowedUpdates / Math.max(1, windowedKeys)).toFixed(2),
  'x',
);

console.log(`\n  total heap ${heapMB().toFixed(0)} MB\n`);
