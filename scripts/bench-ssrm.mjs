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
try {
  ({ RowStore, QueryEngine } = await import(dist));
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

console.log(`\n  total heap ${heapMB().toFixed(0)} MB\n`);
