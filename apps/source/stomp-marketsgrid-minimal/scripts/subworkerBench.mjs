/**
 * Phase 1 exit-criteria harness (docs/wasm-data-plane-plan.md §7):
 * N STOMP providers at `rate` rows/sec each, one per tab, all attached to
 * ONE SharedWorker hub — with the transports on the hub thread
 * (`dataPlane=hub`) or in per-provider dedicated workers
 * (`dataPlane=subworker`). Profiles the hub AND each nested provider
 * worker over CDP (nested workers are child targets of the shared worker,
 * reached through Target.setAutoAttach on its session), and samples each
 * page's long tasks / fps.
 *
 * Prereqs: stomp-server on ws://localhost:8081; the minimal app dev server
 * on :5213 (`BROWSER=none npx vite --port 5213` in this app).
 *
 * Usage (from this app's directory):
 *   node scripts/subworkerBench.mjs [plane=hub|subworker|both] [providers] [rate] [batch] [seconds]
 */
import { chromium } from 'playwright';
import WebSocketMod from 'ws';
const WebSocket = WebSocketMod.WebSocket ?? WebSocketMod;

const planeArg = process.argv[2] ?? 'both';
const providers = Number(process.argv[3] ?? 2);
const rate = Number(process.argv[4] ?? 20_000);
const batch = Number(process.argv[5] ?? 200);
const seconds = Number(process.argv[6] ?? 20);
const base = process.env.BENCH_BASE ?? 'http://localhost:5213/';
const DEBUG_PORT = 9341;

async function cdpConnect(wsUrl) {
  const ws = new WebSocket(wsUrl, { maxPayload: 512 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  let nextId = 1;
  const pending = new Map();
  const listeners = new Set();
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p.reject(new Error(`${m.error.message} (${p.method})`)) : p.resolve(m.result);
    } else if (m.method) {
      for (const l of listeners) l(m);
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject, method });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  return { send, on: (l) => listeners.add(l), close: () => ws.close() };
}

function summarizeProfile(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  let idle = 0;
  for (const sid of profile.samples) {
    const n = byId.get(sid);
    const fn = n?.callFrame?.functionName || '(anonymous)';
    if (fn === '(idle)') { idle++; continue; }
    const key = `${fn} ${(n.callFrame.url || '').split('/').pop()}:${n.callFrame.lineNumber}`;
    self.set(key, (self.get(key) ?? 0) + 1);
  }
  const total = profile.samples.length;
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([k, v]) => `${((v / total) * 100).toFixed(0)}% ${k}`);
  return { busyPct: Math.round(((total - idle) / total) * 100), top };
}

async function runPlane(plane) {
  const browser = await chromium.launch({
    headless: false,
    args: ['--window-size=1500,950', `--remote-debugging-port=${DEBUG_PORT}`],
  });
  const context = await browser.newContext({ viewport: { width: 1460, height: 880 } });
  const pages = [];
  for (let i = 0; i < providers; i++) {
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log(`  [tab ${i}] PAGE ERROR`, e.message));
    const tag = `TRADER${String(i + 1).padStart(3, '0')}`;
    const url = `${base}?tag=${tag}&rate=${rate}&batch=${batch}&dataPlane=${plane}&gridspy`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    pages.push(page);
  }
  // Wait for every grid to hold its snapshot.
  for (const page of pages) {
    await page.waitForFunction(
      () => (window.__gridSpy?.api?.getDisplayedRowCount?.() ?? 0) > 1000,
      null,
      { timeout: 180_000 },
    );
  }
  const rowCounts = [];
  for (const page of pages) rowCounts.push(await page.evaluate(() => window.__gridSpy.api.getDisplayedRowCount()));
  console.log(`  grids loaded: ${rowCounts.join(', ')} rows; letting the live tail settle 5s…`);
  await new Promise((r) => setTimeout(r, 5000));

  // ── CDP: hub + provider SharedWorkers (one target each) ─────────────
  const version = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json();
  const cdp = await cdpConnect(version.webSocketDebuggerUrl);
  const { targetInfos } = await cdp.send('Target.getTargets');
  const workers = targetInfos.filter((t) => t.type === 'shared_worker');
  const hubTarget = workers.find((t) => !/starui-provider/.test(t.title));
  if (!hubTarget) throw new Error('no hub shared_worker target — is the hub running?');
  const providerTargets = workers.filter((t) => /starui-provider/.test(t.title));
  const sessions = [];
  for (const t of [hubTarget, ...providerTargets]) {
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
    sessions.push([t === hubTarget ? 'hub (SharedWorker)' : `provider worker (${t.title.replace('starui-provider:', '').slice(-28)})`, sessionId]);
  }
  console.log(`  profiling ${sessions.length} worker session(s) for ${seconds}s: ${sessions.map(([n]) => n).join(' | ')}`);

  // Page-side sampling: long tasks + fps + grid apply calls.
  for (const page of pages) {
    await page.evaluate(() => {
      window.__bench = { long: 0, longMs: 0, maxLong: 0, frames: 0, t0: performance.now() };
      try {
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) { window.__bench.long++; window.__bench.longMs += e.duration; window.__bench.maxLong = Math.max(window.__bench.maxLong, e.duration); }
        }).observe({ type: 'longtask' });
      } catch { /* unsupported */ }
      const tick = () => { window.__bench.frames++; requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
      window.__gridSpy?.reset?.();
    });
  }

  for (const [, sid] of sessions) {
    await cdp.send('Profiler.enable', {}, sid);
    await cdp.send('Profiler.setSamplingInterval', { interval: 250 }, sid);
    await cdp.send('Profiler.start', {}, sid);
  }
  await new Promise((r) => setTimeout(r, seconds * 1000));
  const workerResults = [];
  for (const [name, sid] of sessions) {
    const { profile } = await cdp.send('Profiler.stop', {}, sid);
    workerResults.push({ name, ...summarizeProfile(profile) });
  }
  const pageResults = [];
  for (let i = 0; i < pages.length; i++) {
    pageResults.push(await pages[i].evaluate(() => {
      const b = window.__bench;
      const secs = (performance.now() - b.t0) / 1000;
      const spy = window.__gridSpy?.report?.() ?? null;
      const applies = spy?.calls?.applyTransactionAsync ?? spy?.applyTransactionAsync ?? null;
      return { rows: window.__gridSpy.api.getDisplayedRowCount(), fps: Math.round(b.frames / secs), longTasks: b.long, longMs: Math.round(b.longMs), maxLongMs: Math.round(b.maxLong), applyCalls: applies };
    }));
  }
  cdp.close();
  await browser.close();
  return { plane, workerResults, pageResults };
}

const planes = planeArg === 'both' ? ['hub', 'subworker'] : [planeArg];
console.log(`providers=${providers} rate=${rate}/s batch=${batch} window=${seconds}s cores=${(await import('node:os')).cpus().length}`);
const all = [];
for (const plane of planes) {
  console.log(`\n=== dataPlane=${plane} ===`);
  const r = await runPlane(plane);
  all.push(r);
  for (const w of r.workerResults) {
    console.log(`  ${w.name.padEnd(44)} busy ${String(w.busyPct).padStart(3)}%   top: ${w.top.slice(0, 4).join(' · ')}`);
  }
  r.pageResults.forEach((p, i) => console.log(`  tab ${i}: rows ${p.rows}  fps ${p.fps}  longTasks ${p.longTasks} (${p.longMs}ms total, max ${p.maxLongMs}ms)  applyTransactionAsync ${p.applyCalls}`));
}
if (all.length === 2) {
  const hub = all[0].workerResults[0].busyPct;
  const sub = all[1].workerResults[0].busyPct;
  const subWorkers = all[1].workerResults.slice(1).map((w) => w.busyPct);
  console.log(`\nSUMMARY: hub-thread busy ${hub}% (hub plane) → ${sub}% (subworker plane); provider workers ${subWorkers.join('% / ')}% on their own cores`);
}
