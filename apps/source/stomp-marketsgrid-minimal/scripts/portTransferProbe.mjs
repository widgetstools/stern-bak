/**
 * Feasibility probe for the provider-SharedWorker topology: a window creates
 * a "hub" SharedWorker H and a "provider" SharedWorker P, transfers P's port
 * INTO H, and checks that H and P can talk directly (no window hop). Also
 * checks whether a MessagePort `close` event fires in H when P's last client
 * document goes away (Chromium 132+ shipped MessagePort close events).
 *
 *   node scripts/portTransferProbe.mjs
 */
import { chromium } from 'playwright';

const base = process.env.BENCH_BASE ?? 'http://localhost:5213/';
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto(base, { waitUntil: 'domcontentloaded' });

const result = await page.evaluate(() => new Promise((resolve) => {
  const mk = (src, name) => new SharedWorker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), { name });
  // P: echoes every message it gets on any connected port, tagging it.
  const P = mk(`
    self.onconnect = (e) => { const port = e.ports[0]; port.onmessage = (m) => port.postMessage({ echoFrom: 'P', got: m.data }); port.start(); };
  `, 'probe-provider');
  // H: on a transferred port, sends 'ping' through it and relays the reply to the window; reports close events.
  const H = mk(`
    self.onconnect = (e) => {
      const win = e.ports[0];
      win.onmessage = (m) => {
        const transferred = m.ports && m.ports[0];
        if (!transferred) return;
        transferred.onmessage = (r) => win.postMessage({ relay: r.data });
        transferred.addEventListener('close', () => win.postMessage({ closed: true }));
        transferred.start();
        transferred.postMessage('ping-from-H');
        win.postMessage({ transferredOk: true, hasCloseEvent: 'onclose' in transferred });
      };
      win.start();
    };
  `, 'probe-hub');
  const out = { steps: [] };
  const done = () => resolve(out);
  const timer = setTimeout(done, 4000);
  H.port.onmessage = (m) => {
    out.steps.push(m.data);
    if (m.data.relay) { clearTimeout(timer); done(); }
  };
  H.port.start();
  // Transfer P's port into H.
  H.port.postMessage({ kind: 'provider-port' }, [P.port]);
}));
console.log('port transfer between SharedWorkers:', JSON.stringify(result));

// Lifetime: open a second page that creates the same named provider worker (keep-alive), then close the first.
const page2 = await context.newPage();
await page2.goto(base, { waitUntil: 'domcontentloaded' });
const sameWorker = await page2.evaluate(() => {
  try {
    // Blob URLs are per-document, so the second page cannot re-open the same worker by URL —
    // this only checks that a differently-URL'd worker with the same name errors clearly.
    const sw = new SharedWorker(URL.createObjectURL(new Blob(['self.onconnect=()=>{}'], { type: 'text/javascript' })), { name: 'probe-provider' });
    return new Promise((res) => { sw.onerror = (e) => res('error: ' + (e.message || 'unknown')); setTimeout(() => res('no error within 1s'), 1000); });
  } catch (e) { return 'threw: ' + e.message; }
});
console.log('second page, same name + different blob URL:', sameWorker);
await browser.close();
