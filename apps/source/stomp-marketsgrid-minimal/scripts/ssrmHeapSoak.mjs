/**
 * Heap-boundedness soak for the SSRM replica: open the blotter in SSRM mode
 * under a heavy feed and sample the page's JS heap over time. Guards the
 * class of leak where a producer outruns the engine and something queues
 * unboundedly (the original "Aw, Snap! — Out of Memory" after minutes at
 * 20k rows/s).
 *
 *   node scripts/ssrmHeapSoak.mjs [minutes] [rate]
 *
 * Verdict: prints MB samples and the slope over the post-warmup window.
 * A bounded system settles to ~flat (GC sawtooth aside); sustained growth
 * of many MB/min means something is queuing.
 */
import { chromium } from 'playwright';

const minutes = Number(process.argv[2] ?? 8);
const rate = process.argv[3] ?? '20000';
const url = `http://localhost:5213/?tag=SOAK&rate=${rate}&batch=50&gridspy&ssrm`;

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-precise-memory-info'],
});
const page = await browser.newPage();
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
console.log(`[ssrm rate=${rate}] grid full — soaking ${minutes}min, sampling every 15s`);

const samples = [];
const t0 = Date.now();
while (Date.now() - t0 < minutes * 60000) {
  await new Promise((r) => setTimeout(r, 15000));
  try {
    const s = await page.evaluate(() => ({
      mb: Math.round((performance.memory?.usedJSHeapSize ?? 0) / 1048576),
      rows: window.__gridSpy?.api?.getDisplayedRowCount?.() ?? -1,
    }));
    const t = Math.round((Date.now() - t0) / 1000);
    samples.push({ t, mb: s.mb });
    console.log(`t+${t}s heap=${s.mb}MB rows=${s.rows}`);
  } catch (err) {
    console.log('sample failed (page gone?):', String(err).slice(0, 120));
    break;
  }
}

if (samples.length >= 4) {
  // Slope over the post-warmup window (skip the first quarter).
  const window = samples.slice(Math.floor(samples.length / 4));
  const n = window.length;
  const mt = window.reduce((a, s) => a + s.t, 0) / n;
  const mm = window.reduce((a, s) => a + s.mb, 0) / n;
  const slope =
    window.reduce((a, s) => a + (s.t - mt) * (s.mb - mm), 0) /
    Math.max(1, window.reduce((a, s) => a + (s.t - mt) ** 2, 0));
  const perMin = slope * 60;
  console.log(`\npost-warmup heap slope: ${perMin.toFixed(2)} MB/min over ${n} samples`);
  // Only sustained UPWARD drift is a leak; a negative slope is GC winning.
  console.log(perMin < 2 ? 'VERDICT: bounded' : 'VERDICT: GROWING — investigate');
}
await browser.close();
