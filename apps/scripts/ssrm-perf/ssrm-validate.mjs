// SSRM validation harness - drives stomp-ssrm-minimal with Playwright and
// measures block latency, tick handling, refresh storms and blank rows.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('playwright');

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.SSRM_PERF_OUT ?? join(HERE, 'out');
mkdirSync(OUT, { recursive: true });
const URL = process.env.APP_URL ?? 'http://localhost:5214/';
const out = { url: URL, startedAt: new Date().toISOString(), scenarios: {} , console: [] };

// -- page-side instrumentation (runs before any app script) -----------------
const INIT = `(() => {
  const S = window.__ssrm = { pending: new Map(), getRows: [], ticks: [], rpcOther: [], subIds: [], providerIds: [], longTasks: [], ports: [], navStart: performance.now() };
  const hook = (port) => {
    if (!port || port.__hooked) return; port.__hooked = true; S.ports.push(port);
    const orig = port.postMessage.bind(port);
    port.postMessage = (msg, ...rest) => {
      try {
        if (msg && typeof msg.kind === 'string' && msg.kind.startsWith('ssrm-') && msg.reqId) {
          S.pending.set(msg.reqId, { t0: performance.now(), kind: msg.kind, req: msg.request, subId: msg.subId });
          if (msg.kind === 'ssrm-get-rows') {
            if (!S.subIds.includes(msg.subId)) S.subIds.push(msg.subId);
            if (!S.providerIds.includes(msg.providerId)) S.providerIds.push(msg.providerId);
          }
        }
      } catch {}
      return orig(msg, ...rest);
    };
    port.addEventListener('message', (ev) => {
      const d = ev.data; if (!d || typeof d !== 'object') return;
      if (d.kind === 'ssrm-rpc') {
        const p = S.pending.get(d.reqId); if (!p) return; S.pending.delete(d.reqId);
        const t1 = performance.now();
        if (p.kind === 'ssrm-get-rows') {
          const r = p.req || {};
          S.getRows.push({ t0: p.t0, t1, ms: t1 - p.t0, start: r.startRow, end: r.endRow,
            sort: (r.sortModel || []).length, filterCols: r.filterModel ? Object.keys(r.filterModel).length : 0,
            qf: r.quickFilterText || '', groupKeys: (r.groupKeys || []).length, groupCols: (r.rowGroupCols || []).length,
            rows: d.ok && d.result ? (d.result.rowData || []).length : -1,
            rowCount: d.ok && d.result ? d.result.rowCount : -1, ok: !!d.ok, err: d.error });
        } else {
          S.rpcOther.push({ kind: p.kind, ms: t1 - p.t0, t1, ok: !!d.ok });
        }
      } else if (d.kind === 'ssrm-tick') {
        const pl = d.payload || {};
        S.ticks.push({ t: performance.now(), kind: pl.kind, up: (pl.upserts || []).length, rm: (pl.removals || []).length, reset: !!pl.reset, groups: (pl.groups || []).length });
      }
    });
  };
  const OrigSW = window.SharedWorker;
  if (OrigSW) {
    const Wrapped = function SharedWorker(...args) { const w = new OrigSW(...args); hook(w.port); return w; };
    Wrapped.prototype = OrigSW.prototype;
    window.SharedWorker = Wrapped;
  }
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) S.longTasks.push({ t: e.startTime, d: e.duration }); })
      .observe({ entryTypes: ['longtask'] });
  } catch {}
})();`;

// -- page-side helpers ------------------------------------------------------
const SNAPSHOT = () => {
  const vp = document.querySelector('.ag-grid-viewport');
  const rows = [...document.querySelectorAll('.ag-grid-scrolling-container .ag-row')];
  const isEmpty = (r) => [...r.querySelectorAll('.ag-cell')].every((c) => !c.textContent.trim());
  const vpRect = vp ? vp.getBoundingClientRect() : null;
  const visible = vpRect
    ? rows.filter((r) => { const b = r.getBoundingClientRect(); return b.bottom > vpRect.top && b.top < vpRect.bottom; })
    : [];
  return {
    t: performance.now(),
    rendered: rows.length,
    loading: rows.filter((r) => r.classList.contains('ag-row-loading')).length,
    empty: rows.filter(isEmpty).length,
    visible: visible.length,
    visLoading: visible.filter((r) => r.classList.contains('ag-row-loading')).length,
    visEmpty: visible.filter(isEmpty).length,
    scrollTop: vp?.scrollTop ?? -1, scrollHeight: vp?.scrollHeight ?? -1, clientHeight: vp?.clientHeight ?? -1,
    status: document.querySelector('.ag-status-bar')?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    getRows: window.__ssrm.getRows.length, ticks: window.__ssrm.ticks.length,
  };
};

// Scroll the body viewport in `steps` increments, sampling blank rows every
// `sampleMs` during the scroll and for `settleMs` after the last step.
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
      visLoading: visible.filter((r) => r.classList.contains('ag-row-loading')).length,
      visEmpty: visible.filter(isEmpty).length, inflight: S.pending.size });
  };
  const start = performance.now();
  const g0 = S.getRows.length; const lt0 = S.longTasks.length;
  const total = to - from;
  const timer = setInterval(() => sample('scroll'), sampleMs);
  for (let i = 1; i <= steps; i++) {
    vp.scrollTop = from + (total * i) / steps;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  const scrollEnd = performance.now();
  clearInterval(timer);
  const settleTimer = setInterval(() => sample('settle'), sampleMs);
  await new Promise((r) => setTimeout(r, settleMs));
  clearInterval(settleTimer);
  sample('final');
  const during = S.getRows.slice(g0);
  const firstClean = samples.find((s) => s.t >= scrollEnd && s.visLoading === 0 && s.visEmpty === 0);
  return {
    durationMs: scrollEnd - start,
    requests: during.length,
    latencies: during.map((r) => r.ms),
    longTasks: S.longTasks.slice(lt0).map((l) => l.d),
    peakBlankFrac: Math.max(0, ...samples.map((s) => s.visible ? Math.max(s.visLoading, s.visEmpty) / s.visible : 0)),
    blankSamples: samples.filter((s) => s.visLoading > 0 || s.visEmpty > 0).length,
    totalSamples: samples.length,
    timeToCleanAfterStopMs: firstClean ? firstClean.t - scrollEnd : null,
    finalVisLoading: samples[samples.length - 1].visLoading,
    finalVisEmpty: samples[samples.length - 1].visEmpty,
    maxInflight: Math.max(...samples.map((s) => s.inflight)),
    samples,
  };
};

// Jump straight to a scroll position and time until the visible rows fill.
const RUN_JUMP = async ({ to, timeoutMs }) => {
  const vp = document.querySelector('.ag-grid-viewport');
  const S = window.__ssrm;
  const g0 = S.getRows.length;
  const t0 = performance.now();
  vp.scrollTop = to;
  let firstBlank = null; let filledAt = null; let peakBlank = 0;
  while (performance.now() - t0 < timeoutMs) {
    const rows = [...document.querySelectorAll('.ag-grid-scrolling-container .ag-row')];
    const vpRect = vp.getBoundingClientRect();
    const visible = rows.filter((r) => { const b = r.getBoundingClientRect(); return b.bottom > vpRect.top && b.top < vpRect.bottom; });
    const blank = visible.filter((r) => r.classList.contains('ag-row-loading') || [...r.querySelectorAll('.ag-cell')].every((c) => !c.textContent.trim())).length;
    if (blank > 0 && firstBlank == null) firstBlank = performance.now() - t0;
    peakBlank = Math.max(peakBlank, visible.length ? blank / visible.length : 0);
    if (visible.length > 0 && blank === 0 && performance.now() - t0 > 30) { filledAt = performance.now() - t0; break; }
    await new Promise((r) => setTimeout(r, 10));
  }
  return { filledAfterMs: filledAt, firstBlankAtMs: firstBlank, peakBlankFrac: peakBlank, requests: S.getRows.slice(g0).map((r) => ({ start: r.start, ms: Math.round(r.ms), rows: r.rows })) };
};

const RESET_STATS = () => { const S = window.__ssrm; S.getRows.length = 0; S.ticks.length = 0; S.rpcOther.length = 0; S.longTasks.length = 0; };
const READ_STATS = () => {
  const S = window.__ssrm;
  return { getRows: S.getRows.map((r) => ({ ...r })), ticks: S.ticks.map((t) => ({ ...t })), rpcOther: S.rpcOther.map((r) => ({ ...r })), longTasks: S.longTasks.map((l) => l.d), pending: S.pending.size, subIds: [...S.subIds], providerIds: [...S.providerIds] };
};

const pct = (arr, p) => { if (!arr.length) return null; const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const stats = (arr) => ({ n: arr.length, p50: r(pct(arr, 50)), p95: r(pct(arr, 95)), max: r(arr.length ? Math.max(...arr) : null), mean: r(arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null) });
const r = (x) => (x == null ? null : Math.round(x * 10) / 10);
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function idleWindow(page, label, ms) {
  await page.evaluate(RESET_STATS);
  await sleep(ms);
  const s = await page.evaluate(READ_STATS);
  const secs = ms / 1000;
  const res = {
    windowMs: ms,
    getRowsPerSec: r(s.getRows.length / secs),
    getRowsTotal: s.getRows.length,
    getRowsSorted: s.getRows.filter((g) => g.sort > 0).length,
    blockLatency: stats(s.getRows.map((g) => g.ms)),
    ticksPerSec: r(s.ticks.length / secs),
    upsertsPerSec: r(s.ticks.reduce((a, t) => a + t.up, 0) / secs),
    removalsTotal: s.ticks.reduce((a, t) => a + t.rm, 0),
    tickKinds: s.ticks.reduce((m, t) => { m[t.kind] = (m[t.kind] || 0) + 1; return m; }, {}),
    otherRpcPerSec: r(s.rpcOther.length / secs),
    otherRpcKinds: s.rpcOther.reduce((m, t) => { m[t.kind] = (m[t.kind] || 0) + 1; return m; }, {}),
    otherRpcLatency: stats(s.rpcOther.map((g) => g.ms)),
    longTasks: stats(s.longTasks),
    longTasksPerSec: r(s.longTasks.length / secs),
    pendingAtEnd: s.pending,
  };
  out.scenarios[label] = res;
  console.log(`\n[${label}]`, JSON.stringify(res, null, 1));
  return res;
}

async function scrollScenario(page, label, opts) {
  const vpInfo = await page.evaluate(() => { const vp = document.querySelector('.ag-grid-viewport'); return { h: vp.scrollHeight, c: vp.clientHeight }; });
  const res = await page.evaluate(RUN_SCROLL, { ...opts, from: opts.from ?? 0, to: opts.to ?? vpInfo.h - vpInfo.c });
  const summary = { ...res, latencies: stats(res.latencies), longTasks: stats(res.longTasks), samples: undefined, viewport: vpInfo };
  out.scenarios[label] = { ...summary, samples: res.samples };
  console.log(`\n[${label}]`, JSON.stringify(summary, null, 1));
  return res;
}

async function waitForRows(page, timeoutMs) {
  await page.waitForFunction(() => {
    const S = window.__ssrm; if (!S) return false;
    const ok = S.getRows.some((g) => g.ok && g.rows > 0);
    const rows = document.querySelectorAll('.ag-grid-scrolling-container .ag-row:not(.ag-row-loading)').length;
    return ok && rows > 5;
  }, null, { timeout: timeoutMs });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  await context.addInitScript(INIT);
  const page = await context.newPage();
  page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' || m.type() === 'warning' || t.includes('[ssrm]')) out.console.push({ type: m.type(), text: t.slice(0, 300) }); });
  page.on('pageerror', (e) => out.console.push({ type: 'pageerror', text: String(e).slice(0, 300) }));

  // -- 1. cold load ---------------------------------------------------------
  const navT0 = Date.now();
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await waitForRows(page, 120_000);
  const firstRowsMs = Date.now() - navT0;
  await sleep(1500);
  const cold = await page.evaluate(READ_STATS);
  const first = cold.getRows[0];
  out.scenarios.coldLoad = {
    wallMsToFirstRows: firstRowsMs,
    requests: cold.getRows.length,
    firstRequest: first ? { start: first.start, end: first.end, filterCols: first.filterCols, qf: first.qf, sort: first.sort, rows: first.rows, rowCount: first.rowCount, ms: r(first.ms) } : null,
    blocks: cold.getRows.map((g) => ({ start: g.start, end: g.end, ms: r(g.ms), rows: g.rows, rowCount: g.rowCount })),
    subIds: cold.subIds, providerIds: cold.providerIds,
    snapshot: await page.evaluate(SNAPSHOT),
  };
  console.log('\n[coldLoad]', JSON.stringify(out.scenarios.coldLoad, null, 1));
  await page.screenshot({ path: join(OUT, 'ssrm-01-loaded.png') });

  // -- 2. idle, unsorted ----------------------------------------------------
  await idleWindow(page, 'idleUnsorted10s', 10_000);

  // -- 3. fast scroll, unsorted ---------------------------------------------
  await page.evaluate(() => { document.querySelector('.ag-grid-viewport').scrollTop = 0; });
  await sleep(1000);
  await scrollScenario(page, 'fastScrollUnsorted', { steps: 25, intervalMs: 80, settleMs: 2500, sampleMs: 40 });
  await sleep(500);
  const jump1 = await page.evaluate(RUN_JUMP, { to: 12_000 * 30 * 0.5, timeoutMs: 5000 });
  await page.screenshot({ path: join(OUT, 'ssrm-02-after-jump.png') });
  out.scenarios.jumpUnsorted = jump1; console.log('\n[jumpUnsorted]', JSON.stringify(jump1));
  await sleep(500);
  const jump2 = await page.evaluate(RUN_JUMP, { to: 60_000, timeoutMs: 5000 });
  out.scenarios.jumpUnsorted2 = jump2; console.log('\n[jumpUnsorted2]', JSON.stringify(jump2));

  // -- 4. synthetic tick: update / insert / delete on the transaction path -
  await page.evaluate(() => { document.querySelector('.ag-grid-viewport').scrollTop = 0; });
  await sleep(1200);
  const synth = await page.evaluate(async () => {
    const S = window.__ssrm; const port = S.ports[0]; const subId = S.subIds[S.subIds.length - 1];
    const rows = [...document.querySelectorAll('.ag-grid-scrolling-container .ag-row:not(.ag-row-loading)')];
    const pick = rows[2]; const victim = rows[3];
    const readRow = (row) => { const o = {}; for (const c of row.querySelectorAll('.ag-cell[col-id]')) { const k = c.getAttribute('col-id'); const t = c.textContent.trim(); const n = Number(t.replace(/,/g, '')); o[k] = t !== '' && Number.isFinite(n) && /^[\d,.\-]+$/.test(t) ? n : t; } return o; };
    const pickId = pick.getAttribute('row-id'); const victimId = victim.getAttribute('row-id');
    const updated = { ...readRow(pick), positionId: pickId, pnl: 987654321 };
    const inserted = { ...readRow(pick), positionId: 'ZZ-SYNTH-0001', ticker: 'SYNTH', desk: 'SYNTH-DESK', trader: 'SYNTH', pnl: 1 };
    const statusBefore = document.querySelector('.ag-status-bar')?.textContent?.replace(/\s+/g, ' ').trim();
    const renderedBefore = document.querySelectorAll('.ag-grid-scrolling-container .ag-row').length;
    port.dispatchEvent(new MessageEvent('message', { data: { kind: 'ssrm-tick', subId, payload: { kind: 'rowDelta', upserts: [updated, inserted], removals: [victimId] } } }));
    await new Promise((r) => setTimeout(r, 1500));
    const pnlCell = document.querySelector(`.ag-row[row-id="${pickId}"] .ag-cell[col-id="pnl"]`)?.textContent?.trim();
    return {
      subId, pickId, victimId,
      updateApplied: pnlCell, updateExpected: '987,654,321',
      victimStillRendered: !!document.querySelector(`.ag-row[row-id="${victimId}"]`),
      insertRendered: !!document.querySelector('.ag-row[row-id="ZZ-SYNTH-0001"]'),
      renderedBefore, renderedAfter: document.querySelectorAll('.ag-grid-scrolling-container .ag-row').length,
      statusBefore, statusAfter: document.querySelector('.ag-status-bar')?.textContent?.replace(/\s+/g, ' ').trim(),
    };
  });
  out.scenarios.syntheticTick = synth; console.log('\n[syntheticTick]', JSON.stringify(synth, null, 1));

  // -- 5. sort by a column the feed never touches (positionId) --------------
  await page.evaluate(() => { document.querySelector('.ag-grid-viewport').scrollTop = 0; });
  await page.click('.ag-header-cell[col-id="positionId"] .ag-header-cell-label');
  await sleep(1500);
  const sortState = await page.evaluate(() => document.querySelector('.ag-header-cell[col-id="positionId"]')?.getAttribute('aria-sort'));
  out.scenarios.sortApplied = { column: 'positionId', ariaSort: sortState };
  await idleWindow(page, 'idleSortedByPositionId10s', 10_000);

  // -- 6. fast scroll, sorted -----------------------------------------------
  await page.evaluate(() => { document.querySelector('.ag-grid-viewport').scrollTop = 0; });
  await sleep(1000);
  await scrollScenario(page, 'fastScrollSorted', { steps: 25, intervalMs: 80, settleMs: 2500, sampleMs: 40 });
  await sleep(500);
  const jump3 = await page.evaluate(RUN_JUMP, { to: 12_000 * 30 * 0.5, timeoutMs: 5000 });
  await page.screenshot({ path: join(OUT, 'ssrm-03-sorted-after-jump.png') });
  out.scenarios.jumpSorted = jump3; console.log('\n[jumpSorted]', JSON.stringify(jump3));

  // -- 7. sort by a hot column (pnl) ----------------------------------------
  await page.click('.ag-header-cell[col-id="positionId"] .ag-header-cell-label'); await sleep(300);
  await page.click('.ag-header-cell[col-id="positionId"] .ag-header-cell-label'); await sleep(800); // back to unsorted
  await page.click('.ag-header-cell[col-id="marketValue"] .ag-header-cell-label');
  await sleep(1500);
  await idleWindow(page, 'idleSortedByMarketValue10s', 10_000);

  // -- 8. quick filter ------------------------------------------------------
  await page.evaluate(RESET_STATS);
  const toggle = await page.$('[data-testid="quick-search-toggle"]');
  if (toggle) { await toggle.click(); await sleep(200); }
  const input = await page.$('[data-testid="quick-search-input"]');
  let qf = null;
  if (input) {
    const t0 = Date.now();
    await input.fill('GOV');
    // sample blanks for 2.5s
    const samples = [];
    while (Date.now() - t0 < 2500) { samples.push(await page.evaluate(SNAPSHOT)); await sleep(50); }
    const s = await page.evaluate(READ_STATS);
    qf = {
      requests: s.getRows.length,
      requestsWithQf: s.getRows.filter((g) => g.qf).length,
      latency: stats(s.getRows.map((g) => g.ms)),
      peakVisBlankFrac: Math.max(...samples.map((x) => x.visible ? Math.max(x.visLoading, x.visEmpty) / x.visible : 0)),
      blankSamples: samples.filter((x) => x.visLoading > 0 || x.visEmpty > 0).length,
      totalSamples: samples.length,
      finalStatus: samples[samples.length - 1].status,
      rowCountAfter: s.getRows.length ? s.getRows[s.getRows.length - 1].rowCount : null,
    };
    await page.screenshot({ path: join(OUT, 'ssrm-04-quickfilter.png') });
    const clear = await page.$('[data-testid="quick-search-clear"]'); if (clear) await clear.click();
  } else {
    qf = { error: 'quick search input not found' };
  }
  out.scenarios.quickFilter = qf; console.log('\n[quickFilter]', JSON.stringify(qf, null, 1));

  out.finishedAt = new Date().toISOString();
  writeFileSync(join(OUT, 'ssrm-validate-results.json'), JSON.stringify(out, null, 2));
  console.log('\nconsole messages captured:', out.console.length);
  for (const c of out.console.slice(0, 40)) console.log(`  [${c.type}] ${c.text}`);
  await browser.close();
})().catch((e) => { console.error('HARNESS FAILED', e); writeFileSync(join(OUT, 'ssrm-validate-results.json'), JSON.stringify({ ...out, error: String(e) }, null, 2)); process.exit(1); });

