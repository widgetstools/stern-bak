/**
 * Memory-boundedness soak for the SSRM replica: open the blotter in SSRM
 * mode under a heavy feed and sample memory at THREE levels —
 *
 *   pageMB     the page isolate's JS heap (performance.memory)
 *   workerMB   every attached worker isolate's JS heap (CDP getHeapUsage) —
 *              the Perspective engine's JS side lives here
 *   procMB     each browser OS process's working set (CDP SystemInfo → OS
 *              pids → PowerShell) — the only view that includes the engine's
 *              WASM linear memory, which no JS-heap metric sees
 *
 * A flat page heap with a growing renderer working set means the engine
 * (worker/wasm) is accumulating — the layer a plain performance.memory soak
 * is blind to.
 *
 *   node scripts/ssrmHeapSoak.mjs [minutes] [rate] [ssrm|csrm] [hidden]
 *
 * The csrm arm is the control: no Perspective in the window at all, so any
 * growth it shows is AG Grid / DOM / wire-decode, not the engine.
 *
 * `hidden` reproduces a BACKGROUNDED tab's regime by EMULATION: after the
 * grid loads, the page's `setTimeout`/`setInterval` are floored to 60s and
 * `requestAnimationFrame` is suspended — which is what Chromium's intensive
 * background throttling does to a hidden tab — while MessagePort delivery
 * keeps streaming at full rate, exactly as it does for real. Emulation
 * because DRIVING real visibility under automation failed three ways:
 * headless has no tab visibility at all, headed Playwright gives every page
 * its own window (focusing another hides nothing), and even CDP
 * `Browser.setWindowBounds` minimize left `visibilityState` 'visible'.
 * Every sample reports a 1s-interval tick delta (created AFTER the wrap) as
 * PROOF of the regime: ≈15/sample unthrottled, ~0 under the emulation.
 */
import { execFile } from 'node:child_process';
import { chromium } from 'playwright';

const minutes = Number(process.argv[2] ?? 8);
const rate = process.argv[3] ?? '20000';
const mode = process.argv[4] ?? 'ssrm';
const hidden = process.argv[5] === 'hidden';
const url = `http://localhost:5213/?tag=SOAK&rate=${rate}&batch=50&gridspy${mode === 'ssrm' ? '&ssrm' : ''}`;

function processWorkingSets(pids) {
  return new Promise((resolve) => {
    execFile(
      'powershell',
      ['-NoProfile', '-Command', `Get-Process -Id ${pids.join(',')} -ErrorAction SilentlyContinue | Select-Object Id,WorkingSet64 | ConvertTo-Json -Compress`],
      { timeout: 15000 },
      (err, stdout) => {
        if (err || !stdout.trim()) return resolve(new Map());
        try {
          const parsed = JSON.parse(stdout);
          const rows = Array.isArray(parsed) ? parsed : [parsed];
          resolve(new Map(rows.map((r) => [r.Id, Math.round(r.WorkingSet64 / 1048576)])));
        } catch {
          resolve(new Map());
        }
      },
    );
  });
}

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-precise-memory-info'],
});
const context = await browser.newContext();
const page = await context.newPage();
page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 200)));
page.on('crash', () => {
  console.log('!!! PAGE CRASHED (renderer died — the exact failure this soak guards)');
  process.exitCode = 1;
});
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(
  () => (window.__gridSpy?.api?.getDisplayedRowCount?.() ?? 0) > 19000,
  undefined,
  { timeout: 90000 },
);

if (hidden) {
  // Emulate intensive background throttling: floor page timers to 60s and
  // suspend rAF. Ports and microtasks stay untouched — as in a real hidden
  // tab. Applied AFTER load, like a user backgrounding a warmed-up blotter.
  await page.evaluate(() => {
    const realSetTimeout = window.setTimeout.bind(window);
    const realSetInterval = window.setInterval.bind(window);
    window.__soakThrottleWrap = true;
    window.setTimeout = (fn, delay, ...args) => realSetTimeout(fn, Math.max(delay ?? 0, 60000), ...args);
    window.setInterval = (fn, delay, ...args) => realSetInterval(fn, Math.max(delay ?? 0, 60000), ...args);
    window.requestAnimationFrame = () => 0;
  });
  console.log('emulated hidden-tab throttling ACTIVE (timers floored to 60s, rAF suspended; ports untouched)');
}

// 1s heartbeat inside the page — created AFTER any throttle wrap, so its
// per-sample delta PROVES which regime the page's timers are actually in.
await page.evaluate(() => {
  window.__soakTick = 0;
  window.setInterval(() => {
    window.__soakTick++;
  }, 1000);
});

// Attach to the page's workers (Perspective engine included) for isolate heaps.
const cdp = await context.newCDPSession(page);
const workerSessions = new Map();
cdp.on('Target.attachedToTarget', ({ sessionId, targetInfo }) => {
  if (targetInfo.type === 'worker') workerSessions.set(sessionId, targetInfo.url.split('/').pop());
});
cdp.on('Target.detachedFromTarget', ({ sessionId }) => workerSessions.delete(sessionId));
await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });

async function workerHeapsMB() {
  let total = 0;
  for (const sessionId of workerSessions.keys()) {
    try {
      const { usedSize } = await cdp.send('Runtime.getHeapUsage', undefined, sessionId);
      total += usedSize;
    } catch {
      /* worker gone */
    }
  }
  return Math.round(total / 1048576);
}

// OS pids of every browser process (renderer working set includes wasm memory).
const bcdp = await browser.newBrowserCDPSession();
async function browserPids() {
  try {
    const { processInfo } = await bcdp.send('SystemInfo.getProcessInfo');
    return processInfo.map((p) => ({ type: p.type, pid: p.id }));
  } catch {
    return [];
  }
}

console.log(`[${mode}${hidden ? '+hidden(emulated)' : ''} rate=${rate}] grid full — soaking ${minutes}min, sampling every 15s`);
const samples = [];
const t0 = Date.now();
let lastTick = 0;
while (Date.now() - t0 < minutes * 60000) {
  await new Promise((r) => setTimeout(r, 15000));
  try {
    const s = await page.evaluate(() => ({
      pageMB: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576),
      rows: window.__gridSpy?.api?.getDisplayedRowCount?.() ?? -1,
      tick: window.__soakTick ?? -1,
    }));
    const workerMB = await workerHeapsMB();
    const procs = await browserPids();
    const ws = await processWorkingSets(procs.map((p) => p.pid));
    const renderers = procs
      .filter((p) => p.type === 'renderer')
      .map((p) => ws.get(p.pid) ?? 0);
    const rendererMB = Math.max(0, ...renderers);
    const t = Math.round((Date.now() - t0) / 1000);
    const tickDelta = s.tick - lastTick;
    lastTick = s.tick;
    samples.push({ t, pageMB: s.pageMB, workerMB, rendererMB });
    console.log(
      `t+${t}s page=${s.pageMB}MB workers=${workerMB}MB rendererWS=${rendererMB}MB rows=${s.rows} ticks=${tickDelta}/sample`,
    );
  } catch (err) {
    console.log('sample failed (page gone?):', String(err).slice(0, 140));
    break;
  }
}

function slopePerMin(key) {
  const window = samples.slice(Math.floor(samples.length / 4));
  const n = window.length;
  if (n < 3) return NaN;
  const mt = window.reduce((a, s) => a + s.t, 0) / n;
  const mv = window.reduce((a, s) => a + s[key], 0) / n;
  const num = window.reduce((a, s) => a + (s.t - mt) * (s[key] - mv), 0);
  const den = window.reduce((a, s) => a + (s.t - mt) ** 2, 0);
  return (num / Math.max(1, den)) * 60;
}

if (samples.length >= 4) {
  for (const key of ['pageMB', 'workerMB', 'rendererMB']) {
    const s = slopePerMin(key);
    // Only sustained UPWARD drift is a leak; a negative slope is GC winning.
    console.log(`${key} slope: ${s.toFixed(2)} MB/min ${s < 2 ? '(bounded)' : '← GROWING'}`);
  }
}
await browser.close();
