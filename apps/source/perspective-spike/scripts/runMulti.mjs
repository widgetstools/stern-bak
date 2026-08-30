/**
 * Multi-window hosting test: opens N windows against the hub SharedWorker
 * (one Perspective engine), the last one as leader (starts ingest), CDP-
 * profiles the shared worker mid-run, and prints every window's results.
 *
 * Usage (from apps/, dev server on :5214):
 *   node source/perspective-spike/scripts/runMulti.mjs [windows] [rate] [seconds]
 */
import { chromium } from 'playwright';
import WebSocketMod from 'ws';
const WebSocket = WebSocketMod.WebSocket ?? WebSocketMod;

const windows = Number(process.argv[2] ?? 3);
const rate = Number(process.argv[3] ?? 20_000);
const seconds = Number(process.argv[4] ?? 15);
const base = process.argv[5] ?? 'http://localhost:5214/multi.html';
const DEBUG_PORT = 9335;

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
  const url = `${base}?rate=${rate}&seconds=${seconds}${leader ? '&leader=1' : ''}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  if (!leader) {
    // Followers must be subscribed before the leader starts ingest.
    await page.waitForFunction(() => window.__spike?.phase === 'ingest', null, { timeout: 120_000 });
  }
  pages.push(page);
}

// Profile the shared worker during ingest.
let profile = null;
try {
  await pages[windows - 1].waitForFunction(() => window.__spike?.phase === 'ingest', null, { timeout: 120_000 });
  const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
  const target = list.find((t) => t.type === 'shared_worker');
  if (!target) {
    console.log('no shared_worker target; targets:', list.map((t) => `${t.type}:${t.title}`).join(' | '));
  } else {
    console.log(`profiling ${target.type} ${target.title || target.url}`);
    const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
    await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
    let id = 1; const pending = new Map();
    ws.on('message', (d) => { const m = JSON.parse(d.toString()); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } });
    const send = (method, params = {}) => new Promise((resolve, reject) => { const i = id++; pending.set(i, { resolve, reject }); ws.send(JSON.stringify({ id: i, method, params })); });
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

for (const page of pages) {
  await page.waitForFunction(() => window.__spike?.phase === 'done', null, { timeout: (seconds + 120) * 1000 });
}
for (let i = 0; i < windows; i++) {
  const r = await pages[i].evaluate(() => window.__spike.results);
  console.log(`WINDOW ${i}${i === windows - 1 ? ' (leader)' : ''}`, JSON.stringify({ deltas: r.deltas, mainThread: r.mainThread, toJson500Ms: r.toJson500Ms, error: r.error }));
}
const hub = await pages[windows - 1].evaluate(() => window.__spike.results.hub);
console.log('HUB', JSON.stringify(hub));

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
  console.log(`HUB WORKER PROFILE wall=${Math.round(wallMs)}ms samples=${total}`);
  for (const [key, count] of [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`${String(Math.round(count * msPer)).padStart(6)}ms ${((count / total) * 100).toFixed(1).padStart(5)}%  ${key}`);
  }
}
await browser.close();
