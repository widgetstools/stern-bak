/**
 * Drives the Perspective engine spike page in headed Chromium, attaches
 * CDP to the engine worker for a CPU profile during the ingest phase, and
 * prints the page's results (window.__spike) plus the worker profile.
 *
 * Usage (from apps/, dev server already running on :5214):
 *   node source/perspective-spike/scripts/run.mjs [rate] [seconds] [rows] [url]
 *
 * `playwright` and `ws` resolve from the apps install root.
 */
import { chromium } from 'playwright';
import WebSocketMod from 'ws'; // CommonJS — no named exports under ESM
const WebSocket = WebSocketMod.WebSocket ?? WebSocketMod;

const rate = Number(process.argv[2] ?? 20_000);
const seconds = Number(process.argv[3] ?? 20);
const rows = Number(process.argv[4] ?? 20_000);
const base = process.argv[5] ?? 'http://localhost:5214/';
const url = `${base}?rate=${rate}&seconds=${seconds}&rows=${rows}`;
const DEBUG_PORT = 9334;

const browser = await chromium.launch({
  headless: false,
  args: ['--window-size=1200,800', `--remote-debugging-port=${DEBUG_PORT}`],
});
const page = await browser.newPage();
page.on('console', (m) => { if (/\[spike\]/.test(m.text())) console.log(m.text()); });
page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));

console.log(`opening ${url}`);
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
await page.waitForFunction(() => window.__spike?.phase === 'ingest', null, { timeout: 120_000 });

let profile = null;
try {
  const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const target = list.find((t) => t.type === 'worker' || t.type === 'shared_worker');
  if (!target) {
    console.log('no worker target found; targets:', list.map((t) => `${t.type}:${t.title}`).join(' | '));
  } else {
    console.log(`profiling worker target: ${target.type} ${target.title || target.url}`);
    const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
    await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
    let id = 1; const pending = new Map();
    ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id); pending.delete(m.id);
        m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
      }
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const i = id++; pending.set(i, { resolve, reject });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
    await send('Profiler.enable');
    await send('Profiler.setSamplingInterval', { interval: 250 });
    await send('Profiler.start');
    await new Promise((r) => setTimeout(r, Math.max(5_000, (seconds * 1000) / 2)));
    ({ profile } = await send('Profiler.stop'));
    ws.close();
  }
} catch (e) {
  console.log('worker profiling failed:', String(e).slice(0, 200));
}

await page.waitForFunction(() => window.__spike?.phase === 'done', null, { timeout: (seconds + 90) * 1000 });
const results = await page.evaluate(() => window.__spike.results);
console.log('RESULTS', JSON.stringify(results, null, 2));

if (profile) {
  const nodesById = new Map(profile.nodes.map((n) => [n.id, n]));
  const hits = new Map();
  for (const sid of profile.samples) hits.set(sid, (hits.get(sid) ?? 0) + 1);
  const total = profile.samples.length;
  const wallMs = (profile.endTime - profile.startTime) / 1000;
  const agg = new Map();
  for (const [sid, count] of hits) {
    const f = nodesById.get(sid)?.callFrame; if (!f) continue;
    const file = (f.url ? f.url.split('/').slice(-1)[0] : '').split('?')[0];
    const key = `${f.functionName || '(anonymous)'} @ ${file}:${(f.lineNumber ?? 0) + 1}`;
    agg.set(key, (agg.get(key) ?? 0) + count);
  }
  const msPer = wallMs / total;
  console.log(`WORKER PROFILE wall=${Math.round(wallMs)}ms samples=${total}`);
  for (const [key, count] of [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`${String(Math.round(count * msPer)).padStart(6)}ms ${((count / total) * 100).toFixed(1).padStart(5)}%  ${key}`);
  }
}
await browser.close();
