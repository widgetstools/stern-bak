/**
 * Long soak for the sub-worker data plane (Phase 1/3 exit criterion):
 * N providers at `rate` rows/s on the SHIPPED default plane, sampling
 * per-worker heap + grid health every minute, watching for drift.
 *
 * Caveat (recorded in the plan): Playwright disables background-tab
 * throttling, so hidden-window pathologies are NOT covered here — the
 * arrival-driven flush guard covering those lives in the page layer and
 * is unchanged. This soak validates worker/hub memory flatness and
 * sustained delivery.
 *
 * Usage (dev server on :5213, stomp-server on :8081):
 *   node scripts/soak.mjs [minutes] [providers] [rate] [plane]
 * Writes CSV to soak-<plane>-<stamp>.csv in the working directory and
 * prints one line per sample.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import WebSocketMod from 'ws';
const WebSocket = WebSocketMod.WebSocket ?? WebSocketMod;

const minutes = Number(process.argv[2] ?? 60);
const providers = Number(process.argv[3] ?? 2);
const rate = Number(process.argv[4] ?? 20_000);
const plane = process.argv[5] ?? 'subworker';
const base = process.env.BENCH_BASE ?? 'http://localhost:5213/';
const DEBUG_PORT = 9345;
const out = `soak-${plane}-${new Date().toISOString().replace(/[:.]/g, '-')}.csv`;

async function cdpConnect(wsUrl) {
  const ws = new WebSocket(wsUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  let nextId = 1; const pending = new Map();
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  return { send, close: () => ws.close() };
}

const browser = await chromium.launch({ headless: true, args: [`--remote-debugging-port=${DEBUG_PORT}`] });
const context = await browser.newContext();
const pages = [];
for (let i = 0; i < providers; i++) {
  const page = await context.newPage();
  const tag = `TRADER${String(i + 1).padStart(3, '0')}`;
  await page.goto(`${base}?tag=${tag}&rate=${rate}&batch=200&dataPlane=${plane}&gridspy`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  pages.push(page);
}
for (const page of pages) {
  await page.waitForFunction(() => (window.__gridSpy?.api?.getDisplayedRowCount?.() ?? 0) > 1000, null, { timeout: 180_000 });
  await page.evaluate(() => window.__gridSpy?.reset?.());
}

const version = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json();
const cdp = await cdpConnect(version.webSocketDebuggerUrl);
const { targetInfos } = await cdp.send('Target.getTargets');
const workers = targetInfos.filter((t) => t.type === 'shared_worker');
const sessions = [];
for (const t of workers) {
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
  await cdp.send('Runtime.enable', {}, sessionId);
  sessions.push([/starui-provider/.test(t.title) ? `worker:${t.title.slice(-20)}` : 'hub', sessionId]);
}

fs.writeFileSync(out, `minute,${sessions.map(([n]) => `${n}_heapMB`).join(',')},rows0,applies0${providers > 1 ? ',rows1,applies1' : ''}\n`);
console.log(`soak: ${providers}×${rate}/s plane=${plane} for ${minutes}min → ${out}; workers: ${sessions.map(([n]) => n).join(' | ')}`);

const t0 = Date.now();
for (let minute = 1; minute <= minutes; minute++) {
  await new Promise((r) => setTimeout(r, 60_000));
  const heaps = [];
  for (const [, sid] of sessions) {
    try {
      const { usedSize } = await cdp.send('Runtime.getHeapUsage', {}, sid);
      heaps.push((usedSize / 1048576).toFixed(1));
    } catch {
      heaps.push('dead');
    }
  }
  const grid = [];
  for (const page of pages) {
    try {
      grid.push(await page.evaluate(() => {
        const r = window.__gridSpy?.api?.getDisplayedRowCount?.() ?? -1;
        const applies = window.__gridSpy?.report?.()?.calls?.applyTransactionAsync ?? '';
        window.__gridSpy?.reset?.();
        return `${r},${String(applies).split('x')[0].trim()}`;
      }));
    } catch {
      grid.push('-1,');
    }
  }
  const line = `${minute},${heaps.join(',')},${grid.join(',')}`;
  fs.appendFileSync(out, line + '\n');
  console.log(`[soak +${minute}m elapsed=${Math.round((Date.now() - t0) / 60000)}m] heapMB ${heaps.join(' | ')} grid ${grid.join(' | ')}`);
}
console.log('soak complete');
cdp.close();
await browser.close();
