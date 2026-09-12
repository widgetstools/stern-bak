// Multi-window SSRM soak: N pages on the SAME origin and browser context, so
// they share one SharedWorker, one STOMP session and one engine cache — the
// six-blotters-on-one-renderer shape from the CSRM diagnosis, scaled by
// PAGES. Reuses the INIT hook from harness 1 (worker port instrumentation).
//
//   node ssrm-multiwindow.mjs                    # 2 pages against :5215
//   PAGES=6 APP_URL=http://localhost:5215/ TAG=six node ssrm-multiwindow.mjs
//
// What it measures, per page: cold wall-time to first rows, idle RPC volume
// (should be ~zero at idle after the tick-gated pollers), long tasks while a
// SIBLING page scrolls, and cross-window edit propagation — a paste in page
// 1 must land in page 2 via the shared engine without a refresh.
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
const APP = process.env.APP_URL ?? 'http://localhost:5215/';
const TAG = process.env.TAG ?? 'multiwindow';
const PAGES = Math.max(2, Number(process.env.PAGES) || 2);
const out = { url: APP, tag: TAG, pages: PAGES, startedAt: new Date().toISOString(), scenarios: {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (x) => (x == null ? null : Math.round(x * 10) / 10);
const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const stats = (arr) => ({ n: arr.length, p50: rnd(pct(arr, 50)), p95: rnd(pct(arr, 95)), max: rnd(arr.length ? Math.max(...arr) : null) });

const RESET = () => { const S = window.__ssrm; S.getRows.length = 0; S.ticks.length = 0; S.rpcOther.length = 0; S.longTasks.length = 0; };
const READ = () => { const S = window.__ssrm; return { getRows: S.getRows.length, latency: S.getRows.map((r) => r.ms), ticks: S.ticks.length, up: S.ticks.reduce((a, t) => a + t.up, 0), longTasks: S.longTasks.map((l) => l.d), other: S.rpcOther.length }; };

const waitForRows = (page) => page.waitForFunction(
  () => window.__ssrm?.getRows.some((g) => g.ok && g.rows > 0)
    && document.querySelectorAll('.ag-grid-scrolling-container .ag-row:not(.ag-row-loading)').length > 5,
  null,
  { timeout: 120000 },
);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 850 } });
  await ctx.addInitScript(INIT);

  // ── cold, page by page: page 1 pays the snapshot; late joiners must ride
  //    the already-warm worker cache.
  const pages = [];
  const cold = [];
  for (let i = 0; i < PAGES; i += 1) {
    const page = await ctx.newPage();
    const t0 = Date.now();
    await page.goto(APP, { waitUntil: 'domcontentloaded' });
    await waitForRows(page);
    cold.push(Date.now() - t0);
    pages.push(page);
  }
  out.scenarios.coldMsPerPage = cold;
  console.log('\n[cold]', JSON.stringify(cold));

  // ── idle: every page quiet for 10 s. With tick-gated pollers an idle feed
  //    means ~zero RPCs on every page.
  await Promise.all(pages.map((p) => p.evaluate(RESET)));
  await sleep(10_000);
  const idle = await Promise.all(pages.map((p) => p.evaluate(READ)));
  out.scenarios.idle10s = idle.map((r) => ({ getRows: r.getRows, otherRpc: r.other, ticks: r.ticks, longTasks: stats(r.longTasks) }));
  console.log('\n[idle10s]', JSON.stringify(out.scenarios.idle10s));

  // ── scroll page 2 while page 1 sits still: page 1 must not pay for it.
  await Promise.all(pages.map((p) => p.evaluate(RESET)));
  await pages[1].evaluate(async () => {
    const vp = document.querySelector('.ag-grid-viewport');
    for (let i = 1; i <= 60; i += 1) {
      vp.scrollTop = (vp.scrollHeight - vp.clientHeight) * (i / 60);
      await new Promise((r) => setTimeout(r, 32));
    }
  });
  await sleep(2500);
  const cross = await Promise.all(pages.map((p) => p.evaluate(READ)));
  out.scenarios.siblingScroll = cross.map((r, i) => ({
    page: i, getRows: r.getRows, latency: stats(r.latency), longTasks: stats(r.longTasks),
  }));
  console.log('\n[siblingScroll]', JSON.stringify(out.scenarios.siblingScroll));

  // ── cross-window edit: write via page 1's provider (applyEdits RPC), then
  //    read the SAME row's cell on page 2 after the tick fans out.
  await pages[0].evaluate(() => { document.querySelector('.ag-grid-viewport').scrollTop = 0; });
  await pages[1].evaluate(() => { document.querySelector('.ag-grid-viewport').scrollTop = 0; });
  await sleep(1200);
  const edit = await pages[0].evaluate(() => {
    const row = document.querySelectorAll('.ag-grid-scrolling-container .ag-row:not(.ag-row-loading)')[2];
    const id = row.getAttribute('row-id');
    const readRow = () => { const o = {}; for (const c of row.querySelectorAll('.ag-cell[col-id]')) { const k = c.getAttribute('col-id'); if (k.startsWith('ag-Grid')) continue; o[k] = c.textContent.trim(); } return o; };
    const S = window.__ssrm; const port = S.ports[0]; const subId = S.subIds[S.subIds.length - 1];
    const reqId = 'mw-edit-1';
    port.postMessage({
      kind: 'ssrm-apply-edits', reqId, subId,
      providerId: 'stomp-ssrm-minimal:positions',
      rows: [{ ...readRow(), positionId: id, trader: 'MW-EDITED' }],
      editedColumns: [['trader']],
    });
    return { id };
  });
  await sleep(2500);
  const editSeen = await Promise.all(pages.map((p) => p.evaluate((id) =>
    document.querySelector(`.ag-row[row-id="${id}"] .ag-cell[col-id="trader"]`)?.textContent?.trim() ?? null, edit.id)));
  out.scenarios.crossWindowEdit = { rowId: edit.id, traderCellPerPage: editSeen };
  console.log('\n[crossWindowEdit]', JSON.stringify(out.scenarios.crossWindowEdit));

  writeFileSync(join(OUT, `ssrm-multiwindow-${TAG}.json`), JSON.stringify(out, null, 2));
  await browser.close();
})().catch((e) => { console.error('MULTIWINDOW FAILED', e); writeFileSync(join(OUT, `ssrm-multiwindow-${TAG}.json`), JSON.stringify({ ...out, error: String(e) }, null, 2)); process.exit(1); });
