/**
 * Replicated-mode test: N replica windows (each with its own engine worker
 * and its own filtered/sorted view) fed by the hub's single relayed Arrow
 * delta stream. Profiles the hub shared worker, then one replica worker.
 *
 * Usage (from apps/, dev server on :5214):
 *   node source/perspective-spike/scripts/runReplica.mjs [windows] [rate] [seconds] [batchMs]
 */
import { chromium } from 'playwright';
import WebSocketMod from 'ws';
const WebSocket = WebSocketMod.WebSocket ?? WebSocketMod;

const windows = Number(process.argv[2] ?? 3);
const rate = Number(process.argv[3] ?? 20_000);
const seconds = Number(process.argv[4] ?? 15);
const batchMs = Number(process.argv[5] ?? 200);
const base = process.argv[6] ?? 'http://localhost:5214/replica.html';
const DEBUG_PORT = 9336;
const DESKS = ['IG Credit', 'HY Credit', 'Govies', 'EM', 'Rates'];

const browser = await chromium.launch({
  headless: false,
  args: ['--window-size=1000,700', `--remote-debugging-port=${DEBUG_PORT}`],
});
const context = await browser.newContext();
const pages = [];
for (let i = 0; i < windows; i++) {
  const leader = i === windows - 1;
  const page = await context.newPage();
  page.on('console', (m) => { if (leader && /\[spike\]|\[hub\]/.test(m.text())) console.log(`w${i} ${m.text()}`); });
  page.on('pageerror', (e) => console.log(`w${i} PAGE ERROR`, e.message));
  const url = `${base}?rate=${rate}&seconds=${seconds}&batchMs=${batchMs}&desk=${encodeURIComponent(DESKS[i % DESKS.length])}${leader ? '&leader=1' : ''}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  if (!leader) await page.waitForFunction(() => window.__spike?.phase === 'ingest', null, { timeout: 120_000 });
  pages.push(page);
}

async function profileTarget(target, ms) {
  const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  let id = 1; const pending = new Map();
  ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const i = id++; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Profiler.enable');
  await send('Profiler.setSamplingInterval', { interval: 250 });
  await send('Profiler.start');
  await new Promise((r) => setTimeout(r, ms));
  const { profile } = await send('Profiler.stop');
  ws.close();
  const total = profile.samples.length;
  let idle = 0;
  const nodesById = new Map(profile.nodes.map((n) => [n.id, n]));
  for (const sid of profile.samples) if (nodesById.get(sid)?.callFrame?.functionName === '(idle)') idle++;
  return { busyPct: Math.round(((total - idle) / total) * 100), samples: total };
}

const results = {};
try {
  await pages[windows - 1].waitForFunction(() => window.__spike?.phase === 'ingest', null, { timeout: 120_000 });
  const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const hubTarget = list.find((t) => t.type === 'shared_worker');
  const replicaTargets = list.filter((t) => t.type === 'worker');
  const slice = Math.max(3_000, Math.floor((seconds * 1000) / 3));
  if (hubTarget) results.hubEngineBusyPct = (await profileTarget(hubTarget, slice)).busyPct;
  if (replicaTargets[0]) results.replicaEngineBusyPct = (await profileTarget(replicaTargets[0], slice)).busyPct;
  results.replicaWorkers = replicaTargets.length;
} catch (e) {
  console.log('profiling failed:', String(e).slice(0, 200));
}

for (const page of pages) {
  await page.waitForFunction(() => window.__spike?.phase === 'done', null, { timeout: (seconds + 120) * 1000 });
}
for (let i = 0; i < windows; i++) {
  const r = await pages[i].evaluate(() => window.__spike.results);
  console.log(`WINDOW ${i}${i === windows - 1 ? ' (leader)' : ''}`, JSON.stringify({ desk: r.desk, snapshotMs: r.snapshotMs, replicaBootMs: r.replicaBootMs, relay: r.relay, myView: r.myView, mainThread: r.mainThread, toJson500Ms: r.toJson500Ms, error: r.error }));
}
console.log('HUB', JSON.stringify(await pages[windows - 1].evaluate(() => window.__spike.results.hub)));
console.log('ENGINES', JSON.stringify(results));
await browser.close();
