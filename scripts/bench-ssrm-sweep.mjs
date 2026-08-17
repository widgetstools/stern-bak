#!/usr/bin/env node
/**
 * SSRM plane scale sweep — how does the query plane behave as the dataset
 * grows, and where (if anywhere) does it stop being good enough?
 *
 * This exists to answer one question with numbers before anyone commits to
 * rewriting the plane in another language: every defect the SSRM parity effort
 * found was WIRING, never speed, so the case for a Rust/WASM engine rests
 * entirely on scale — and nobody had measured it.
 *
 * Runs `bench-ssrm.mjs` once per dataset size, each in its OWN process,
 * because heap figures are only meaningful against a fresh heap. Reports the
 * absolute value at each size plus the growth factor against the smallest,
 * so superlinear behaviour is visible rather than inferred: a cost that scales
 * with the data shows ~10x from 100k to 1M, and anything materially worse is
 * the cliff this sweep is looking for.
 *
 *   npm run bench:ssrm:sweep
 *   SWEEP_ROWS=100000,500000 SWEEP_COLS=60 npm run bench:ssrm:sweep
 *
 * A size that cannot complete (out of memory, or simply too slow) is itself an
 * answer and is reported as such rather than aborting the run.
 *
 * Requires `npm run build:packages` first — it measures built output.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const bench = path.join(here, 'bench-ssrm.mjs');

const SIZES = (process.env.SWEEP_ROWS ?? '100000,250000,500000,1000000')
  .split(',')
  .map((n) => Number(n.trim()))
  .filter(Boolean);

// Narrower than bench-ssrm.mjs's own 130-column default: this sweep varies
// ROWS, and 130 columns x 1M rows is a fixture no browser tab would hold, so
// it would measure the generator's limits rather than the plane's. 40 is a
// wide-but-real blotter. The 130-column baseline is still what a bare
// `npm run bench:ssrm` reports, which is what the roadmap's figures compare to.
const COLS = Number(process.env.SWEEP_COLS ?? 40);
const HEAP_MB = Number(process.env.SWEEP_HEAP_MB ?? 12288);

/** The measurements that bear on "is this fast/small enough at scale". */
const TRACKED = [
  ['Ingest / replaceSnapshot', 'ingest'],
  ['Ingest / plane heap', 'store memory'],
  ['Blocks (cold = first block of a query, warm = later blocks) / sorted block, cold', 'sort'],
  ['Blocks (cold = first block of a query, warm = later blocks) / filtered + sorted, cold', 'filter+sort'],
  ['Blocks (cold = first block of a query, warm = later blocks) / grouped by book, cold', 'group'],
  ['Quick filter (CSRM-parity substring search over the whole store) / quick filter, all fields, cold', 'quick filter'],
  ['Calculated columns (expression enrichment on returned blocks) / aggregate, cold (one store pass)', 'full-store fold'],
  ['Set-filter domain (full-store distinct scan, no block window) / high cardinality (997 distinct)', 'distinct scan'],
  ['Scrolling one query (what a user actually does) / 20 sorted blocks, one tick at the start', '20-block scroll'],
  ['Live ticks / upsert 2000-row tick', '2000-row tick'],
  ['summary / total heap', 'total heap'],
];

function runOne(rows) {
  const started = Date.now();
  const res = spawnSync(
    process.execPath,
    ['--expose-gc', `--max-old-space-size=${HEAP_MB}`, bench],
    {
      encoding: 'utf8',
      env: { ...process.env, ROWS: String(rows), COLS: String(COLS), BENCH_JSON: '1' },
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const wall = ((Date.now() - started) / 1000).toFixed(0);

  const line = (res.stdout ?? '')
    .split('\n')
    .find((l) => l.startsWith('__BENCH_JSON__'));

  if (!line) {
    const why =
      res.status === null ? `killed (${res.signal})`
      : /heap out of memory|Allocation failed/i.test(`${res.stdout}${res.stderr}`) ? 'out of memory'
      : `exit ${res.status}`;
    return { rows, failed: why, wall };
  }
  return { rows, wall, ...JSON.parse(line.slice('__BENCH_JSON__'.length)) };
}

console.log(
  `\nSSRM plane scale sweep — ${COLS} cols, sizes ${SIZES.join(', ')}\n`
    + `Each size runs in a fresh process (heap isolation). This takes a while.\n`,
);

const runs = [];
for (const rows of SIZES) {
  process.stdout.write(`  ${rows.toLocaleString()} rows … `);
  const r = runOne(rows);
  runs.push(r);
  console.log(r.failed ? `FAILED — ${r.failed} (${r.wall}s)` : `ok (${r.wall}s)`);
}

const ok = runs.filter((r) => !r.failed);
if (ok.length === 0) {
  console.log('\nNo size completed. Nothing to compare.\n');
  process.exit(1);
}

const base = ok[0];
const num = (r, key) => {
  const m = r.results?.[key];
  return m && typeof m.value === 'number' ? m.value : null;
};

const W = 18;
const head = ['metric'.padEnd(W), ...ok.map((r) => `${(r.rows / 1000)}k`.padStart(11))].join('');
console.log(`\n${head}`);
console.log('-'.repeat(head.length));

for (const [key, label] of TRACKED) {
  const cells = ok.map((r) => {
    const v = num(r, key);
    if (v === null) return '—'.padStart(11);
    return (v >= 1000 ? v.toFixed(0) : v.toFixed(1)).padStart(11);
  });
  console.log(label.padEnd(W) + cells.join(''));
}

// Growth relative to the smallest size that ran. Linear scaling from 100k to
// 1M is 10x; the interesting number is anything well above the row ratio.
if (ok.length > 1) {
  const last = ok[ok.length - 1];
  const ratio = last.rows / base.rows;
  console.log(
    `\nGrowth from ${(base.rows / 1000)}k to ${(last.rows / 1000)}k `
      + `(rows grew ${ratio.toFixed(0)}x — anything much above that is superlinear)\n`,
  );
  console.log(`${'metric'.padEnd(W)}${'factor'.padStart(11)}`);
  console.log('-'.repeat(W + 11));
  for (const [key, label] of TRACKED) {
    const a = num(base, key);
    const b = num(last, key);
    if (a === null || b === null || a === 0) continue;
    const f = b / a;
    const flag = f > ratio * 1.5 ? '  ← superlinear' : '';
    console.log(`${label.padEnd(W)}${`${f.toFixed(1)}x`.padStart(11)}${flag}`);
  }
}

const failed = runs.filter((r) => r.failed);
if (failed.length > 0) {
  console.log(
    `\nDid not complete: ${failed.map((f) => `${(f.rows / 1000)}k (${f.failed})`).join(', ')}`,
  );
  console.log('That ceiling is the answer to "how far does this go".');
}
console.log('');
