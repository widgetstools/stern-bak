// cdp-cold-reload.mjs — where does a blotter's cold reload go, from navigation
// to the first rows on screen? (refactor plan D0)
//
// Reloads the page with three hooks installed before the app runs and reads
// them back once rows are painted:
//   - the bootstrap ladder: the `starui:*` performance marks the data package
//     stamps (config-ready, hub-connected, appdata-ready, catalog-ready,
//     platform-ready) plus the navigation-timing entry;
//   - the React side: a minimal `__REACT_DEVTOOLS_GLOBAL_HOOK__` records every
//     commit with its time, and the commit in which the AG Grid root mounts
//     (depth and ancestor chain, as cdp-fiber-remount does);
//   - the DOM side: a MutationObserver stamps the first `.ag-root-wrapper`,
//     the first header cell and the first data row with cells.
// A CPU profile runs across the whole window and is attributed by script
// chunk (app bundle, ag-grid, react-dom, worker client …), so "waiting" and
// "computing" can be told apart in every gap of the ladder.
//
//   node cdp-cold-reload.mjs --url blotter --runs 2 --timeout 60
import { attach, COMMON_FLAGS, evaluate, listPages, pageLabel, parseArgs, round, run, selectPages, sleep, writeResult } from './cdpDock.mjs';

const HOOK = `(() => {
  const C = window.__coldReload = { commits: [], grid: null, dom: {}, firstRowsMs: null, errors: [] };
  const now = () => Math.round(performance.now() * 10) / 10;
  // ── React commits + the grid mount commit ──
  if (!window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    const nm = (t) => (t && (t.displayName || t.name)) || null;
    const nameOf = (f) => { const t = f.type ?? f.elementType; if (typeof t === 'string') return t; if (nm(t)) return nm(t); if (t && t.render && nm(t.render)) return 'forwardRef(' + nm(t.render) + ')'; if (t && t.type && nm(t.type)) return 'memo(' + nm(t.type) + ')'; if (t && t._payload) return 'lazy'; return 'tag' + f.tag; };
    const isGridRoot = (f) => !!(f.stateNode && f.stateNode.classList && f.stateNode.classList.contains('ag-root-wrapper'));
    const chainOf = (f) => { const out = []; for (let p = f; p; p = p.return) out.push(nameOf(p)); return out.reverse(); };
    const walk = (root, fn) => { let n = root; while (n) { fn(n); if (n.child) { n = n.child; continue; } while (n && n !== root && !n.sibling) n = n.return; if (!n || n === root) return; n = n.sibling; } };
    const record = (root) => {
      const t = now(); let fibers = 0; let gridFiber = null;
      walk(root.current, (f) => { fibers++; if (!gridFiber && isGridRoot(f)) gridFiber = f; });
      C.commits.push({ n: C.commits.length + 1, tMs: t, fibers });
      if (gridFiber && !C.grid) { const chain = chainOf(gridFiber); C.grid = { commit: C.commits.length, tMs: t, depth: chain.length, chain }; }
    };
    const hook = { renderers: new Map(), supportsFiber: true, isDisabled: false,
      inject(r) { const id = this.renderers.size + 1; this.renderers.set(id, r); return id; },
      on() {}, off() {}, sub() { return () => {}; }, emit() {}, checkDCE() {},
      onCommitFiberRoot(id, root) { try { record(root); } catch (e) { C.errors.push(String(e)); } },
      onPostCommitFiberRoot() {}, onCommitFiberUnmount() {}, getFiberRoots() { return new Set(); } };
    Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', { value: hook, configurable: false, enumerable: false, writable: false });
  }
  // ── DOM milestones ──
  const stamp = (k) => { if (C.dom[k] == null) C.dom[k] = now(); };
  const check = () => {
    if (C.dom.gridRoot == null && document.querySelector('.ag-root-wrapper')) stamp('gridRoot');
    if (C.dom.header == null && document.querySelector('.ag-header-cell')) stamp('header');
    if (C.firstRowsMs == null) {
      // AG Grid 36: data rows live under .ag-grid-scrolling-container; header cells are .ag-header-cell, never .ag-cell.
      for (const cell of document.querySelectorAll('.ag-row .ag-cell')) {
        if ((cell.textContent || '').trim().length > 0) { stamp('firstRowCell'); C.firstRowsMs = C.dom.firstRowCell; break; }
      }
    }
  };
  const start = () => { check(); new MutationObserver(check).observe(document.documentElement, { childList: true, subtree: true, characterData: true }); };
  if (document.documentElement) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
})()`;

const COLLECT = `(() => {
  const C = window.__coldReload || {};
  const nav = performance.getEntriesByType('navigation')[0];
  const navOut = nav ? { fetchStart: nav.fetchStart, responseEnd: nav.responseEnd, domInteractive: nav.domInteractive, domContentLoaded: nav.domContentLoadedEventEnd, loadEvent: nav.loadEventEnd } : null;
  const marks = performance.getEntriesByType('mark').filter((m) => m.name.startsWith('starui:')).map((m) => ({ name: m.name.slice(7), tMs: m.startTime })).sort((a, b) => a.tMs - b.tMs);
  const res = performance.getEntriesByType('resource');
  const scripts = res.filter((r) => r.initiatorType === 'script' || /\\.m?js(\\?|$)/.test(r.name)).map((r) => ({ name: r.name.split('/').pop().split('?')[0], start: r.startTime, end: r.responseEnd, kb: Math.round((r.transferSize || r.encodedBodySize || 0) / 1024) })).sort((a, b) => b.end - a.end);
  const commits = C.commits || [];
  // Chunks fetched before the grid mounted are on the critical path; later ones are lazy panels.
  const gridAt = C.grid ? C.grid.tMs : Infinity;
  const critical = scripts.filter((s) => s.end <= gridAt);
  return {
    timeOrigin: performance.timeOrigin, nav: navOut, marks,
    scripts: { count: res.length, lastScriptEnd: critical[0]?.end ?? null, top: critical.slice(0, 6), lazyAfterGrid: scripts.length - critical.length },
    firstCommitMs: commits[0]?.tMs ?? null, commitsBeforeGrid: C.grid ? C.grid.commit - 1 : commits.length, commitsTotal: commits.length,
    commitsBeforeRows: C.firstRowsMs == null ? commits.length : commits.filter((c) => c.tMs <= C.firstRowsMs).length,
    grid: C.grid, dom: C.dom, firstRowsMs: C.firstRowsMs, errors: C.errors,
  };
})()`;

/** Vite chunk name without its 8-character hash (`ag-grid-react-CzcbIgwr.js` → `ag-grid-react.js`). */
const chunkOf = (url) => { const file = (url || '').split('/').pop().split('?')[0]; return file ? file.replace(/-[A-Za-z0-9_-]{8}\.(m?js)$/, '.$1') : '(native / eval)'; };

/**
 * Attribute a CPU profile's busy time by the script chunk of each sample's leaf
 * frame — for the whole window and per ladder segment. Sample times are
 * relative to `Profiler.start`, which this probe issues right after
 * `Page.reload`, so they line up with the page's own clock to within a few ms.
 */
function attribute(profile, segments) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const keyOf = (id) => {
    const f = byId.get(id)?.callFrame; const fn = f?.functionName ?? '';
    if (fn === '(idle)') return '(idle)';
    if (fn === '(program)' || fn === '(garbage collector)' || fn === '(root)') return fn;
    return chunkOf(f?.url);
  };
  const whole = new Map();
  const perSeg = segments.map(() => new Map());
  let total = 0, idle = 0, tUs = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const d = profile.timeDeltas[i] ?? 0; total += d; tUs += d;
    const key = keyOf(profile.samples[i]);
    if (key === '(idle)') idle += d;
    else whole.set(key, (whole.get(key) ?? 0) + d);
    const tMs = tUs / 1000;
    const k = segments.findIndex((s) => tMs > s.fromMs && tMs <= s.toMs);
    if (k >= 0) perSeg[k].set(key, (perSeg[k].get(key) ?? 0) + d);
  }
  const rowsOf = (m) => [...m.entries()].map(([chunk, us]) => ({ chunk, ms: round(us / 1000) })).sort((a, b) => b.ms - a.ms);
  const segOut = segments.map((s, k) => {
    const m = perSeg[k]; const idleUs = m.get('(idle)') ?? 0; let sum = 0; for (const v of m.values()) sum += v;
    const busy = rowsOf(m).filter((r) => r.chunk !== '(idle)');
    return { ...s, busyMs: round((sum - idleUs) / 1000), idleMs: round(idleUs / 1000), top: busy.slice(0, 3) };
  });
  return { totalMs: round(total / 1000), busyMs: round((total - idle) / 1000), idleMs: round(idle / 1000), rows: rowsOf(whole), segments: segOut };
}

async function coldReload(session, target, args) {
  await session.send('Page.enable');
  await session.send('Runtime.enable');
  const { identifier } = await session.send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
  const consoleAt = [];
  const offConsole = session.on('Runtime.consoleAPICalled', (p) => {
    const text = (p.args ?? []).map((a) => a.value ?? a.description ?? '').join(' ');
    // The AG Grid Enterprise banner is printed by GridCoreCreator.create — one per grid instance.
    if (/AG Grid Enterprise License/i.test(text)) consoleAt.push({ epochMs: p.timestamp, head: text.slice(0, 80).replace(/\s+/g, ' ') });
  });
  await session.send('Profiler.enable');
  await session.send('Profiler.setSamplingInterval', { interval: args.interval });
  await session.send('Page.reload', { ignoreCache: false });
  await session.send('Profiler.start');
  let ready = null;
  const deadline = Date.now() + args.timeout * 1000;
  while (Date.now() < deadline) {
    await sleep(250);
    try { ready = await evaluate(session, 'window.__coldReload ? window.__coldReload.firstRowsMs : null'); } catch { ready = null; }
    if (ready != null) break;
  }
  await sleep(1000);
  const { profile } = await session.send('Profiler.stop');
  await session.send('Profiler.disable');
  const data = await evaluate(session, COLLECT);
  offConsole();
  await session.send('Page.removeScriptToEvaluateOnNewDocument', { identifier }).catch(() => {});
  const banner = consoleAt.map((c) => ({ tMs: round(c.epochMs - data.timeOrigin), head: c.head }));
  const r = { page: pageLabel(target), timedOut: ready == null, ...data, banner };
  const steps = ladder(r);
  const segments = steps.map((s, i) => ({ name: s.name, fromMs: i === 0 ? 0 : steps[i - 1].tMs, toMs: s.tMs }));
  return { ...r, ladder: steps, cpu: attribute(profile, segments) };
}

function ladder(r) {
  const rows = [];
  const push = (name, t) => { if (t != null) rows.push({ name, tMs: round(t) }); };
  if (r.nav) { push('response end (HTML)', r.nav.responseEnd); push('DOMContentLoaded', r.nav.domContentLoaded); }
  push('last critical script chunk fetched', r.scripts.lastScriptEnd);
  push('first React commit', r.firstCommitMs);
  for (const m of r.marks) push(`mark ${m.name}`, m.tMs);
  if (r.grid) push(`AG Grid root mounted (commit ${r.grid.commit}, depth ${r.grid.depth})`, r.grid.tMs);
  for (const b of r.banner.slice(0, 1)) push('licence banner (grid created)', b.tMs);
  push('first header cell', r.dom.header);
  push('FIRST ROWS ON SCREEN', r.firstRowsMs);
  rows.sort((a, b) => a.tMs - b.tMs);
  let prev = 0;
  return rows.map((x) => { const gap = round(x.tMs - prev); prev = x.tMs; return { ...x, gap }; });
}

run(async () => {
  // `--runs` / `--timeout` are this probe's own flags; keep them away from the shared parser.
  const argv = process.argv.slice(2);
  const own = { runs: 1, timeout: 60, target: '' };
  const shared = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--runs' || argv[i] === '--timeout') { own[argv[i].slice(2)] = Number(argv[i + 1]); i++; continue; }
    if (argv[i] === '--target') { own.target = String(argv[i + 1] ?? ''); i++; continue; }
    shared.push(argv[i]);
  }
  const args = parseArgs(shared, { interval: 500 });
  const { runs, timeout } = own;
  if (args.help) {
    console.log(['cdp-cold-reload.mjs — cold reload ladder + CPU by chunk, navigation → first rows (reloads the page)', ...COMMON_FLAGS,
      '  --runs <n>       reloads per page (default 1)', '  --timeout <s>    give up waiting for rows (default 60)', '  --interval <µs>  profiler sampling interval (default 500)',
      '  --target <id>    DevTools target id (prefix) — reload exactly this page when several share a URL'].join('\n'));
    return;
  }
  const all = await listPages(args.cdp);
  const pages = own.target ? all.filter((p) => p.id.startsWith(own.target)) : selectPages(all, { ...args, url: args.url });
  if (pages.length === 0) throw new Error(`no page target starts with ${own.target}`);
  const results = [];
  for (const target of pages) {
    for (let i = 0; i < runs; i++) {
      const session = await attach(target);
      try { results.push({ run: i + 1, ...(await coldReload(session, target, { ...args, timeout })) }); } finally { session.close(); }
      if (i + 1 < runs) await sleep(3000);
    }
  }
  for (const r of results) {
    console.log(`\n${r.page}\n  run ${r.run}${r.timedOut ? ' — TIMED OUT waiting for rows' : ''}: first rows at ${r.firstRowsMs} ms; ${r.commitsTotal} React commits (${r.commitsBeforeRows} before rows); ${r.scripts.count} resources`);
    console.log('  ms since nav   gap   busy   idle  milestone (busy/idle = CPU in the gap; top chunks)');
    for (let i = 0; i < r.ladder.length; i++) {
      const x = r.ladder[i]; const s = r.cpu.segments[i];
      const top = s.top.map((t) => `${t.chunk} ${t.ms}`).join(', ');
      console.log(`  ${String(x.tMs).padStart(12)}  ${String(x.gap).padStart(5)}  ${String(s.busyMs).padStart(5)}  ${String(s.idleMs).padStart(5)}  ${x.name}${top ? `  [${top}]` : ''}`);
    }
    if (r.grid) console.log(`  grid chain (${r.grid.depth}): ${r.grid.chain.join(' > ')}`);
    console.log(`  CPU navigation → rows (+1 s): busy ${r.cpu.busyMs} ms, idle ${r.cpu.idleMs} ms of ${r.cpu.totalMs} ms sampled`);
    console.log('  busy ms  chunk');
    for (const c of r.cpu.rows.slice(0, args.top)) console.log(`  ${String(c.ms).padStart(7)}  ${c.chunk}`);
    console.log('  largest scripts (kB, fetched by ms): ' + r.scripts.top.map((s) => `${s.name} ${s.kb} kB @${round(s.end)}`).join(', '));
    if (r.errors.length) console.log('  hook errors: ' + r.errors.join(' | '));
  }
  console.log(`\nwrote ${writeResult('cdp-cold-reload', args.tag, { args: { ...args, runs, timeout }, results })}`);
});
