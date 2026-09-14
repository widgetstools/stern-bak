// CPU-profile the main thread during scroll steps and measure render cost per row scrolled.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('playwright');
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.SSRM_PERF_OUT ?? join(HERE, 'out');
mkdirSync(OUT, { recursive: true });
const src = readFileSync(join(HERE, 'ssrm-validate.mjs'), 'utf8');
const INIT = src.slice(src.indexOf('const INIT = `') + 'const INIT = `'.length, src.indexOf('`;\n\n//'));
const URL = process.env.APP_URL ?? 'http://localhost:5215/';
const TAG = process.env.TAG ?? 'prod';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (x) => Math.round(x * 10) / 10;

function aggregate(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  let total = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const dt = profile.timeDeltas[i] ?? 0; total += dt;
    self.set(profile.samples[i], (self.get(profile.samples[i]) ?? 0) + dt);
  }
  const byFn = new Map(); const byUrl = new Map();
  for (const [id, us] of self) {
    const n = byId.get(id); if (!n) continue;
    const cf = n.callFrame; const url = (cf.url || '(native)').split('/').pop().replace(/-[A-Za-z0-9_]{8}\.js$/, '.js');
    const fn = `${cf.functionName || '(anonymous)'} @ ${url}:${cf.lineNumber}`;
    byFn.set(fn, (byFn.get(fn) ?? 0) + us);
    byUrl.set(url, (byUrl.get(url) ?? 0) + us);
  }
  const top = (m, k) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([name, us]) => ({ name, ms: rnd(us / 1000), pct: rnd((100 * us) / total) }));
  return { totalMs: rnd(total / 1000), byUrl: top(byUrl, 12), byFn: top(byFn, 30) };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ssrm?.getRows.some((g) => g.ok && g.rows > 0) && document.querySelectorAll('.ag-grid-scrolling-container .ag-row:not(.ag-row-loading)').length > 5, null, { timeout: 120000 });
  await sleep(2000);

  // 1. render cost per rows scrolled (unsorted, blocks pre-warmed by a first pass)
  const perRow = [];
  for (const pass of [0, 1]) {
    for (const n of [1, 5, 10, 20, 27, 60]) {
      const r = await page.evaluate(async (rows) => {
        const S = window.__ssrm; const vp = document.querySelector('.ag-grid-viewport');
        await new Promise((r) => setTimeout(r, 400));
        const lt0 = S.longTasks.length; const g0 = S.getRows.length;
        const t0 = performance.now();
        vp.scrollTop += rows * 30;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const tFrame = performance.now() - t0;
        await new Promise((r) => setTimeout(r, 400));
        const lts = S.longTasks.slice(lt0).map((l) => l.d);
        return { rows, msToSecondFrame: Math.round(tFrame), longTasks: lts.map(Math.round), requests: S.getRows.length - g0 };
      }, n);
      if (pass === 1) perRow.push(r);
    }
    await page.evaluate(() => { document.querySelector('.ag-grid-viewport').scrollTop = 0; });
    await sleep(800);
  }
  console.log('\n[renderCostPerRowsScrolled]', JSON.stringify(perRow));

  // 2. CPU profile during a 10-step drag (unsorted) + mid-drag screenshot
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 250 });
  await page.evaluate(() => { document.querySelector('.ag-grid-viewport').scrollTop = 0; });
  await sleep(800);
  await cdp.send('Profiler.start');
  const dragPromise = page.evaluate(async () => {
    const vp = document.querySelector('.ag-grid-viewport');
    for (let i = 1; i <= 10; i++) { vp.scrollTop = i * 24000; await new Promise((r) => setTimeout(r, 80)); }
  });
  await sleep(150);
  await page.screenshot({ path: join(OUT, `ssrm-${TAG}-mid-drag.png`) });
  await dragPromise;
  await sleep(300);
  const { profile } = await cdp.send('Profiler.stop');
  const agg = aggregate(profile);
  console.log('\n[profile.drag.byUrl]', JSON.stringify(agg.byUrl));
  console.log('\n[profile.drag.byFn]'); for (const f of agg.byFn) console.log(`  ${String(f.pct).padStart(5)}%  ${String(f.ms).padStart(7)}ms  ${f.name}`);

  // 3. CPU profile at idle, unsorted (ticks only) for 5s
  await page.evaluate(() => { document.querySelector('.ag-grid-viewport').scrollTop = 0; });
  await sleep(1000);
  await cdp.send('Profiler.start'); await sleep(5000); const idle = aggregate((await cdp.send('Profiler.stop')).profile);
  console.log('\n[profile.idleUnsorted.byUrl]', JSON.stringify(idle.byUrl));
  console.log('\n[profile.idleUnsorted.byFn]'); for (const f of idle.byFn.slice(0, 15)) console.log(`  ${String(f.pct).padStart(5)}%  ${String(f.ms).padStart(7)}ms  ${f.name}`);

  // 4. CPU profile at idle, sorted (refresh storm) for 5s
  await page.click('.ag-header-cell[col-id="positionId"] .ag-header-cell-label'); await sleep(1500);
  await cdp.send('Profiler.start'); await sleep(5000); const sorted = aggregate((await cdp.send('Profiler.stop')).profile);
  console.log('\n[profile.idleSorted.byUrl]', JSON.stringify(sorted.byUrl));
  console.log('\n[profile.idleSorted.byFn]'); for (const f of sorted.byFn.slice(0, 15)) console.log(`  ${String(f.pct).padStart(5)}%  ${String(f.ms).padStart(7)}ms  ${f.name}`);

  writeFileSync(join(OUT, `ssrm-profile-${TAG}.json`), JSON.stringify({ perRow, drag: agg, idle, sorted }, null, 2));
  await browser.close();
})().catch((e) => { console.error('PROFILE FAILED', e); process.exit(1); });
