// Harness 3: paste accuracy via the real clipboard, multi-word quick search,
// date filter, sorted-load metrics. Parameterised by APP_URL (append ?rate=N).
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
const BASE_INIT = src.slice(src.indexOf('const INIT = `') + 'const INIT = `'.length, src.indexOf('`;\n\n//'));
// Extend the hook: capture ssrm-apply-edits requests and quickFilterText on get-rows.
const INIT = BASE_INIT.replace(
  "if (msg.kind === 'ssrm-get-rows') {",
  "if (msg.kind === 'ssrm-apply-edits') { (S.edits ??= []).push({ t: performance.now(), rows: msg.rows }); }\n          if (msg.kind === 'ssrm-get-rows') { (S.lastReq = msg.request); (S.qfTexts ??= []).push(msg.request.quickFilterText ?? ''); (S.filterModels ??= []).push(msg.request.filterModel ?? null);",
);
const URL = process.env.APP_URL ?? 'http://localhost:5215/';
const TAG = process.env.TAG ?? 'h3';
const out = { url: URL, tag: TAG, scenarios: {} };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (x) => (x == null ? null : Math.round(x * 10) / 10);
const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const stats = (arr) => ({ n: arr.length, p50: rnd(pct(arr, 50)), p95: rnd(pct(arr, 95)), max: rnd(arr.length ? Math.max(...arr) : null) });
const RESET = () => { const S = window.__ssrm; S.getRows.length = 0; S.ticks.length = 0; S.rpcOther.length = 0; S.longTasks.length = 0; S.edits = []; S.qfTexts = []; S.filterModels = []; };
const READ = () => { const S = window.__ssrm; return { getRows: S.getRows.length, latencies: S.getRows.map((g) => g.ms), ticks: S.ticks.length, up: S.ticks.reduce((a, t) => a + t.up, 0), longTasks: S.longTasks.map((l) => l.d), edits: S.edits ?? [], qfTexts: S.qfTexts ?? [], filterModels: S.filterModels ?? [], lastReq: S.lastReq }; };
const STATUS = () => document.querySelector('.ag-status-bar')?.textContent?.replace(/\s+/g, ' ').trim();
const VISIBLE_ROWS = () => [...document.querySelectorAll('.ag-grid-scrolling-container .ag-row:not(.ag-row-loading)')].map((r) => {
  const o = { id: r.getAttribute('row-id') };
  for (const c of r.querySelectorAll('.ag-cell[col-id]')) o[c.getAttribute('col-id')] = c.textContent.trim();
  return o;
});

async function waitRows(page) {
  await page.waitForFunction(() => window.__ssrm?.getRows.some((g) => g.ok && g.rows > 0) && document.querySelectorAll('.ag-grid-scrolling-container .ag-row:not(.ag-row-loading)').length > 5, null, { timeout: 120000 });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 2200, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const consoleMsgs = [];
  page.on('console', (m) => { const t = m.text(); if (t.includes('[ssrm]')) consoleMsgs.push(t.slice(0, 200)); });
  const t0 = Date.now();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await waitRows(page);
  out.scenarios.cold = { wallMsToFirstRows: Date.now() - t0, blocks: (await page.evaluate(() => window.__ssrm.getRows.map((g) => ({ start: g.start, ms: Math.round(g.ms), rows: g.rows, rowCount: g.rowCount })))) };
  console.log('[cold]', JSON.stringify(out.scenarios.cold));
  await sleep(1500);

  // ── live load baseline ────────────────────────────────────────────────
  await page.evaluate(RESET); await sleep(5000);
  let r = await page.evaluate(READ);
  out.scenarios.idleUnsorted5s = { getRows: r.getRows, ticks: r.ticks, upsertsPerSec: rnd(r.up / 5), longTasks: stats(r.longTasks) };
  console.log('[idleUnsorted5s]', JSON.stringify(out.scenarios.idleUnsorted5s));

  // ── paste accuracy: select 4 cells in Trader (never ticked by the feed), paste 4 values ─
  const PASTE_COL = process.env.PASTE_COL ?? 'trader';
  const before = await page.evaluate(VISIBLE_ROWS);
  const targets = before.slice(2, 6);
  const values = ['PASTE-A', 'PASTE-B', 'PASTE-C', 'PASTE-D'];
  await page.evaluate((v) => navigator.clipboard.writeText(v.join('\n')), values);
  const firstCell = page.locator(`.ag-row[row-id="${targets[0].id}"] .ag-cell[col-id="${PASTE_COL}"]`);
  await firstCell.click();
  await page.keyboard.down('Shift');
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowDown');
  await page.keyboard.up('Shift');
  await page.evaluate(RESET);
  await page.keyboard.press('Control+V');
  await sleep(400);
  const readTargets = async () => page.evaluate(([ids, col]) => ids.map((id) => document.querySelector(`.ag-row[row-id="${id}"] .ag-cell[col-id="${col}"]`)?.textContent?.trim() ?? null), [targets.map((t) => t.id), PASTE_COL]);
  const at400 = await readTargets();
  await sleep(2500);
  const at2900 = await readTargets();
  r = await page.evaluate(READ);
  // Force a block re-read from the engine: toggle sort on Position Id twice (asc → desc → none purges/refreshes).
  await page.click('.ag-header-cell[col-id="positionId"] .ag-header-cell-label'); await sleep(800);
  await page.click('.ag-header-cell[col-id="positionId"] .ag-header-cell-label'); await sleep(800);
  await page.click('.ag-header-cell[col-id="positionId"] .ag-header-cell-label'); await sleep(1500);
  const afterRefetch = await readTargets();
  out.scenarios.paste = {
    targetIds: targets.map((t) => t.id),
    pasted: values,
    at400ms: at400,
    at2900ms: at2900,
    afterEngineRefetch: afterRefetch,
    editRpcs: r.edits.length,
    editRows: r.edits.flatMap((e) => e.rows.map((row) => ({ positionId: row.positionId, value: row[PASTE_COL] }))),
    consoleSsrm: consoleMsgs.slice(-5),
  };
  console.log('[paste]', JSON.stringify(out.scenarios.paste, null, 1));

  // ── quick search: multi-word across columns, and a non-configured column ─
  const toggle = await page.$('[data-testid="quick-search-toggle"]'); if (toggle) { await toggle.click(); await sleep(200); }
  const input = await page.$('[data-testid="quick-search-input"]');
  const search = async (text) => {
    await page.evaluate(RESET);
    await input.fill(text);
    await sleep(2500);
    const rows = await page.evaluate(VISIBLE_ROWS);
    const rd = await page.evaluate(READ);
    return { text, status: await page.evaluate(STATUS), rowsShown: rows.length, sample: rows.slice(0, 3).map((x) => `${x.desk}|${x.region}|${x.ticker}`), qfSent: rd.qfTexts.filter(Boolean).slice(-1)[0] ?? null, rowCount: rd.lastReq ? null : null };
  };
  out.scenarios.quickSearch = {
    multiWord: await search('govies apac'),
    tickerOnly: await search('TICK4032'),
    nonsense: await search('zzqqxx'),
  };
  const clear = await page.$('[data-testid="quick-search-clear"]'); if (clear) await clear.click(); await sleep(1200);
  console.log('[quickSearch]', JSON.stringify(out.scenarios.quickSearch, null, 1));

  // ── date filter on Maturity via the floating filter (equals a visible date) ─
  const rowsNow = await page.evaluate(VISIBLE_ROWS);
  const sampleDate = rowsNow.find((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.maturityDate ?? ''))?.maturityDate ?? null;
  let dateResult = { skipped: 'no visible maturity date' };
  if (sampleDate) {
    try {
      // Apply the AG Grid date filter model exactly as the date menu emits it
      // (day bound with a midnight time), through the grid api (React fiber).
      const found = await page.evaluate(() => {
        const root = document.querySelector('.ag-root-wrapper');
        const key = Object.keys(root).find((k) => k.startsWith('__reactFiber$'));
        let fiber = root[key];
        while (fiber) { const sn = fiber.stateNode; if (sn && sn.api && typeof sn.api.setFilterModel === 'function') { window.__gridApi = sn.api; return true; } fiber = fiber.return; }
        return false;
      });
      if (!found) throw new Error('grid api not reachable');
      await page.evaluate(RESET);
      await page.evaluate((d) => window.__gridApi.setFilterModel({ maturityDate: { filterType: 'date', type: 'equals', dateFrom: `${d} 00:00:00`, dateTo: null } }), sampleDate);
      await sleep(2500);
      const rows = await page.evaluate(VISIBLE_ROWS);
      const rd = await page.evaluate(READ);
      const equalsResult = {
        status: await page.evaluate(STATUS),
        rowsShown: rows.length,
        allMatch: rows.length > 0 && rows.every((x) => x.maturityDate === sampleDate),
        filterSent: rd.filterModels.filter(Boolean).slice(-1)[0] ?? null,
      };
      await page.evaluate(RESET);
      await page.evaluate((d) => window.__gridApi.setFilterModel({ maturityDate: { filterType: 'date', type: 'greaterThan', dateFrom: `${d} 00:00:00`, dateTo: null } }), sampleDate);
      await sleep(2500);
      const rows2 = await page.evaluate(VISIBLE_ROWS);
      const greaterResult = {
        status: await page.evaluate(STATUS),
        rowsShown: rows2.length,
        allAfter: rows2.length > 0 && rows2.every((x) => x.maturityDate > sampleDate),
        minShown: rows2.map((x) => x.maturityDate).sort()[0] ?? null,
      };
      await page.evaluate(() => window.__gridApi.setFilterModel(null));
      await sleep(1200);
      dateResult = { sampleDate, equals: equalsResult, greaterThan: greaterResult };
    } catch (e) {
      dateResult = { skipped: `date filter: ${String(e).slice(0, 160)}` };
    }
  }
  out.scenarios.dateFilter = dateResult;
  console.log('[dateFilter]', JSON.stringify(dateResult, null, 1));

  // ── sorted load: idle + wheel scroll ───────────────────────────────────
  await page.click('.ag-header-cell[col-id="marketValue"] .ag-header-cell-label'); await sleep(1500);
  await page.evaluate(RESET); await sleep(5000);
  r = await page.evaluate(READ);
  out.scenarios.idleSortedHot5s = { getRows: r.getRows, latency: stats(r.latencies), upsertsPerSec: rnd(r.up / 5), longTasks: stats(r.longTasks) };
  console.log('[idleSortedHot5s]', JSON.stringify(out.scenarios.idleSortedHot5s));

  // ── sort direction: asc (current) then desc must actually reverse ───────
  const mvNums = (rows) => rows.map((x) => Number(String(x.marketValue).replace(/,/g, ''))).filter(Number.isFinite);
  const ascRows = mvNums(await page.evaluate(VISIBLE_ROWS)).slice(0, 8);
  await page.click('.ag-header-cell[col-id="marketValue"] .ag-header-cell-label'); await sleep(2000);
  const descRows = mvNums(await page.evaluate(VISIBLE_ROWS)).slice(0, 8);
  const isSorted = (a, dir) => a.every((v, i) => i === 0 || (dir === 'asc' ? v >= a[i - 1] : v <= a[i - 1]));
  out.scenarios.sortDirection = { ascFirst: ascRows.slice(0, 4), ascOk: isSorted(ascRows, 'asc'), descFirst: descRows.slice(0, 4), descOk: isSorted(descRows, 'desc') && descRows[0] > ascRows[0] };
  console.log('[sortDirection]', JSON.stringify(out.scenarios.sortDirection));
  await page.click('.ag-header-cell[col-id="marketValue"] .ag-header-cell-label'); await sleep(800); // → none
  await page.click('.ag-header-cell[col-id="marketValue"] .ag-header-cell-label'); await sleep(1500); // → asc again for the wheel run
  const wheel = await page.evaluate(async () => {
    const vp = document.querySelector('.ag-grid-viewport'); const S = window.__ssrm;
    vp.scrollTop = 0; await new Promise((r) => setTimeout(r, 800));
    const g0 = S.getRows.length; const lt0 = S.longTasks.length; const t0 = performance.now();
    let blankSamples = 0, samples = 0;
    const timer = setInterval(() => {
      samples += 1;
      const rows = [...document.querySelectorAll('.ag-grid-scrolling-container .ag-row')];
      const vpRect = vp.getBoundingClientRect();
      const vis = rows.filter((r) => { const b = r.getBoundingClientRect(); return b.bottom > vpRect.top && b.top < vpRect.bottom; });
      if (vis.some((r) => r.classList.contains('ag-row-loading'))) blankSamples += 1;
    }, 32);
    for (let i = 1; i <= 100; i += 1) { vp.scrollTop = i * 600; await new Promise((r) => setTimeout(r, 16)); }
    const scrollMs = performance.now() - t0;
    await new Promise((r) => setTimeout(r, 2000)); clearInterval(timer);
    return { scrollMs: Math.round(scrollMs), requests: S.getRows.length - g0, longTasks: S.longTasks.slice(lt0).map((l) => l.d), blankSampleFrac: samples ? blankSamples / samples : null };
  });
  out.scenarios.wheelSorted = { ...wheel, longTasks: stats(wheel.longTasks) };
  console.log('[wheelSorted]', JSON.stringify(out.scenarios.wheelSorted));

  await page.screenshot({ path: join(OUT, `ssrm-${TAG}-final.png`) });
  writeFileSync(join(OUT, `ssrm-validate3-${TAG}.json`), JSON.stringify(out, null, 2));
  await browser.close();
})().catch((e) => { console.error('HARNESS3 FAILED', e); writeFileSync(join(OUT, `ssrm-validate3-${TAG}.json`), JSON.stringify({ ...out, error: String(e) }, null, 2)); process.exit(1); });
