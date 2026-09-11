// Diag 2: trace paste events via the grid api (React fiber) and hub status events around a quick search.
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('playwright');
const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.SSRM_PERF_OUT ?? join(HERE, 'out');
mkdirSync(OUT, { recursive: true });
const src = readFileSync(join(HERE, 'ssrm-validate.mjs'), 'utf8');
const BASE_INIT = src.slice(src.indexOf('const INIT = `') + 'const INIT = `'.length, src.indexOf('`;\n\n//'));
const INIT = BASE_INIT
  .replace("if (msg.kind === 'ssrm-get-rows') {", "if (msg.kind === 'ssrm-apply-edits') { (S.edits ??= []).push({ t: performance.now(), rows: msg.rows.map((r) => ({ id: r.positionId, mv: r.marketValue })) }); }\n          (S.posts ??= []).push({ t: performance.now(), kind: msg.kind, qf: msg.request?.quickFilterText, start: msg.request?.startRow });\n          if (msg.kind === 'ssrm-get-rows') {")
  .replace("if (d.kind === 'ssrm-rpc') {", "if (d.kind === 'status') { (S.statuses ??= []).push({ t: performance.now(), status: d.status, error: d.error }); }\n      if (d.kind === 'ssrm-rpc') {");
const URL = process.env.APP_URL ?? 'http://localhost:5214/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FIND_API = () => {
  const root = document.querySelector('.ag-root-wrapper');
  const key = Object.keys(root).find((k) => k.startsWith('__reactFiber$'));
  let fiber = root[key];
  while (fiber) {
    const sn = fiber.stateNode;
    if (sn && sn.api && typeof sn.api.addEventListener === 'function') { window.__gridApi = sn.api; return true; }
    fiber = fiber.return;
  }
  return false;
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 2200, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.text().includes('[ssrm]') || m.type() === 'error' && !m.text().includes('*')) logs.push(m.text().slice(0, 200)); });
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__ssrm?.getRows.some((g) => g.ok && g.rows > 0) && document.querySelectorAll('.ag-grid-scrolling-container .ag-row:not(.ag-row-loading)').length > 5, null, { timeout: 120000 });
  await sleep(1500);
  console.log('api found:', await page.evaluate(FIND_API));
  await page.evaluate(() => {
    const S = window.__ssrm; S.events = [];
    const api = window.__gridApi;
    for (const evt of ['pasteStart', 'pasteEnd', 'cellValueChanged', 'filterChanged', 'storeRefreshed', 'modelUpdated']) {
      api.addEventListener(evt, (e) => S.events.push({ t: Math.round(performance.now()), evt, source: e.source, id: e.node?.id, col: e.column?.getColId?.(), oldValue: e.oldValue, newValue: e.newValue }));
    }
  });

  // paste 4 values
  const ids = await page.evaluate(() => [...document.querySelectorAll('.ag-grid-scrolling-container .ag-row:not(.ag-row-loading)')].slice(2, 6).map((r) => r.getAttribute('row-id')));
  await page.evaluate(() => navigator.clipboard.writeText('111111\n222222\n333333\n444444'));
  await page.locator(`.ag-row[row-id="${ids[0]}"] .ag-cell[col-id="marketValue"]`).click();
  await page.keyboard.down('Shift'); for (let i = 0; i < 3; i += 1) await page.keyboard.press('ArrowDown'); await page.keyboard.up('Shift');
  await page.evaluate(() => { const S = window.__ssrm; S.events = []; S.edits = []; S.posts = []; S.statuses = []; });
  const ranges = await page.evaluate(() => window.__gridApi.getCellRanges().map((r) => ({ from: r.startRow?.rowIndex, to: r.endRow?.rowIndex, cols: r.columns.map((c) => c.getColId()) })));
  console.log('ranges before paste:', JSON.stringify(ranges));
  await page.keyboard.press('Control+V');
  await sleep(600);
  const pasteTrace = await page.evaluate(() => ({ events: window.__ssrm.events.filter((e) => e.evt !== 'modelUpdated'), edits: window.__ssrm.edits }));
  console.log('paste events:', JSON.stringify(pasteTrace, null, 1));

  // quick search
  await page.evaluate(() => { const S = window.__ssrm; S.events = []; S.posts = []; S.statuses = []; });
  const toggle = await page.$('[data-testid="quick-search-toggle"]'); if (toggle) { await toggle.click(); await sleep(200); }
  const input = await page.$('[data-testid="quick-search-input"]');
  await input.fill('govies');
  await sleep(2500);
  const qs = await page.evaluate(() => ({
    quickFilterOption: window.__gridApi.getGridOption('quickFilterText'),
    events: window.__ssrm.events.filter((e) => e.evt !== 'cellValueChanged').slice(0, 12),
    posts: window.__ssrm.posts.slice(0, 12),
    statuses: window.__ssrm.statuses,
    pending: window.__ssrm.pending.size,
    status: document.querySelector('.ag-status-bar')?.textContent?.replace(/\s+/g, ' ').trim(),
    firstRow: document.querySelector('.ag-grid-scrolling-container .ag-row')?.textContent?.replace(/\s+/g, ' ').slice(0, 80),
    displayedRowCount: window.__gridApi.getDisplayedRowCount(),
  }));
  console.log('quick search:', JSON.stringify(qs, null, 1));
  console.log('console:', JSON.stringify(logs.slice(-10)));
  await browser.close();
})().catch((e) => { console.error('DIAG2 FAILED', e); process.exit(1); });
