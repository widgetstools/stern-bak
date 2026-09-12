// W0 of the worker-split plan (docs/superpowers/plans/2026-09-12-worker-split-plan.md):
// pin the single-SharedWorker bottleneck with numbers BEFORE any code moves.
//
//   A. config-RPC latency (hub-ready / list-configs) against the PLATFORM
//      worker port — the plane a tool window's config requests ride — plus
//      the scalar `provider-running` probe on the DATA worker port (pure
//      queueing behind ingest), idle vs a rate=10000 SSRM storm: the
//      tool-window starvation number, and the data-plane latency it no
//      longer shares. The probe INJECTS synthetic RPCs on the hooked worker
//      ports from a second window, so no app changes are needed.
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
// CPU throttle multiplier (CDP Emulation.setCPUThrottlingRate) — a coarse
// Windows-11-corporate-hardware proxy on the M4 Max dev rig. CAVEAT: CDP
// throttling applies to PAGE renderer threads; the SharedWorker's thread is
// a separate target Playwright cannot throttle, so worker-side costs
// (ingest, encode) still run at native speed. Page-side costs (decode,
// row building, grid paint — the bulk of the CSRM fan-out ladder) scale.
// Worker-side scaling needs the real Windows box; see plan §5.
const THROTTLE = Math.max(1, Number(process.env.THROTTLE) || 1);

// Reuse harness 1's worker-port instrumentation verbatim…
const src = readFileSync(join(HERE, 'ssrm-validate.mjs'), 'utf8');
const INIT_SSRM = src.slice(src.indexOf('const INIT = `') + 'const INIT = `'.length, src.indexOf('`;\n\n//'));
// …extended: record config-snapshot replies and expose a synthetic-RPC probe.
// Since the worker split there are TWO SharedWorkers per window; the probe
// targets one by name — 'platform' (mkt-platform-services:*, the plane a tool
// window's config requests ride) or 'data' (mkt-data-services:*, whose only
// catalog-shaped reply left is the scalar `provider-running`, so a probe there
// measures pure queueing behind ingest). Pre-split single-worker runs have one
// port under the data name; both selectors fall back to it.
const INIT_CONFIG = `(() => {
  const C = window.__cfgProbe = { replies: new Map(), seq: 0, named: [] };
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
  // Wrap the (already hooked) SharedWorker constructor once more to learn
  // each port's worker name; the ssrm INIT hook keeps its own port list.
  const Hooked = window.SharedWorker;
  const Named = function SharedWorker(...args) {
    const w = new Hooked(...args);
    C.named.push({ name: String((args[1] && args[1].name) || ''), port: w.port });
    return w;
  };
  Named.prototype = Hooked.prototype;
  window.SharedWorker = Named;
  const pick = (which) => {
    const prefix = which === 'platform' ? 'mkt-platform-services:' : 'mkt-data-services:';
    const hit = C.named.find((p) => p.name.startsWith(prefix)) || C.named[0];
    return hit && hit.port;
  };
  window.__cfgRpc = (kind, extra, which) => {
    const port = pick(which || 'platform');
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

/** One round of the three probes: two catalog RPCs on the platform port + the scalar probe on the data port. */
async function probeOnce(page, into) {
  try { into.hubReady.push(await page.evaluate(() => window.__cfgRpc('hub-ready', null, 'platform'))); } catch { into.hubReady.push(15000); }
  try { into.listConfigs.push(await page.evaluate(() => window.__cfgRpc('list-configs', null, 'platform'))); } catch { into.listConfigs.push(15000); }
  try { into.dataProviderRunning.push(await page.evaluate(() => window.__cfgRpc('provider-running', { providerId: 'probe' }, 'data'))); } catch { into.dataProviderRunning.push(15000); }
}
const newProbe = () => ({ hubReady: [], listConfigs: [], dataProviderRunning: [] });
const probeStats = (p) => ({ hubReady: stats(p.hubReady), listConfigs: stats(p.listConfigs), dataProviderRunning: stats(p.dataProviderRunning) });

/** N samples of each probe from one page, every `gapMs`. */
async function probeConfig(page, samples, gapMs) {
  const acc = newProbe();
  for (let i = 0; i < samples; i += 1) {
    await probeOnce(page, acc);
    await sleep(gapMs);
  }
  return probeStats(acc);
}

const PHASES = (process.env.PHASES ?? 'AB,C').split(',');
const out = { tag: TAG, startedAt: new Date().toISOString(), ssrmUrl: SSRM_URL, csrmUrl: CSRM_URL, throttle: THROTTLE, scenarios: {} };

async function throttlePage(ctx, page) {
  if (THROTTLE <= 1) return;
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
}

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
    await throttlePage(ctx, blotter);
    await blotter.goto(`${SSRM_URL}?rate=0`, { waitUntil: 'domcontentloaded' });
    await waitForSsrmRows(blotter);
    const toolIdle = await ctx.newPage();
    await throttlePage(ctx, toolIdle);
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
      const acc = newProbe();
      const probeLoop = (async () => {
        const t0 = Date.now();
        while (Date.now() - t0 < 12_000) {
          await probeOnce(toolIdle, acc);
          await sleep(100);
        }
      })();
      await blotter.goto(`${SSRM_URL}?rate=9999`, { waitUntil: 'domcontentloaded' });
      await waitForSsrmRows(blotter);
      await probeLoop;
      out.scenarios.configRpcDuringSnapshotRestream = probeStats(acc);
      console.log('\n[A3 config RPC, during snapshot re-stream]', JSON.stringify(out.scenarios.configRpcDuringSnapshotRestream));
    }

    // B — a FRESH window opening mid-storm: wall time to rows + the platform's
    // own load-mark ladder.
    const late = await ctx.newPage();
    await throttlePage(ctx, late);
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
    await throttlePage(ctx, first);
    const tFirst = Date.now();
    await first.goto(CSRM_URL, { waitUntil: 'domcontentloaded' });
    await csrmReady(first);
    const firstMs = Date.now() - tFirst;

    // Windows 2..N attach SIMULTANEOUSLY — the replay fan-out under test.
    const joiners = [];
    for (let i = 1; i < CSRM_PAGES; i += 1) {
      const page = await ctx.newPage();
      await throttlePage(ctx, page);
      joiners.push(page);
    }
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
