/**
 * Scroll-input jank probe: drive the grid with held-key navigation OR
 * continuous wheel scrolling for N seconds, track progression vs dispatched
 * inputs (backlog), long tasks, and a CPU profile of the page thread.
 *
 *   node keyScrollProbe.mjs [ssrm|csrm] [rate] [seconds] [keys|wheel]
 *
 * `keys`  — ArrowDown auto-repeat at ~30/s (un-coalesced keydown events;
 *           each needs a focus-move + render turn).
 * `wheel` — mouseWheel deltaY at ~30/s (browser-coalesced scroll rendering;
 *           approximates holding the scrollbar arrow / a fling).
 */
import { chromium } from 'playwright';

const mode = process.argv[2] ?? 'ssrm';
const rate = process.argv[3] ?? '20000';
const seconds = Number(process.argv[4] ?? 12);
const input = process.argv[5] ?? 'keys';
/** Extra query appended raw — e.g. `thin` for field-level thin deltas. */
const extraQuery = process.argv[6] ? `&${process.argv[6]}` : '';
const url = `http://localhost:5213/?tag=KEYS&rate=${rate}&batch=50&gridspy${mode === 'ssrm' ? '&ssrm' : ''}${extraQuery}`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.addInitScript(() => {
  window.__lt = [];
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__lt.push(Math.round(entry.duration));
    }).observe({ type: 'longtask', buffered: true });
  } catch {}
});
page.on('pageerror', (err) => console.log('[pageerror]', String(err).slice(0, 200)));
await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

await page.waitForFunction(
  () => (window.__gridSpy?.api?.getDisplayedRowCount?.() ?? 0) > 19000,
  undefined,
  { timeout: 90000 },
);
console.log(`[${mode} rate=${rate} input=${input}] grid full (${await page.evaluate(() => window.__gridSpy.api.getDisplayedRowCount())} rows)`);

// Focus a data cell so keydown targets the grid; also gives wheel a target.
await page.evaluate(() => {
  const api = window.__gridSpy.api;
  api.ensureIndexVisible(0);
  const col = api.getAllDisplayedColumns()[1];
  api.setFocusedCell(0, col.getColId());
});
await page.locator('.ag-cell').first().click({ timeout: 5000 }).catch(() => {});
const gridBox = await page.locator('.ag-root-wrapper').first().boundingBox({ timeout: 5000 }).catch(() => null);
const wheelAt = gridBox
  ? { x: gridBox.x + gridBox.width / 2, y: gridBox.y + gridBox.height / 2 }
  : { x: 400, y: 400 };
await page.evaluate(() => { window.__lt.length = 0; });

const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.start');

const t0 = Date.now();
let dispatched = 0;
const samples = [];
const progress = () =>
  page.evaluate(() => ({
    row: window.__gridSpy.api.getFocusedCell()?.rowIndex ?? -1,
    firstRow: window.__gridSpy.api.getFirstDisplayedRowIndex?.() ?? -1,
    lt: window.__lt.length,
    ltMax: Math.max(0, ...window.__lt),
  }));

while (Date.now() - t0 < seconds * 1000) {
  if (input === 'wheel') {
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel',
      x: wheelAt.x,
      y: wheelAt.y,
      deltaX: 0,
      deltaY: 600,
    });
  } else {
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: 'ArrowDown',
      code: 'ArrowDown',
      windowsVirtualKeyCode: 40,
      nativeVirtualKeyCode: 40,
      autoRepeat: dispatched > 0,
    });
  }
  dispatched++;
  await new Promise((r) => setTimeout(r, 33));
  if (dispatched % 30 === 0) {
    samples.push({ t: Math.round((Date.now() - t0) / 1000), dispatched, ...(await progress()) });
  }
}
if (input === 'keys') {
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 });
}
const { profile } = await cdp.send('Profiler.stop');

for (const s of samples) {
  const pos = input === 'wheel' ? `firstRow=${s.firstRow}` : `focusedRow=${s.row} backlog=${s.dispatched - 1 - s.row}`;
  console.log(`t+${s.t}s dispatched=${s.dispatched} ${pos} longTasks=${s.lt} maxLT=${s.ltMax}ms`);
}

// Aggregate self time per function.
const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const total = profile.samples.length;
const dt = (profile.endTime - profile.startTime) / total; // µs per sample
for (const id of profile.samples) {
  const cf = nodes.get(id)?.callFrame;
  if (!cf) continue;
  const url = (cf.url || '').split('/').slice(-2).join('/');
  const key = `${cf.functionName || '(anon)'} @ ${url}:${cf.lineNumber}`;
  self.set(key, (self.get(key) ?? 0) + 1);
}
const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18);
console.log(`\n=== top self-time (of ${Math.round((total * dt) / 1000)}ms sampled) ===`);
for (const [key, n] of top) {
  console.log(`${((n / total) * 100).toFixed(1).padStart(5)}%  ${Math.round((n * dt) / 1000).toString().padStart(5)}ms  ${key.slice(0, 110)}`);
}
await browser.close();
