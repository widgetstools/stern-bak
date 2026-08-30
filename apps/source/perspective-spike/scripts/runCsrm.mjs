/**
 * CSRM materialization test: N windows each hosting a real AG Grid
 * (client-side row model, 20k rows) fed by the hub's relayed Arrow deltas
 * (apache-arrow decode → row objects → applyTransactionAsync). Reports
 * per-window decode/materialize/apply costs, long tasks and fps, plus the
 * hub engine's busy share.
 *
 * Usage (from apps/, dev server on :5214):
 *   node source/perspective-spike/scripts/runCsrm.mjs [windows] [rate] [seconds] [batchMs]
 */
import { chromium } from 'playwright';
import WebSocketMod from 'ws';
const WebSocket = WebSocketMod.WebSocket ?? WebSocketMod;

const windows = Number(process.argv[2] ?? 1);
const rate = Number(process.argv[3] ?? 20_000);
const seconds = Number(process.argv[4] ?? 15);
const batchMs = Number(process.argv[5] ?? 200);
const base = process.argv[6] ?? 'http://localhost:5214/csrm.html';
const DEBUG_PORT = 9337;

const browser = await chromium.launch({
  headless: false,
  args: ['--window-size=1400,900', `--remote-debugging-port=${DEBUG_PORT}`],
});
const context = await browser.newContext({ viewport: { width: 1360, height: 840 } });
const pages = [];
for (let i = 0; i < windows; i++) {
  const leader = i === windows - 1;
  const page = await context.newPage();
  page.on('console', (m) => { if (leader && /\[spike\]|\[hub\]/.test(m.text())) console.log(`w${i} ${m.text()}`); });
  page.on('pageerror', (e) => console.log(`w${i} PAGE ERROR`, e.message));
  const url = `${base}?rate=${rate}&seconds=${seconds}&batchMs=${batchMs}${leader ? '&leader=1' : ''}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  if (!leader) await page.waitForFunction(() => window.__spike?.phase === 'ingest', null, { timeout: 180_000 });
  pages.push(page);
}

async function busyPct(target, ms) {
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
  const nodesById = new Map(profile.nodes.map((n) => [n.id, n]));
  let idle = 0;
  for (const sid of profile.samples) if (nodesById.get(sid)?.callFrame?.functionName === '(idle)') idle++;
  return Math.round(((profile.samples.length - idle) / profile.samples.length) * 100);
}

const engines = {};
try {
  await pages[windows - 1].waitForFunction(() => window.__spike?.phase === 'ingest', null, { timeout: 180_000 });
  const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const hubTarget = list.find((t) => t.type === 'shared_worker');
  if (hubTarget) engines.hubEngineBusyPct = await busyPct(hubTarget, Math.max(3_000, Math.floor((seconds * 1000) / 2)));
} catch (e) {
  console.log('profiling failed:', String(e).slice(0, 200));
}

for (const page of pages) {
  await page.waitForFunction(() => window.__spike?.phase === 'done', null, { timeout: (seconds + 180) * 1000 });
}
for (let i = 0; i < windows; i++) {
  const r = await pages[i].evaluate(() => window.__spike.results);
  console.log(`WINDOW ${i}${i === windows - 1 ? ' (leader)' : ''}`, JSON.stringify({ gridRows: r.gridRows, deltas: r.deltas, agFlushes: r.agFlushes, longTasks: r.longTasks, mainThread: r.mainThread, error: r.error }));
}
console.log('HUB', JSON.stringify(await pages[windows - 1].evaluate(() => window.__spike.results.hub)));
console.log('ENGINES', JSON.stringify(engines));
await browser.close();
