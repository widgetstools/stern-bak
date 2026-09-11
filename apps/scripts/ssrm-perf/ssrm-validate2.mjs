// Follow-up harness: production-build scroll profiles, synthetic update on a
// visible column, selection header probe. Reuses the INIT hook from harness 1.
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
const out = { url: URL, tag: TAG, startedAt: new Date().toISOString(), scenarios: {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (x) => (x == null ? null : Math.round(x * 10) / 10);
const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const stats = (arr) => ({ n: arr.length, p50: rnd(pct(arr, 50)), p95: rnd(pct(arr, 95)), max: rnd(arr.length ? Math.max(...arr) : null), sum: rnd(arr.reduce((a, b) => a + b, 0)) });

const RUN_SCROLL = async ({ steps, intervalMs, settleMs, sampleMs, from, to }) => {
  const vp = document.querySelector('.ag-grid-viewport');
  const S = window.__ssrm;
  const samples = [];
  const isEmpty = (r) => [...r.querySelectorAll('.ag-cell')].every((c) => !c.textContent.trim());
  const sample = (phase) => {
    const rows = [...document.querySelectorAll('.ag-grid-scrolling-container .ag-row')];
    const vpRect = vp.getBoundingClientRect();
    const visible = rows.filter((r) => { const b = r.getBoundingClientRect(); return b.bottom > vpRect.top && b.top < vpRect.bottom; });
    samples.push({ t: performance.now(), phase, scrollTop: vp.scrollTop, visible: visible.length,
      blank: visible.filter((r) => r.classList.contains('ag-row-loading') || isEmpty(r)).length, inflight: S.pending.size });
  };
  const start = performance.now();
  const g0 = S.getRows.length; const lt0 = S.longTasks.length;
  const total = to - from;
  let frames = 0; let rafId; const raf = () => { frames++; rafId = requestAnimationFrame(raf); }; rafId = requestAnimationFrame(raf);
  const timer = setInterval(() => sample('scroll'), sampleMs);
  const stepTimes = [];
  for (let i = 1; i <= steps; i++) {
    const s0 = performance.now();
    vp.scrollTop = from + (total * i) / steps;
    await new Promise((r) => setTimeout(r, intervalMs));
    stepTimes.push(performance.now() - s0);
  }
  const scrollEnd = performance.now();
  clearInterval(timer);
  const settleTimer = setInterval(() => sample('settle'), sampleMs);
  await new Promise((r) => setTimeout(r, settleMs));
  clearInterval(settleTimer); cancelAnimationFrame(rafId);
  sample('final');
  const during = S.getRows.slice(g0);
  const firstClean = samples.find((s) => s.t >= scrollEnd && s.blank === 0);
  return {
    plannedMs: steps * intervalMs, actualScrollMs: scrollEnd - start, framesDuringScroll: frames,
    stepOverrunRaw: stepTimes.map((t) => t - intervalMs),
    requests: during.length, latencyRaw: during.map((r) => r.ms),
    longTasksRaw: S.longTasks.slice(lt0).map((l) => l.d),
    blankSampleFrac: samples.length ? samples.filter((s) => s.blank > 0).length / samples.length : null,
    peakBlankFrac: Math.max(0, ...samples.map((s) => s.visible ? s.blank / s.visible : 0)),
    timeToCleanAfterStopMs: firstClean ? firstClean.t - scrollEnd : null,
    maxInflight: Math.max(...samples.map((s) => s.inflight)),
    samples,
  };
};

const RESET = () => { const S = window.__ssrm; S.getRows.length = 0; S.ticks.length = 0; S.rpcOther.length = 0; S.longTasks.length = 0; };
const READ = () => { const S = window.__ssrm; return { getRows: S.getRows.map((r) => ({ ...r })), ticks: S.ticks.length, up: S.ticks.reduce((a, t) => a + t.up, 0), longTasks: S.longTasks.map((l) => l.d), other: S.rpcOther.length }; };

async function scroll(page, label, opts) {
  await page.evaluate(() => { document.querySelector('.ag-grid-viewport').scrollTop = 0; });
  await sleep(1200);
  const vp = await page.evaluate(() => { const v = document.querySelector('.ag-grid-viewport'); return { h: v.scrollHeight, c: v.clientHeight }; });
  const raw = await page.evaluate(RUN_SCROLL, { ...opts, from: 0, to: opts.to ?? vp.h - vp.c });
  const { stepOverrunRaw, latencyRaw, longTasksRaw, ...rest } = raw;
  const res = { ...rest, stepOverrunMs: stats(stepOverrunRaw), requestLatencyMs: stats(latencyRaw), longTasks: stats(longTasksRaw) };
  out.scenarios[label] = res;
  const { samples, ...summary } = res;
  console.log(`\n[${label}]`, JSON.stringify(summary));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ssrm?.getRows.some((g) => g.ok && g.rows > 0) && document.querySelectorAll('.ag-grid-scrolling-container .ag-row:not(.ag-row-loading)').length > 5, null, { timeout: 120000 });
  out.scenarios.cold = { wallMsToFirstRows: Date.now() - t0, blocks: (await page.evaluate(READ)).getRows.map((g) => ({ start: g.start, ms: rnd(g.ms), rows: g.rows, rowCount: g.rowCount })) };
  console.log('\n[cold]', JSON.stringify(out.scenarios.cold));
  await sleep(1500);

  // idle baseline
  await page.evaluate(RESET); await sleep(5000);
  const idle = await page.evaluate(READ);
  out.scenarios.idle5s = { getRows: idle.getRows.length, ticks: idle.ticks, upserts: idle.up, longTasks: stats(idle.longTasks), otherRpc: idle.other };
  console.log('\n[idle5s]', JSON.stringify(out.scenarios.idle5s));

  // scroll profiles, unsorted
  await scroll(page, 'dragUnsorted', { steps: 25, intervalMs: 80, settleMs: 2500, sampleMs: 40 });
  await scroll(page, 'wheelUnsorted', { steps: 100, intervalMs: 16, settleMs: 2500, sampleMs: 32, to: 60000 });

  // synthetic tick on a visible column
  await page.evaluate(() => { document.querySelector('.ag-grid-viewport').scrollTop = 0; });
  await sleep(1200);
  const synth = await page.evaluate(async () => {
    const S = window.__ssrm; const port = S.ports[0]; const subId = S.subIds[S.subIds.length - 1];
    const rows = [...document.querySelectorAll('.ag-grid-scrolling-container .ag-row:not(.ag-row-loading)')];
    const pick = rows[2]; const victim = rows[3];
    const readRow = (row) => { const o = {}; for (const c of row.querySelectorAll('.ag-cell[col-id]')) { const k = c.getAttribute('col-id'); if (k.startsWith('ag-Grid')) continue; const t = c.textContent.trim(); const n = Number(t.replace(/,/g, '')); o[k] = t !== '' && /^[\d,.\-]+$/.test(t) && Number.isFinite(n) ? n : t; } return o; };
    const pickId = pick.getAttribute('row-id'); const victimId = victim.getAttribute('row-id');
    const before = document.querySelector(`.ag-row[row-id="${pickId}"] .ag-cell[col-id="marketValue"]`)?.textContent?.trim();
    const updated = { ...readRow(pick), positionId: pickId, marketValue: 987654321 };
    const inserted = { ...readRow(pick), positionId: 'ZZ-SYNTH-0001', ticker: 'SYNTH', desk: 'SYNTH-DESK', trader: 'SYNTH', marketValue: 1 };
    port.dispatchEvent(new MessageEvent('message', { data: { kind: 'ssrm-tick', subId, payload: { kind: 'rowDelta', upserts: [updated, inserted], removals: [victimId] } } }));
    await new Promise((r) => setTimeout(r, 1500));
    return {
      pickId, victimId, marketValueBefore: before,
      marketValueAfter: document.querySelector(`.ag-row[row-id="${pickId}"] .ag-cell[col-id="marketValue"]`)?.textContent?.trim(),
      victimStillRendered: !!document.querySelector(`.ag-row[row-id="${victimId}"]`),
      insertRendered: !!document.querySelector('.ag-row[row-id="ZZ-SYNTH-0001"]'),
      status: document.querySelector('.ag-status-bar')?.textContent?.replace(/\s+/g, ' ').trim(),
    };
  });
  out.scenarios.syntheticTick = synth; console.log('\n[syntheticTick]', JSON.stringify(synth));

  // selection header probe + select-all
  const selHtml = await page.evaluate(() => document.querySelector('.ag-header-cell[col-id="ag-Grid-SelectionColumn"]')?.innerHTML?.slice(0, 600) ?? null);
  out.scenarios.selectionHeaderHtml = selHtml;
  const cb = await page.$('.ag-header-cell[col-id="ag-Grid-SelectionColumn"] .ag-checkbox-input, .ag-header-cell[col-id="ag-Grid-SelectionColumn"] input, .ag-header-cell[col-id="ag-Grid-SelectionColumn"] .ag-checkbox');
  if (cb) {
    await cb.click({ force: true }); await sleep(1500);
    out.scenarios.selectAll = await page.evaluate(() => ({
      status: document.querySelector('.ag-status-bar')?.textContent?.replace(/\s+/g, ' ').trim(),
      selectedRendered: document.querySelectorAll('.ag-grid-scrolling-container .ag-row.ag-row-selected').length,
      rendered: document.querySelectorAll('.ag-grid-scrolling-container .ag-row').length,
    }));
    await page.screenshot({ path: join(OUT, `ssrm-${TAG}-selectall.png`) });
    await cb.click({ force: true }); await sleep(500);
  } else {
    out.scenarios.selectAll = { error: 'no checkbox found', selHtml };
  }
  console.log('\n[selectAll]', JSON.stringify(out.scenarios.selectAll));

  // sorted storm + sorted scroll profiles
  await page.evaluate(() => { document.querySelector('.ag-grid-viewport').scrollTop = 0; });
  await page.click('.ag-header-cell[col-id="positionId"] .ag-header-cell-label'); await sleep(1500);
  await page.evaluate(RESET); await sleep(5000);
  const st = await page.evaluate(READ);
  out.scenarios.idleSorted5s = { getRows: st.getRows.length, latency: stats(st.getRows.map((g) => g.ms)), ticks: st.ticks, upserts: st.up, longTasks: stats(st.longTasks) };
  console.log('\n[idleSorted5s]', JSON.stringify(out.scenarios.idleSorted5s));
  await scroll(page, 'dragSorted', { steps: 25, intervalMs: 80, settleMs: 2500, sampleMs: 40 });
  await scroll(page, 'wheelSorted', { steps: 100, intervalMs: 16, settleMs: 2500, sampleMs: 32, to: 60000 });
  // refresh volume with many blocks loaded: sit at the bottom after a scroll and count for 5s
  await page.evaluate(RESET); await sleep(5000);
  const st2 = await page.evaluate(READ);
  out.scenarios.idleSortedManyBlocks5s = { getRows: st2.getRows.length, distinctBlocks: new Set(st2.getRows.map((g) => g.start)).size, latency: stats(st2.getRows.map((g) => g.ms)) };
  console.log('\n[idleSortedManyBlocks5s]', JSON.stringify(out.scenarios.idleSortedManyBlocks5s));

  await page.screenshot({ path: join(OUT, `ssrm-${TAG}-final.png`) });
  writeFileSync(join(OUT, `ssrm-validate2-${TAG}.json`), JSON.stringify(out, null, 2));
  await browser.close();
})().catch((e) => { console.error('HARNESS2 FAILED', e); writeFileSync(join(OUT, `ssrm-validate2-${TAG}.json`), JSON.stringify({ ...out, error: String(e) }, null, 2)); process.exit(1); });
