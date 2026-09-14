// Worker-split live smoke (plan W1c verify step): with a blotter streaming,
// introspect BOTH SharedWorkers by name and prove the isolation is real —
//
//   * the platform-services worker answers `hub-introspect` with the catalog
//     (ready, N rows) + AppData and ZERO running providers;
//   * the data worker answers `hub-introspect` with running providers and
//     NO catalog (catalogReady=false, catalogProviderCount=0);
//   * a catalog RPC (`hub-ready`) posted on the DATA port gets no reply —
//     the route is gone, not merely unused;
//   * `provider-running` on the data port still answers (the scalar probe
//     window-open flows rely on).
//
// Exits non-zero when any of those does not hold. Prereqs as for
// worker-baseline.mjs: stomp-view-server on :8081, a production preview.
//
//   SSRM_URL=http://localhost:5215/ node worker-split-smoke.mjs
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('playwright');

const APP_URL = process.env.SSRM_URL ?? 'http://localhost:5215/';

// Tag every SharedWorker port with the worker name it was created under.
const INIT = `(() => {
  const S = window.__split = { ports: [], seq: 0, pending: new Map() };
  const OrigSW = window.SharedWorker;
  const Wrapped = function SharedWorker(...args) {
    const w = new OrigSW(...args);
    const name = String((args[1] && args[1].name) || '');
    S.ports.push({ name, port: w.port });
    w.port.addEventListener('message', (ev) => {
      const d = ev.data;
      if (d && d.kind === 'config-snapshot' && typeof d.reqId === 'string' && d.reqId.startsWith('smoke-')) {
        const p = S.pending.get(d.reqId);
        if (p) { S.pending.delete(d.reqId); p.resolve(d); }
      }
    });
    return w;
  };
  Wrapped.prototype = OrigSW.prototype;
  window.SharedWorker = Wrapped;
  window.__rpc = (prefix, kind, extra, timeoutMs) => {
    const entry = S.ports.find((p) => p.name.startsWith(prefix));
    if (!entry) return Promise.reject(new Error('no port for ' + prefix));
    const reqId = 'smoke-' + (S.seq += 1);
    return new Promise((resolve) => {
      const timer = setTimeout(() => { S.pending.delete(reqId); resolve({ timeout: true }); }, timeoutMs);
      S.pending.set(reqId, { resolve: (d) => { clearTimeout(timer); resolve(d); } });
      entry.port.postMessage({ kind, reqId, ...(extra || {}) });
    });
  };
  window.__portNames = () => S.ports.map((p) => p.name);
})();`;

const rowsReady = (page) => page.waitForFunction(
  () => document.querySelectorAll('.ag-row:not(.ag-row-loading)').length > 5,
  null,
  { timeout: 180000 },
);

const failures = [];
const check = (ok, label, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + JSON.stringify(detail) : ''}`);
  if (!ok) failures.push(label);
};

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 850 } });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  await page.goto(`${APP_URL}?rate=2000`, { waitUntil: 'domcontentloaded' });
  await rowsReady(page);

  const names = await page.evaluate(() => window.__portNames());
  console.log('workers:', names);
  check(names.some((n) => n.startsWith('mkt-platform-services:')), 'platform-services worker spawned');
  check(names.some((n) => n.startsWith('mkt-data-services:')), 'data worker spawned');
  check(names.findIndex((n) => n.startsWith('mkt-platform-services:')) === 0, 'platform-services worker spawned FIRST');

  const platform = await page.evaluate(() => window.__rpc('mkt-platform-services:', 'hub-introspect', {}, 5000));
  const data = await page.evaluate(() => window.__rpc('mkt-data-services:', 'hub-introspect', {}, 5000));
  const pi = platform.introspect ?? {};
  const di = data.introspect ?? {};
  check(platform.ok === true && pi.catalogReady === true && pi.catalogProviderCount > 0,
    'platform worker serves the catalog', { catalogReady: pi.catalogReady, catalogProviderCount: pi.catalogProviderCount });
  check(pi.runningProviderCount === 0, 'platform worker runs no providers', { runningProviderCount: pi.runningProviderCount });
  check(Array.isArray(pi.appData?.rows), 'platform worker serves AppData', { appDataRows: pi.appData?.rows?.length, listeners: pi.appData?.listenerCount });
  check(data.ok === true && di.runningProviderCount > 0, 'data worker runs the provider', { runningProviderCount: di.runningProviderCount, providers: (di.providers ?? []).map((p) => `${p.providerId}:${p.status}:${p.rowCount}`) });
  check(di.catalogReady === false && di.catalogProviderCount === 0, 'data worker reports NO catalog', { catalogReady: di.catalogReady, catalogProviderCount: di.catalogProviderCount });
  check((di.appData?.listenerCount ?? 0) === 0, 'data worker has no AppData listeners', { listeners: di.appData?.listenerCount });

  const hubReadyOnData = await page.evaluate(() => window.__rpc('mkt-data-services:', 'hub-ready', {}, 2000));
  check(hubReadyOnData.timeout === true, 'hub-ready on the DATA port gets no reply (route deleted)');
  const listOnData = await page.evaluate(() => window.__rpc('mkt-data-services:', 'list-configs', {}, 2000));
  check(listOnData.timeout === true, 'list-configs on the DATA port gets no reply (route deleted)');
  const hubReadyOnPlatform = await page.evaluate(() => window.__rpc('mkt-platform-services:', 'hub-ready', {}, 2000));
  check(hubReadyOnPlatform.ok === true && hubReadyOnPlatform.ready === true, 'hub-ready on the PLATFORM port answers ready');

  const providerId = (di.providers ?? []).find((p) => p.running)?.providerId;
  const running = providerId
    ? await page.evaluate((id) => window.__rpc('mkt-data-services:', 'provider-running', { providerId: id }, 2000), providerId)
    : { timeout: true };
  check(running.ok === true && running.running === true, 'provider-running on the DATA port still answers', { providerId });

  await browser.close();
  if (failures.length) {
    console.error(`\n${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log('\nworker-split smoke: all checks passed');
})().catch((err) => { console.error(err); process.exit(1); });
