// W0 of the worker-split plan (docs/superpowers/plans/2026-09-12-worker-split-plan.md):
// pin the single-SharedWorker bottleneck with numbers BEFORE any code moves.
//
//   A. config-RPC latency (hub-ready / list-configs) against the shared worker,
//      idle vs a rate=10000 SSRM storm — the tool-window starvation number.
//      The probe INJECTS synthetic catalog RPCs on the hooked worker port from
//      a second window, so no app changes are needed.
//   B. a fresh window's boot mid-storm: goto → first rows, plus the platform's
//      own `starui:*` load-mark ladder (config-ready … platform-ready).
//   C. the W4 baseline: 10 CSRM windows × 20k-row snapshot — per-window
//      time-to-full-paint and the first→last spread ("almost simultaneously").
//
// Prereqs (see run() bottom): stomp-view-server on :8081; production previews
//   stomp-ssrm-minimal on :5215, stomp-marketsgrid-minimal on :5216.
//
//   node worker-baseline.mjs
//   SSRM_URL=http://localhost:5215/ CSRM_URL=http://localhost:5216/ TAG=w0 node worker-baseline.mjs
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('playwright');

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.SSRM_PERF_OUT ?? join(HERE, 'out');
mkdirSync(OUT, { recursive: true });

const SSRM_URL = process.env.SSRM_URL ?? 'http://localhost:5215/';
const CSRM_URL = process.env.CSRM_URL ?? 'http://localhost:5216/';
const TAG = process.env.TAG ?? 'worker-baseline';
const CSRM_PAGES = Math.max(2, Number(process.env.CSRM_PAGES) || 10);

// Reuse harness 1's worker-port instrumentation verbatim…
const src = readFileSync(join(HERE, 'ssrm-validate.mjs'), 'utf8');
const INIT_SSRM = src.slice(src.indexOf('const INIT = `') + 'const INIT = `'.length, src.indexOf('`;\n\n//'));
// …extended: record config-snapshot replies and expose a synthetic-RPC probe.
const INIT_CONFIG = `(() => {
  const C = window.__cfgProbe = { replies: new Map(), seq: 0 };
  const armed = new Set();
  const arm = (port) => {
    if (!port || armed.has(port)) return; armed.add(port);
    port.addEventListener('message', (ev) => {
      const d = ev.data;
      if (d && d.kind === 'config-snapshot' && typeof d.reqId === 'string' && d.reqId.startsWith('probe-')) {
        const r = C.replies.get(d.reqId);
        if (r) { C.replies.delete(d.reqId); r.resolve(performance.now() - r.t0); }
      }
    });
  };
  // The ssrm INIT hook stashes every hooked port on window.__ssrm.ports.
  window.__cfgRpc = (kind, extra) => {
    const S = window.__ssrm; const port = S && S.ports && S.ports[0];
    if (!port) return Promise.reject(new Error('no hooked worker port'));
    arm(port);
    const reqId = 'probe-' + (C.seq += 1) + '-' + Math.random().toString(36).slice(2, 8);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { C.replies.delete(reqId); reject(new Error(kind + ' timed out (15s)')); }, 15000);
      C.replies.set(reqId, { t0: performance.now(), resolve: (ms) => { clearTimeout(timer); resolve(ms); } });
      port.postMessage({ kind, reqId, ...(extra || {}) });
    });
  };
})();`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (x) => (x == null ? null : Math.round(x * 10) / 10);
const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const stats = (arr) => ({ n: arr.length, p50: rnd(pct(arr, 50)), p95: rnd(pct(arr, 95)), p99: rnd(pct(arr, 99)), max: rnd(arr.length ? Math.max(...arr) : null) });

const waitForSsrmRows = (page) => page.waitForFunction(
  () => window.__ssrm?.getRows.some((g) => g.ok && g.rows > 0)
    && document.querySelectorAll('.ag-row:not(.ag-row-loading)').length > 5,
  null,
  { timeout: 180000 },
);

const LOAD_MARKS = ['config-ready', 'hub-connected', 'appdata-ready', 'catalog-ready', 'platform-ready'];
const readMarks = (page) => page.evaluate((names) => {
  const out = {};
  for (const n of names) {
    const m = performance.getEntriesByName('starui:' + n, 'mark')[0];
    out[n] = m ? Math.round(m.startTime) : null;
  }
  return out;
}, LOAD_MARKS);

/** N config-RPC samples of each kind from one page, every `gapMs`. */
async function probeConfig(page, samples, gapMs) {
  const hubReady = [];
  const listConfigs = [];
  for (let i = 0; i < samples; i += 1) {
    try { hubReady.push(await page.evaluate(() => window.__cfgRpc('hub-ready'))); } catch { hubReady.push(15000); }
    try { listConfigs.push(await page.evaluate(() => window.__cfgRpc('list-configs'))); } catch { listConfigs.push(15000); }
    await sleep(gapMs);
  }
  return { hubReady: stats(hubReady), listConfigs: stats(listConfigs) };
}

const PHASES = (process.env.PHASES ?? 'AB,C').split(',');
const out = { tag: TAG, startedAt: new Date().toISOString(), ssrmUrl: SSRM_URL, csrmUrl: CSRM_URL, scenarios: {} };

(async () => {
  const browser = await chromium.launch({ headless: true });

  // ───────────────────────── A + B: the SSRM app's shared worker ──
  if (PHASES.includes('AB')) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 850 } });
    await ctx.addInitScript(INIT_SSRM);
    await ctx.addInitScript(INIT_CONFIG);

    // A1 — idle baseline: blotter with a quiet feed (?rate=0), probe from a
    // second window sharing the worker.
    const blotter = await ctx.newPage();
    await blotter.goto(`${SSRM_URL}?rate=0`, { waitUntil: 'domcontentloaded' });
    await waitForSsrmRows(blotter);
    const toolIdle = await ctx.newPage();
    await toolIdle.goto(`${SSRM_URL}?rate=0`, { waitUntil: 'domcontentloaded' });
    await waitForSsrmRows(toolIdle);
    await sleep(2000);
    out.scenarios.configRpcIdle = await probeConfig(toolIdle, 40, 250);
    console.log('\n[A1 config RPC, idle]', JSON.stringify(out.scenarios.configRpcIdle));

    // A2 — storm: restart the provider at rate=10000 (config differs → re-save
    // → restart + re-stream), then probe from the tool window while it rages.
    await blotter.goto(`${SSRM_URL}?rate=10000`, { waitUntil: 'domcontentloaded' });
    await waitForSsrmRows(blotter);
    await sleep(3000); // let the storm reach steady state
    out.scenarios.configRpcStorm = await probeConfig(toolIdle, 60, 250);
    console.log('\n[A2 config RPC, rate=10000 storm]', JSON.stringify(out.scenarios.configRpcStorm));

    // A3 — the burst window: probe WHILE the provider restarts and the 20k
    // snapshot re-streams + ingests (the single-macrotask-heavy period).
    // The reload flips rate back (config differs → re-save → restart), and
    // the probe hammers concurrently at 100 ms gaps from the tool window.
    {
      const hubReady = [];
      const listConfigs = [];
      const probeLoop = (async () => {
        const t0 = Date.now();
        while (Date.now() - t0 < 12_000) {
          try { hubReady.push(await toolIdle.evaluate(() => window.__cfgRpc('hub-ready'))); } catch { hubReady.push(15000); }
          try { listConfigs.push(await toolIdle.evaluate(() => window.__cfgRpc('list-configs'))); } catch { listConfigs.push(15000); }
          await sleep(100);
        }
      })();
      await blotter.goto(`${SSRM_URL}?rate=9999`, { waitUntil: 'domcontentloaded' });
      await waitForSsrmRows(blotter);
      await probeLoop;
      out.scenarios.configRpcDuringSnapshotRestream = { hubReady: stats(hubReady), listConfigs: stats(listConfigs) };
      console.log('\n[A3 config RPC, during snapshot re-stream]', JSON.stringify(out.scenarios.configRpcDuringSnapshotRestream));
    }

    // B — a FRESH window opening mid-storm: wall time to rows + the platform's
    // own load-mark ladder.
    const late = await ctx.newPage();
    const t0 = Date.now();
    await late.goto(`${SSRM_URL}?rate=10000`, { waitUntil: 'domcontentloaded' });
    await waitForSsrmRows(late);
    const wallMs = Date.now() - t0;
    out.scenarios.windowOpenMidStorm = { wallToRowsMs: wallMs, loadMarks: await readMarks(late) };
    console.log('\n[B window open mid-storm]', JSON.stringify(out.scenarios.windowOpenMidStorm));
    await ctx.close();
  }

  // ───────────────────────── C: 10 CSRM windows × 20k snapshot ──
  if (PHASES.includes('C')) {
    const ctx = await browser.newContext({ viewport: { width: 1400, height: 850 } });
    await ctx.addInitScript(INIT_SSRM);   // port hook only (marks + rows detection)
    await ctx.addInitScript(INIT_CONFIG);

    // "Full paint" for CSRM = the grid's client row model actually holds the
    // whole snapshot. The minimal app has no status bar, so read
    // getDisplayedRowCount() off the grid api (fiber walk, memoized).
    const csrmReady = (page) => page.waitForFunction(
      () => {
        if (document.querySelectorAll('.ag-row:not(.ag-row-loading)').length < 5) return false;
        let api = window.__gridApi;
        if (!api) {
          const seen = new Set();
          const visit = (f, d) => {
            if (!f || d > 12000 || api || seen.has(f)) return; seen.add(f);
            if (f.stateNode?.api?.getDisplayedRowCount) { api = f.stateNode.api; return; }
            if (f.memoizedProps?.api?.getDisplayedRowCount) { api = f.memoizedProps.api; return; }
            visit(f.child, d + 1); visit(f.sibling, d + 1);
          };
          for (const el of document.querySelectorAll('*')) {
            for (const k of Object.keys(el)) {
              if (k.startsWith('__reactContainer$') || k.startsWith('__reactFiber$')) visit(el[k], 0);
            }
            if (api) break;
          }
          if (api) window.__gridApi = api;
        }
        if (!api) return false;
        try { return api.getDisplayedRowCount() >= 20000; } catch { return false; }
      },
      null,
      { timeout: 240000 },
    );

    // Window 1 pays the broker snapshot into the worker cache.
    const first = await ctx.newPage();
    const tFirst = Date.now();
    await first.goto(CSRM_URL, { waitUntil: 'domcontentloaded' });
    await csrmReady(first);
    const firstMs = Date.now() - tFirst;

    // Windows 2..N attach SIMULTANEOUSLY — the replay fan-out under test.
    const joiners = [];
    for (let i = 1; i < CSRM_PAGES; i += 1) joiners.push(await ctx.newPage());
    const tJoin = Date.now();
    const joinMs = await Promise.all(joiners.map(async (page) => {
      await page.goto(CSRM_URL, { waitUntil: 'domcontentloaded' });
      await csrmReady(page);
      return Date.now() - tJoin;
    }));
    const marks = await Promise.all(joiners.map((p) => readMarks(p)));
    out.scenarios.csrmFanout = {
      pages: CSRM_PAGES,
      firstWindowColdMs: firstMs,
      joinersMs: joinMs,
      joinSpreadMs: Math.max(...joinMs) - Math.min(...joinMs),
      joinStats: stats(joinMs),
      joinerPlatformReady: marks.map((m) => m['platform-ready']),
    };
    console.log('\n[C csrm fan-out]', JSON.stringify(out.scenarios.csrmFanout));
    await ctx.close();
  }

  await browser.close();
  const file = join(OUT, `${TAG}-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify(out, null, 2));
  console.log('\nwrote', file);
})().catch((err) => { console.error(err); process.exit(1); });
