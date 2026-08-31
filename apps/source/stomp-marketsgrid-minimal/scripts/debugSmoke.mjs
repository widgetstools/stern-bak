/**
 * Debug smoke: open one provider page and mirror EVERY console line from
 * the page, the hub SharedWorker and any provider SharedWorkers, plus
 * page errors — then report the grid row count. For chasing end-to-end
 * regressions the in-process suites cannot see.
 *
 *   node scripts/debugSmoke.mjs [rate] [seconds] [plane]
 */
import { chromium } from 'playwright';
import WebSocketMod from 'ws';
const WebSocket = WebSocketMod.WebSocket ?? WebSocketMod;

const rate = Number(process.argv[2] ?? 2000);
const seconds = Number(process.argv[3] ?? 25);
const plane = process.argv[4] ?? 'subworker';
const DEBUG_PORT = 9346;

const browser = await chromium.launch({ headless: true, args: [`--remote-debugging-port=${DEBUG_PORT}`] });
const context = await browser.newContext();
const page = await context.newPage();
page.on('console', (m) => console.log(`[page:${m.type()}] ${m.text().slice(0, 220)}`));
page.on('pageerror', (e) => console.log(`[page:ERROR] ${String(e).slice(0, 300)}`));
await page.goto(`http://localhost:5213/?tag=SMOKE&rate=${rate}&batch=50&dataPlane=${plane}&gridspy`, { waitUntil: 'domcontentloaded', timeout: 60_000 });

async function cdpConnect(wsUrl) {
  const ws = new WebSocket(wsUrl, { maxPayload: 64 * 1024 * 1024 });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  let nextId = 1; const pending = new Map(); const listeners = new Set();
  ws.on('message', (d) => {
    const m = JSON.parse(d.toString());
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
    else if (m.method) for (const l of listeners) l(m);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  return { send, on: (l) => listeners.add(l), close: () => ws.close() };
}

const version = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json();
const cdp = await cdpConnect(version.webSocketDebuggerUrl);
const names = new Map();
cdp.on((m) => {
  if (m.method === 'Runtime.consoleAPICalled') {
    const text = m.params.args.map((a) => a.value ?? a.description ?? '').join(' ');
    console.log(`[${names.get(m.sessionId) ?? 'worker'}:${m.params.type}] ${text.slice(0, 260)}`);
  }
  if (m.method === 'Runtime.exceptionThrown') {
    console.log(`[${names.get(m.sessionId) ?? 'worker'}:EXCEPTION] ${JSON.stringify(m.params.exceptionDetails).slice(0, 300)}`);
  }
});

async function attachWorkers() {
  const { targetInfos } = await cdp.send('Target.getTargets');
  for (const t of targetInfos.filter((x) => x.type === 'shared_worker')) {
    if ([...names.values()].some((n) => n.includes(t.targetId.slice(0, 6)))) continue;
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: t.targetId, flatten: true });
    const label = `${/starui-provider/.test(t.title) ? 'provider' : 'hub'}:${t.targetId.slice(0, 6)}`;
    names.set(sessionId, label);
    await cdp.send('Runtime.enable', {}, sessionId);
    console.log(`--- attached ${label} (${t.title})`);
  }
}

for (let i = 0; i < seconds; i++) {
  await attachWorkers();
  await new Promise((r) => setTimeout(r, 1000));
  if (i % 5 === 4) {
    const rows = await page.evaluate(() => window.__gridSpy?.api?.getDisplayedRowCount?.() ?? -1).catch(() => -2);
    console.log(`=== t+${i + 1}s grid rows: ${rows}`);
  }
}
cdp.close();
await browser.close();
