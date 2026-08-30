/**
 * Diagnostic: can the hub SharedWorker spawn nested workers here, and is
 * the served hub asset the build with the embedded provider worker?
 * Also captures the SharedWorker's console output around a provider start.
 *
 *   node scripts/subworkerProbe.mjs
 */
import { chromium } from 'playwright';
import WebSocketMod from 'ws';
const WebSocket = WebSocketMod.WebSocket ?? WebSocketMod;

const base = process.env.BENCH_BASE ?? 'http://localhost:5213/';
const DEBUG_PORT = 9342;

async function cdpConnect(wsUrl) {
  const ws = new WebSocket(wsUrl, { maxPayload: 512 * 1024 * 1024 });
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

const browser = await chromium.launch({ headless: false, args: [`--remote-debugging-port=${DEBUG_PORT}`] });
const context = await browser.newContext();
const page = await context.newPage();
// Load WITHOUT a provider first so we can attach CDP to the hub before any provider starts.
await page.goto(`${base}?tag=PROBE&rate=100&batch=10&dataPlane=subworker&gridspy`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => !!window.__gridSpy?.api, null, { timeout: 60_000 });

const version = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`)).json();
const cdp = await cdpConnect(version.webSocketDebuggerUrl);
const { targetInfos } = await cdp.send('Target.getTargets');
const sw = targetInfos.find((t) => t.type === 'shared_worker');
console.log('shared worker url:', sw?.url);
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: sw.targetId, flatten: true });
const logs = [];
cdp.on((m) => {
  if (m.sessionId !== sessionId) return;
  if (m.method === 'Runtime.consoleAPICalled') logs.push(`[console.${m.params.type}] ${m.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
  if (m.method === 'Log.entryAdded') logs.push(`[log.${m.params.entry.level}] ${m.params.entry.text}`);
  if (m.method === 'Runtime.exceptionThrown') logs.push(`[exception] ${m.params.exceptionDetails.text} ${m.params.exceptionDetails.exception?.description ?? ''}`);
});
await cdp.send('Runtime.enable', {}, sessionId);
await cdp.send('Log.enable', {}, sessionId);

const evalIn = async (expr) => {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
  return r.exceptionDetails ? `EXC ${r.exceptionDetails.text}` : r.result.value;
};
console.log('typeof Worker in SharedWorker:', await evalIn('typeof Worker'));
console.log('typeof URL.createObjectURL:', await evalIn('typeof URL.createObjectURL'));
console.log('nested blob worker:', await evalIn(`new Promise((res) => { try { const u = URL.createObjectURL(new Blob(['self.postMessage(42)'], { type: 'text/javascript' })); const w = new Worker(u, { name: 'probe' }); w.onmessage = (e) => res('spawned, got ' + e.data); w.onerror = (e) => res('error event: ' + (e.message || 'unknown')); setTimeout(() => res('timeout (no message)'), 3000); } catch (e) { res('threw: ' + e.message); } })`));

// Is the served hub asset the embedded build?
const assetUrl = await page.evaluate(() => performance.getEntriesByType('resource').map((e) => e.name).find((n) => /data-services-worker/.test(n)) ?? null);
console.log('hub asset url (page resources):', assetUrl ?? '(not in resource timing — SharedWorker fetch is not attributed to the page)');
const swUrl = sw?.url;
if (swUrl) {
  const text = await (await fetch(swUrl)).text();
  console.log(`served hub asset: ${(text.length / 1024).toFixed(0)} KB, embedded provider worker: ${/PROVIDER_WORKER_SOURCE = ['"]/.test(text)}`);
}

// Now trigger a provider start with dataPlane=subworker in a second tab and watch the hub console.
const page2 = await context.newPage();
await page2.goto(`${base}?tag=PROBE2&rate=100&batch=10&dataPlane=subworker&gridspy`, { waitUntil: 'domcontentloaded' });
await page2.waitForFunction(() => (window.__gridSpy?.api?.getDisplayedRowCount?.() ?? 0) > 0, null, { timeout: 60_000 }).catch(() => {});
await new Promise((r) => setTimeout(r, 2000));
const { targetInfos: after } = await cdp.send('Target.getTargets');
console.log('targets now:', after.map((t) => `${t.type}:${(t.title || t.url).slice(0, 40)}`).join(' | '));
console.log('hub console since attach:');
for (const l of logs) console.log('  ' + l.slice(0, 220));
cdp.close();
await browser.close();
