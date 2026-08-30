/**
 * Perspective engine spike — Phase 0 of docs/wasm-data-plane-plan.md §5b.
 *
 * Measures, in a real browser against the real WASM engine:
 *   1. snapshot load: N rows as a JSON-rows string → indexed Table
 *   2. sustained ingest: `rate` rows/sec of JSON-string update batches
 *      (pre-generated, so string generation never contaminates timing)
 *   3. row-mode `on_update` Arrow deltas: count, bytes, callback cost
 *   4. snapshot export: `to_arrow()` of the full table; `to_json()` of a
 *      500-row window (window-side materialization proxy)
 *   5. main-thread health during ingest (rAF cadence) — the Client runs
 *      here, so its per-batch cost lands on the page thread.
 *
 * Results land on `window.__spike` for the Playwright runner.
 */
// `/inline` embeds the engine (server) WASM + worker script, so no
// `init_server(fetch(...))` asset plumbing is needed for the spike.
import perspective from '@perspective-dev/client/inline';

declare global {
  interface Window {
    __spike: { phase: string; results: Record<string, unknown> };
  }
}

const params = new URLSearchParams(location.search);
const RATE = Number(params.get('rate') ?? 20_000);
const SECONDS = Number(params.get('seconds') ?? 20);
const ROWS = Number(params.get('rows') ?? 20_000);
const BATCH_MS = 20; // 50 batches/sec, like a 40ms-tick feed conflated ~2:1
const BATCH_ROWS = Math.max(1, Math.round(RATE / (1000 / BATCH_MS)));
const POOL = 64;

const out = document.getElementById('out')!;
const log = (msg: string) => {
  // eslint-disable-next-line no-console
  console.log(`[spike] ${msg}`);
  out.textContent += `\n${msg}`;
};
window.__spike = { phase: 'boot', results: {} };

// ── synthetic positions rows (28 flat fields, like the demo feed) ────
const DESKS = ['IG Credit', 'HY Credit', 'Govies', 'EM', 'Rates'];
const TRADERS = ['Jane Doe', 'John Smith', 'Sarah Williams', 'Lisa Davis', 'Mike Brown'];
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

function row(i: number, tick: number): Record<string, unknown> {
  const px = 90 + rnd() * 20;
  return {
    positionId: `POS-${i.toString(16).padStart(8, '0')}`,
    cusip: `CUS${(i % 9000).toString().padStart(6, '0')}`,
    ticker: `TICK${i % 5000}`,
    instrumentName: `Corp ${2028 + (i % 15)} ${(rnd() * 8).toFixed(3)}%`,
    instrumentType: i % 3 === 0 ? 'CD' : 'IG',
    bookName: `BOOK00${i % 5}`,
    portfolio: `PORT${1000 + (i % 400)}`,
    trader: TRADERS[i % TRADERS.length],
    desk: DESKS[i % DESKS.length],
    region: i % 2 ? 'EMEA' : 'AMER',
    country: i % 2 ? 'GB' : 'US',
    asOfDate: '2026-08-30',
    notionalAmount: Math.round(rnd() * 5e7),
    marketValue: Math.round(rnd() * 5e7),
    currentPrice: px,
    averagePrice: px - rnd(),
    pnl: (rnd() - 0.5) * 1e6 + tick,
    unrealizedPnl: (rnd() - 0.5) * 1e6,
    realizedPnl: (rnd() - 0.5) * 1e5,
    dailyPnl: (rnd() - 0.5) * 1e5,
    mtdPnl: (rnd() - 0.5) * 1e6,
    ytdPnl: (rnd() - 0.5) * 1e7,
    yield: rnd() * 8,
    spread: rnd() * 400,
    dv01: rnd() * 1e4,
    pv01: rnd() * 1e4,
    cs01: rnd() * 1e4,
    ratingMoody: ['Aaa', 'Aa1', 'A2', 'Baa3', 'Ba1'][i % 5],
  };
}

function buildSnapshotJson(n: number): string {
  const rows = new Array(n);
  for (let i = 0; i < n; i++) rows[i] = row(i, 0);
  return JSON.stringify(rows);
}

function buildUpdatePool(n: number, batchRows: number, pool: number): string[] {
  const batches: string[] = [];
  for (let b = 0; b < pool; b++) {
    const rows = new Array(batchRows);
    for (let j = 0; j < batchRows; j++) {
      const i = Math.floor(rnd() * n);
      // Sparse-ish update: key + the volatile numeric fields only, like a
      // real tick; Perspective applies partial-column updates in place.
      rows[j] = {
        positionId: `POS-${i.toString(16).padStart(8, '0')}`,
        currentPrice: 90 + rnd() * 20,
        pnl: (rnd() - 0.5) * 1e6,
        unrealizedPnl: (rnd() - 0.5) * 1e6,
        dailyPnl: (rnd() - 0.5) * 1e5,
        dv01: rnd() * 1e4,
        spread: rnd() * 400,
      };
    }
    batches.push(JSON.stringify(rows));
  }
  return batches;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

async function main(): Promise<void> {
  const results: Record<string, unknown> = { rate: RATE, seconds: SECONDS, rows: ROWS, batchRows: BATCH_ROWS };
  window.__spike.phase = 'loading';
  log(`config rate=${RATE}/s rows=${ROWS} batch=${BATCH_ROWS} rows/${BATCH_MS}ms for ${SECONDS}s`);

  const t0 = performance.now();
  const snapshotJson = buildSnapshotJson(ROWS);
  const updatePool = buildUpdatePool(ROWS, BATCH_ROWS, POOL);
  results.snapshotBytes = snapshotJson.length;
  results.updateBatchBytes = updatePool[0].length;
  log(`generated snapshot ${(snapshotJson.length / 1048576).toFixed(1)}MB + ${POOL} update batches of ${(updatePool[0].length / 1024).toFixed(0)}KB in ${(performance.now() - t0).toFixed(0)}ms`);

  const tWorker = performance.now();
  const client = await perspective.worker();
  results.workerBootMs = Math.round(performance.now() - tWorker);
  log(`engine worker up in ${results.workerBootMs}ms`);

  const tLoad = performance.now();
  const table = await client.table(snapshotJson, { index: 'positionId', format: 'json' });
  results.snapshotLoadMs = Math.round(performance.now() - tLoad);
  results.tableSize = await table.size();
  log(`snapshot loaded: ${results.tableSize} rows in ${results.snapshotLoadMs}ms (JSON string → indexed table)`);

  const view = await table.view();
  let deltaCount = 0;
  let deltaBytes = 0;
  let deltaCbMs = 0;
  await view.on_update(
    (updated: { port_id: number; delta?: ArrayBuffer | Uint8Array | number[] }) => {
      const t = performance.now();
      deltaCount += 1;
      const d = updated.delta as { byteLength?: number; length?: number } | undefined;
      deltaBytes += d?.byteLength ?? d?.length ?? 0;
      deltaCbMs += performance.now() - t;
    },
    { mode: 'row' },
  );

  // ── sustained ingest ───────────────────────────────────────────────
  window.__spike.phase = 'ingest';
  const latencies: number[] = [];
  const frames: number[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let sent = 0;
  let rowsSent = 0;
  let stopRaf = false;
  let lastFrame = performance.now();
  const raf = (now: number) => { frames.push(now - lastFrame); lastFrame = now; if (!stopRaf) requestAnimationFrame(raf); };
  requestAnimationFrame(raf);

  const tIngest = performance.now();
  const endAt = tIngest + SECONDS * 1000;
  let k = 0;
  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      if (performance.now() >= endAt) { clearInterval(timer); resolve(); return; }
      const batch = updatePool[k++ % POOL];
      const tu = performance.now();
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      sent += 1;
      rowsSent += BATCH_ROWS;
      // Explicit format: no per-call sniffing of the string's shape.
      table.update(batch, { port_id: null, format: 'json' }).then(() => {
        inFlight -= 1;
        latencies.push(performance.now() - tu);
      });
    }, BATCH_MS);
  });
  // Drain in-flight updates before measuring.
  while (inFlight > 0) await new Promise((r) => setTimeout(r, 10));
  const ingestMs = performance.now() - tIngest;
  stopRaf = true;

  latencies.sort((a, b) => a - b);
  const sumFrames = frames.reduce((s, d) => s + d, 0);
  results.ingest = {
    wallMs: Math.round(ingestMs),
    batchesSent: sent,
    rowsSent,
    achievedRowsPerSec: Math.round(rowsSent / (ingestMs / 1000)),
    updateLatencyMs: {
      p50: Math.round(percentile(latencies, 0.5)),
      p90: Math.round(percentile(latencies, 0.9)),
      p99: Math.round(percentile(latencies, 0.99)),
      max: Math.round(latencies[latencies.length - 1] ?? 0),
    },
    maxInFlight,
    deltas: { count: deltaCount, totalMB: +(deltaBytes / 1048576).toFixed(2), avgKB: +(deltaBytes / Math.max(1, deltaCount) / 1024).toFixed(1), callbackMs: Math.round(deltaCbMs) },
    mainThread: {
      fps: Math.round((frames.length / sumFrames) * 1000),
      worstFrameMs: Math.round(frames.reduce((m, d) => Math.max(m, d), 0)),
      framesOver50ms: frames.filter((d) => d > 50).length,
    },
  };
  log(`ingest: ${results.ingest && JSON.stringify(results.ingest)}`);

  // ── snapshot export costs ──────────────────────────────────────────
  window.__spike.phase = 'export';
  const tArrow = performance.now();
  const arrow = await view.to_arrow();
  results.toArrowMs = Math.round(performance.now() - tArrow);
  results.toArrowMB = +(arrow.byteLength / 1048576).toFixed(2);
  const tJson = performance.now();
  const rowsJson = await view.to_json({ start_row: 0, end_row: 500 });
  results.toJson500Ms = Math.round(performance.now() - tJson);
  results.toJson500Rows = rowsJson.length;
  log(`to_arrow(all ${results.tableSize}) ${results.toArrowMs}ms / ${results.toArrowMB}MB; to_json(500 rows) ${results.toJson500Ms}ms`);

  window.__spike.results = results;
  window.__spike.phase = 'done';
  log('done');
}

main().catch((err) => {
  log(`FAILED: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  window.__spike.results = { error: String(err) };
  window.__spike.phase = 'done';
});
