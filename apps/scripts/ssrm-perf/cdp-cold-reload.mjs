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
  const C = window.__coldReload = { commits: [], grid: null, dom: {}, firstRowsMs: null, errors: [], rendered: new Map(), types: [], commitStacks: [] };
  const now = () => Math.round(performance.now() * 10) / 10;
  // ── React commits + the grid mount commit ──
  if (!window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    const nm = (t) => (t && (t.displayName || t.name)) || null;
    // Host fibers (div …) and providers count too, keyed by a stable per-type object, so a
    // deepest-touched host node still names the component that owns it via its parent.
    const hostKeys = new Map();
    const fnOf = (f) => {
      const t = f.type ?? f.elementType;
      if (typeof t === 'function') return t;
      if (t && typeof t.render === 'function') return t.render;
      if (t && typeof t.type === 'function') return t.type;
      if (typeof t === 'string') { let k = hostKeys.get(t); if (!k) { k = { hostTag: t }; hostKeys.set(t, k); } return k; }
      if (t && t.$$typeof) { const id = String(t.$$typeof) + (t._context ? ':ctx' : ''); let k = hostKeys.get(id); if (!k) { k = { special: id }; hostKeys.set(id, k); } return k; }
      // Boundaries and the root have no type: tag 3 HostRoot, 7 Fragment, 13 Suspense, 22 Offscreen.
      const id = 'tag' + f.tag; let k = hostKeys.get(id); if (!k) { k = { tag: f.tag }; hostKeys.set(id, k); } return k;
    };
    const nameOf = (f) => { const t = f.type ?? f.elementType; if (typeof t === 'string') return t; if (nm(t)) return nm(t); if (t && t.render && nm(t.render)) return 'forwardRef(' + nm(t.render) + ')'; if (t && t.type && nm(t.type)) return 'memo(' + nm(t.type) + ')'; if (t && t._payload) return 'lazy'; return 'tag' + f.tag; };
    const isGridRoot = (f) => !!(f.stateNode && f.stateNode.classList && f.stateNode.classList.contains('ag-root-wrapper'));
    const chainOf = (f) => { const out = []; for (let p = f; p; p = p.return) out.push(nameOf(p)); return out.reverse(); };
    const walk = (root, fn) => { let n = root; while (n) { fn(n); if (n.child) { n = n.child; continue; } while (n && n !== root && !n.sibling) n = n.return; if (!n || n === root) return; n = n.sibling; } };
    // Which components RENDERED in each commit before the grid mounted (flag 1 = PerformedWork).
    const tally = (f) => {
      const fn = fnOf(f); if (!fn) return;
      let e = C.rendered.get(fn);
      if (!e) {
        const owner = f.return && fnOf(f.return) && typeof fnOf(f.return) === 'function' ? nameOf(f.return) : null;
        e = { i: C.types.length, name: nameOf(f) + (typeof fn === 'function' ? '' : owner ? ' (in ' + owner + ')' : ''), commits: 0, fibers: 0, sameProps: 0, newProps: 0, hooks: 0 };
        C.rendered.set(fn, e); if (C.types.length < 400) C.types.push(typeof fn === 'function' ? fn : null);
      }
      e.fibers++;
      // Same props object as the previous render → the update came from a hook, a context or a retry, not the parent.
      if (f.alternate) { if (f.memoizedProps === f.alternate.memoizedProps) e.sameProps++; else e.newProps++; }
      let h = 0; for (let s = f.memoizedState; s && h < 50; s = s.next) h++;
      e.hooks = h;
      // Why did it render: its own lanes, a context it depends on, or a parent that rendered too.
      if (!e.why) e.why = { lanes: 0, altLanes: 0, deps: 0, parentRendered: 0, samples: 0, fallback: 0, chain: null };
      if (e.why.samples < 200) {
        e.why.samples++;
        if (f.lanes) e.why.lanes++;
        if (f.alternate && f.alternate.lanes) e.why.altLanes++;
        if (f.dependencies && f.dependencies.firstContext) e.why.deps++;
        if (f.return && (f.return.flags & 1)) e.why.parentRendered++;
        if (f.tag === 13 && f.memoizedState !== null) e.why.fallback++; // Suspense showing its fallback
        if (!e.why.chain) e.why.chain = chainOf(f).slice(-8).join(' > ');
      }
    };
    // A fiber did work in a commit iff React cloned it: it is a new object compared
    // with the previous committed tree. The deepest touched fibers are where the
    // update originated (their untouched children were reused).
    let prevTree = new Set();
    // Every React root reports here; a second root (a library's own createRoot) shows up by container.
    const rootStats = new Map();
    const describeContainer = (c) => { if (!c) return 'none'; if (c.nodeType === 9) return 'document'; const el = c; return (el.tagName || 'node') + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').slice(0, 2).join('.') : '') + (el.parentElement ? ' in ' + (el.parentElement.tagName || '') + (el.parentElement.id ? '#' + el.parentElement.id : '') : ' (detached)'); };
    const record = (root, prio) => {
      let rs = rootStats.get(root);
      if (!rs) { rs = { container: describeContainer(root.containerInfo), commits: 0, emptyCommits: 0, firstMs: now() }; rootStats.set(root, rs); C.roots = [...rootStats.values()]; }
      rs.commits++;
      if (!root.current.child) rs.emptyCommits++;
      const t = now(); let fibers = 0; let rendered = 0; let gridFiber = null;
      const seen = new Set();
      const nextTree = new Set();
      const touched = [];
      walk(root.current, (f) => {
        fibers++;
        nextTree.add(f);
        if (!gridFiber && isGridRoot(f)) gridFiber = f;
        if (!C.grid && prevTree.size > 0 && !prevTree.has(f)) touched.push(f);
      });
      if (!C.grid) {
        for (const f of touched) {
          let childTouched = false;
          for (let c = f.child; c; c = c.sibling) if (!prevTree.has(c)) { childTouched = true; break; }
          if (childTouched) continue; // an ancestor on the path; the origin is deeper
          rendered++;
          const fn = fnOf(f); if (!fn) continue;
          tally(f);
          if (!seen.has(fn)) { seen.add(fn); const e = C.rendered.get(fn); if (e) e.commits++; }
        }
      }
      prevTree = nextTree;
      // Cheap per-commit facts while the tree is small: what the root shows, and React's pending/suspended lanes.
      let txt = null;
      if (!C.grid) { try { const el = document.getElementById('root'); txt = el ? (el.textContent || '').replace(/\\s+/g, ' ').slice(0, 24) : null; } catch { txt = null; } }
      C.commits.push({ n: C.commits.length + 1, tMs: t, fibers, rendered, touched: prevTree.size > 0 ? touched.length : null, prio: prio == null ? null : Number(prio), txt, pending: root.pendingLanes, suspended: root.suspendedLanes, pinged: root.pingedLanes });
      // Every 60th pre-grid commit: the stack that committed it (a sync flush names its caller; a scheduler task means a queued update).
      if (!C.grid && C.commits.length % 60 === 1 && C.commitStacks.length < 12) {
        C.commitStacks.push({ commit: C.commits.length, stack: String(new Error().stack).split('\\n').slice(2, 16) });
      }
      if (gridFiber && !C.grid) { const chain = chainOf(gridFiber); C.grid = { commit: C.commits.length, tMs: t, depth: chain.length, chain }; }
    };
    const hook = { renderers: new Map(), supportsFiber: true, isDisabled: false,
      inject(r) { const id = this.renderers.size + 1; this.renderers.set(id, r); return id; },
      on() {}, off() {}, sub() { return () => {}; }, emit() {}, checkDCE() {},
      onCommitFiberRoot(id, root, prio) { try { record(root, prio); } catch (e) { C.errors.push(String(e)); } },
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
  const rendered = [...(C.rendered ? C.rendered.values() : [])].sort((a, b) => b.commits - a.commits).slice(0, 25);
  // Shape of the pre-grid commits: event priorities and the gaps between them.
  const pre = C.grid ? commits.slice(0, C.grid.commit) : commits;
  const prios = {};
  for (const c of pre) prios[c.prio ?? 'null'] = (prios[c.prio ?? 'null'] ?? 0) + 1;
  const gaps = pre.slice(1).map((c, i) => c.tMs - pre[i].tMs).sort((a, b) => a - b);
  const q = (p) => (gaps.length ? gaps[Math.min(gaps.length - 1, Math.floor(p * gaps.length))] : null);
  const rootOnly = pre.filter((c) => c.touched === 0).length;
  const texts = {}; const lanes = {};
  let flips = 0;
  for (let i = 0; i < pre.length; i++) {
    const c = pre[i];
    texts[c.txt ?? 'null'] = (texts[c.txt ?? 'null'] ?? 0) + 1;
    const lk = 'p' + c.pending + '/s' + c.suspended + '/g' + c.pinged; lanes[lk] = (lanes[lk] ?? 0) + 1;
    if (i > 0 && c.txt !== pre[i - 1].txt) flips++;
  }
  const commitShape = { count: pre.length, rootOnly, prios, gapP50: q(0.5), gapP90: q(0.9), gapMax: gaps.length ? gaps[gaps.length - 1] : null, firstMs: pre[0]?.tMs ?? null, lastMs: pre[pre.length - 1]?.tMs ?? null, texts, flips, lanes };
  return {
    timeOrigin: performance.timeOrigin, nav: navOut, marks, rendered, commitShape, commitStacks: C.commitStacks ?? [], roots: C.roots ?? [],
    scripts: { count: res.length, lastScriptEnd: critical[0]?.end ?? null, top: critical.slice(0, 6), lazyAfterGrid: scripts.length - critical.length },
    firstCommitMs: commits[0]?.tMs ?? null, commitsBeforeGrid: C.grid ? C.grid.commit - 1 : commits.length, commitsTotal: commits.length,
    commitsBeforeRows: C.firstRowsMs == null ? commits.length : commits.filter((c) => c.tMs <= C.firstRowsMs).length,
    grid: C.grid, dom: C.dom, firstRowsMs: C.firstRowsMs, errors: C.errors,
  };
})()`;

/** Vite chunk name without its 8-character hash (`ag-grid-react-CzcbIgwr.js` → `ag-grid-react.js`). */
const chunkOf = (url) => { const file = (url || '').split('/').pop().split('?')[0]; return file ? file.replace(/-[A-Za-z0-9_-]{8}\.(m?js)$/, '.$1') : '(native / eval)'; };

// ── Source maps: name production functions (build star-demo with `vite build --sourcemap`) ──
let traceMapping = null;
try { traceMapping = await import('@jridgewell/trace-mapping'); } catch { /* attribution stays minified */ }
const mapCache = new Map();
async function tracerFor(url) {
  if (!traceMapping || !url) return null;
  if (mapCache.has(url)) return mapCache.get(url);
  let tracer = null;
  try {
    const res = await fetch(`${url}.map`);
    if (res.ok) tracer = new traceMapping.TraceMap(await res.json());
  } catch { /* no map served */ }
  mapCache.set(url, tracer);
  return tracer;
}
/** `fn (file:line)` for a profile call frame, through the chunk's source map when there is one. */
async function labelFor(frame) {
  const fn = frame.functionName || '(anonymous)';
  const tracer = await tracerFor(frame.url);
  if (!tracer) return `${fn} (${chunkOf(frame.url)}:${frame.lineNumber})`;
  const pos = traceMapping.originalPositionFor(tracer, { line: frame.lineNumber + 1, column: frame.columnNumber });
  if (!pos || pos.source == null) return `${fn} (${chunkOf(frame.url)}:${frame.lineNumber})`;
  const src = pos.source.split('/').slice(-2).join('/');
  return `${pos.name || fn} (${src}:${pos.line})`;
}
/** Top functions by self time inside [fromMs, toMs] of the profile. */
async function topFunctions(profile, fromMs, toMs, n) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const self = new Map();
  let tUs = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const d = profile.timeDeltas[i] ?? 0; tUs += d; const tMs = tUs / 1000;
    if (tMs <= fromMs || tMs > toMs) continue;
    const id = profile.samples[i]; const fn = byId.get(id)?.callFrame.functionName ?? '';
    if (fn === '(idle)' || fn === '(program)' || fn === '(garbage collector)' || fn === '(root)') continue;
    self.set(id, (self.get(id) ?? 0) + d);
  }
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  const out = [];
  for (const [id, us] of top) out.push({ ms: round(us / 1000), label: await labelFor(byId.get(id).callFrame) });
  return out;
}

const UPDATE_ENTRY = /^(dispatchSetState|dispatchSetStateInternal|dispatchReducerAction|forceStoreRerender|scheduleUpdateOnFiber|enqueueConcurrentRenderForLane|refreshCache|startTransition)$/;
/**
 * Who schedules the React updates inside [fromMs, toMs]? For every sample
 * whose stack passes through a React update entry point, tally the three
 * frames that called it (source-mapped). A sampled view, not a count — but
 * hundreds of updates leave a clear signature.
 */
async function updateTriggers(profile, fromMs, toMs, n) {
  const byId = new Map(profile.nodes.map((node) => [node.id, node]));
  const parent = new Map();
  for (const node of profile.nodes) for (const c of node.children ?? []) parent.set(c, node.id);
  // The minified bundle renames react-dom's internals: match on source-mapped names.
  const labels = new Map();
  const labelOf = async (node) => {
    if (!labels.has(node.id)) labels.set(node.id, await labelFor(node.callFrame));
    return labels.get(node.id);
  };
  const tally = new Map();
  let tUs = 0;
  for (let i = 0; i < profile.samples.length; i++) {
    const d = profile.timeDeltas[i] ?? 0; tUs += d; const tMs = tUs / 1000;
    if (tMs <= fromMs || tMs > toMs) continue;
    const chain = [];
    for (let p = profile.samples[i]; p != null; p = parent.get(p)) chain.push(byId.get(p));
    let k = -1;
    for (let c = 0; c < chain.length; c++) {
      const label = await labelOf(chain[c]);
      if (UPDATE_ENTRY.test(label.split(' ')[0])) { k = c; break; }
    }
    if (k < 0) continue;
    const callers = chain.slice(k + 1, k + 5);
    const key = callers.map((node) => node.id).join('>');
    const e = tally.get(key) ?? { us: 0, nodes: callers, entry: (await labelOf(chain[k])).split(' ')[0] };
    e.us += d; tally.set(key, e);
  }
  const top = [...tally.values()].sort((a, b) => b.us - a.us).slice(0, n);
  const out = [];
  for (const t of top) {
    const callerLabels = [];
    for (const node of t.nodes) callerLabels.push(await labelOf(node));
    out.push({ ms: round(t.us / 1000), entry: t.entry, callers: callerLabels });
  }
  return out;
}

/**
 * Exact update triggers: a breakpoint on react-dom's `scheduleUpdateOnFiber`
 * (found through the source map of the chunk that bundles react-dom), a
 * stack captured per hit, resume. Costs a few ms per hit, so only the
 * pre-grid window is captured (`maxHits`).
 */
async function armUpdateBreakpoint(session, appOrigin, maxHits, fnName = 'scheduleUpdateOnFiber') {
  const hits = [];
  // Async stacks: a ping's synchronous stack ends in a microtask; the async parent says where the thenable came from.
  await session.send('Debugger.setAsyncCallStackDepth', { maxDepth: 12 }).catch(() => {});
  let armed = false;
  let breakpointId = null;
  let disarmed = false;
  // Evaluations fail while the debugger is paused, so the breakpoint goes away before anything is read back.
  const disarm = async () => {
    if (disarmed) return;
    disarmed = true;
    await session.send('Debugger.setBreakpointsActive', { active: false }).catch(() => {});
    if (breakpointId) await session.send('Debugger.removeBreakpoint', { breakpointId }).catch(() => {});
    await session.send('Debugger.resume').catch(() => {});
  };
  const tryArm = async (scriptUrl) => {
    if (armed || !/\/assets\/index-[A-Za-z0-9_-]{8}\.js$/.test(scriptUrl)) return;
    const tracer = await tracerFor(scriptUrl);
    if (!tracer) return;
    const sources = tracer.resolvedSources ?? tracer.sources ?? [];
    const idx = sources.findIndex((s) => /react-dom-client\.production\.js$/.test(s));
    if (idx < 0) return;
    const content = tracer.sourcesContent?.[idx];
    if (!content) return;
    const line = content.split('\n').findIndex((l) => new RegExp(`function ${fnName}\\(`).test(l));
    if (line < 0) return;
    const gen = traceMapping.generatedPositionFor(tracer, { source: sources[idx], line: line + 1, column: 0 });
    if (gen.line == null) return;
    armed = true;
    const r = await session.send('Debugger.setBreakpointByUrl', { url: scriptUrl, lineNumber: gen.line - 1, columnNumber: gen.column });
    breakpointId = r?.breakpointId ?? null;
  };
  const offParsed = session.on('Debugger.scriptParsed', (p) => { if (p.url && p.url.startsWith(appOrigin)) void tryArm(p.url); });
  const offPaused = session.on('Debugger.paused', (p) => {
    if (hits.length < maxHits) {
      const frame = (f) => ({ functionName: f.functionName, scriptId: f.location.scriptId, lineNumber: f.location.lineNumber, columnNumber: f.location.columnNumber });
      const sync = (p.callFrames ?? []).slice(1, 5).map(frame);
      const asyncFrames = [];
      for (let a = p.asyncStackTrace; a && asyncFrames.length < 6; a = a.parent) {
        for (const f of (a.callFrames ?? []).slice(0, 3)) asyncFrames.push({ ...frame({ ...f, location: f }), async: a.description || 'async' });
      }
      hits.push({ tMs: Date.now(), frames: [...sync, ...asyncFrames] });
    }
    if (hits.length >= maxHits) void disarm();
    else void session.send('Debugger.resume').catch(() => {});
  });
  return { hits, disarm, dispose: () => { offParsed(); offPaused(); }, isArmed: () => armed };
}

/**
 * Non-pausing counters: a conditional breakpoint per react-dom internal whose
 * condition records a stack into the page and evaluates to false, so the
 * page keeps its timing (a pausing breakpoint slows the load 20× and the
 * commit storm under study disappears).
 */
async function armCounters(session, appOrigin, fnNames) {
  let armed = [];
  const tryArm = async (scriptUrl) => {
    if (armed.length || !/\/assets\/index-[A-Za-z0-9_-]{8}\.js$/.test(scriptUrl)) return;
    const tracer = await tracerFor(scriptUrl);
    if (!tracer) return;
    const sources = tracer.resolvedSources ?? tracer.sources ?? [];
    const idx = sources.findIndex((s) => /react-dom-client\.production\.js$/.test(s));
    if (idx < 0) return;
    const lines = (tracer.sourcesContent?.[idx] ?? '').split('\n');
    for (const fn of fnNames) {
      const line = lines.findIndex((l) => new RegExp(`function ${fn}\\(`).test(l));
      if (line < 0) continue;
      const gen = traceMapping.generatedPositionFor(tracer, { source: sources[idx], line: line + 1, column: 0 });
      if (gen.line == null) continue;
      const condition = `((window.__coldReloadHits = window.__coldReloadHits || []).length < 4000 && window.__coldReloadHits.push({ fn: ${JSON.stringify(fn)}, t: performance.now(), stack: new Error().stack.split('\\n').slice(2, 8).join('|') }), false)`;
      await session.send('Debugger.setBreakpointByUrl', { url: scriptUrl, lineNumber: gen.line - 1, columnNumber: gen.column, condition });
      armed.push(fn);
    }
  };
  const off = session.on('Debugger.scriptParsed', (p) => { if (p.url && p.url.startsWith(appOrigin)) void tryArm(p.url); });
  return { dispose: off, armed: () => armed };
}

async function summarizeCounters(session, fromMs, toMs, n) {
  const hits = await evaluate(session, 'window.__coldReloadHits ? JSON.parse(JSON.stringify(window.__coldReloadHits)) : []');
  const inWindow = hits.filter((h) => h.t > fromMs && h.t <= toMs);
  const perFn = {};
  const stacks = new Map();
  for (const h of inWindow) {
    perFn[h.fn] = (perFn[h.fn] ?? 0) + 1;
    const key = h.fn + '|' + h.stack;
    stacks.set(key, (stacks.get(key) ?? 0) + 1);
  }
  const top = [...stacks.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
  const out = [];
  for (const [key, count] of top) {
    const [fn, ...rest] = key.split('|');
    const frames = [];
    for (const line of rest) {
      const m = /at (?:(.+?) \()?(https?:[^)]+):(\d+):(\d+)\)?/.exec(line);
      if (m) frames.push(await labelFor({ functionName: m[1] ?? '(anonymous)', url: m[2], lineNumber: Number(m[3]) - 1, columnNumber: Number(m[4]) - 1 }));
    }
    out.push({ fn, count, frames });
  }
  return { total: hits.length, inWindow: inWindow.length, perFn, top: out };
}

async function tallyTriggerStacks(hits, scripts, n) {
  const tally = new Map();
  for (const h of hits) {
    const key = h.frames.map((f) => `${f.scriptId}:${f.lineNumber}:${f.columnNumber}`).join('>');
    const e = tally.get(key) ?? { count: 0, frames: h.frames };
    e.count++; tally.set(key, e);
  }
  const out = [];
  for (const t of [...tally.values()].sort((a, b) => b.count - a.count).slice(0, n)) {
    const labels = [];
    for (const f of t.frames) {
      const label = await labelFor({ functionName: f.functionName, url: scripts.get(f.scriptId) ?? f.url, lineNumber: f.lineNumber, columnNumber: f.columnNumber });
      labels.push(f.async ? `[${f.async}] ${label}` : label);
    }
    out.push({ count: t.count, stack: labels });
  }
  return out;
}

/** Resolve where each component function lives (`[[FunctionLocation]]` over CDP), through the source maps. */
async function locateComponents(session, scripts, rendered) {
  const out = [];
  for (const r of rendered) {
    let where = '';
    try {
      const { result } = await session.send('Runtime.evaluate', { expression: `window.__coldReload.types[${r.i}] || undefined`, returnByValue: false });
      if (result?.objectId) {
        const { internalProperties } = await session.send('Runtime.getProperties', { objectId: result.objectId });
        const loc = internalProperties?.find((p) => p.name === '[[FunctionLocation]]')?.value?.value;
        if (loc) {
          const url = scripts.get(loc.scriptId);
          where = await labelFor({ functionName: r.name, url, lineNumber: loc.lineNumber, columnNumber: loc.columnNumber });
        }
      }
    } catch { /* keep the minified name */ }
    out.push({ ...r, where });
  }
  return out;
}

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
  // Script ids → urls, so component function locations can be mapped.
  await session.send('Debugger.enable');
  const scripts = new Map();
  const offScripts = session.on('Debugger.scriptParsed', (p) => { if (p.url) scripts.set(p.scriptId, p.url); });
  const { identifier } = await session.send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
  const origin = new URL(target.url).origin;
  const bp = args.triggers > 0 ? await armUpdateBreakpoint(session, origin, args.triggers, args.breakOn) : null;
  const counters = args.count.length > 0 ? await armCounters(session, origin, args.count) : null;
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
  if (bp) await bp.disarm();
  await sleep(1000);
  const { profile } = await session.send('Profiler.stop');
  await session.send('Profiler.disable');
  const data = await evaluate(session, COLLECT);
  offConsole();
  const rendered = await locateComponents(session, scripts, data.rendered ?? []);
  // Commit-time stacks: "at fn (url:line:col)" → source-mapped labels.
  const commitStacks = [];
  for (const s of data.commitStacks ?? []) {
    const frames = [];
    for (const line of s.stack) {
      const m = /at (?:(.+?) \()?(https?:[^)]+):(\d+):(\d+)\)?/.exec(line);
      if (!m) continue;
      frames.push(await labelFor({ functionName: m[1] ?? '(anonymous)', url: m[2], lineNumber: Number(m[3]) - 1, columnNumber: Number(m[4]) - 1 }));
    }
    commitStacks.push({ commit: s.commit, frames });
  }
  const exactTriggers = bp ? { armed: bp.isArmed(), hits: bp.hits.length, stacks: await tallyTriggerStacks(bp.hits, scripts, 10) } : null;
  bp?.dispose();
  const preGridFrom = data.marks.find((m) => m.name === 'platform-ready')?.tMs ?? 0;
  const preGridTo = data.grid?.tMs ?? data.firstRowsMs ?? Infinity;
  const counterSummary = counters ? { armed: counters.armed(), ...(await summarizeCounters(session, preGridFrom, preGridTo, 12)) } : null;
  counters?.dispose();
  offScripts();
  await session.send('Debugger.disable').catch(() => {});
  await session.send('Page.removeScriptToEvaluateOnNewDocument', { identifier }).catch(() => {});
  const banner = consoleAt.map((c) => ({ tMs: round(c.epochMs - data.timeOrigin), head: c.head }));
  const r = { page: pageLabel(target), timedOut: ready == null, ...data, rendered, banner, commitStacks, counterSummary };
  const steps = ladder(r);
  const segments = steps.map((s, i) => ({ name: s.name, fromMs: i === 0 ? 0 : steps[i - 1].tMs, toMs: s.tMs }));
  // Function-level view of the mount stack: platform-ready → the grid being created.
  const from = r.marks.find((m) => m.name === 'platform-ready')?.tMs ?? 0;
  const to = r.banner[0]?.tMs ?? r.grid?.tMs ?? from;
  const mountStackFunctions = to > from ? await topFunctions(profile, from, to, args.functions ?? 0) : [];
  const triggers = to > from && args.functions > 0 ? await updateTriggers(profile, from, to, 12) : [];
  return { ...r, ladder: steps, cpu: attribute(profile, segments), mountStack: { fromMs: from, toMs: to, functions: mountStackFunctions, triggers, exactTriggers } };
}

function ladder(r) {
  const rows = [];
  const push = (name, t) => { if (t != null) rows.push({ name, tMs: round(t) }); };
  if (r.nav) { push('response end (HTML)', r.nav.responseEnd); push('DOMContentLoaded', r.nav.domContentLoaded); }
  push('last critical script chunk fetched', r.scripts.lastScriptEnd);
  push('first React commit', r.firstCommitMs);
  for (const m of r.marks) push(`mark ${m.name}`, m.tMs);
  push('AG Grid root in the DOM (grid creation starts)', r.dom.gridRoot);
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
  const own = { runs: 1, timeout: 60, target: '', functions: 0, triggers: 0, breakOn: 'scheduleUpdateOnFiber', count: [] };
  const shared = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--runs' || argv[i] === '--timeout' || argv[i] === '--functions' || argv[i] === '--triggers') { own[argv[i].slice(2)] = Number(argv[i + 1]); i++; continue; }
    if (argv[i] === '--target') { own.target = String(argv[i + 1] ?? ''); i++; continue; }
    if (argv[i] === '--break') { own.breakOn = String(argv[i + 1] ?? own.breakOn); i++; continue; }
    if (argv[i] === '--count') { own.count = String(argv[i + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean); i++; continue; }
    shared.push(argv[i]);
  }
  const args = { ...parseArgs(shared, { interval: 500 }), functions: own.functions, triggers: own.triggers, breakOn: own.breakOn, count: own.count };
  const { runs, timeout } = own;
  if (args.help) {
    console.log(['cdp-cold-reload.mjs — cold reload ladder + CPU by chunk, navigation → first rows (reloads the page)', ...COMMON_FLAGS,
      '  --runs <n>       reloads per page (default 1)', '  --timeout <s>    give up waiting for rows (default 60)', '  --interval <µs>  profiler sampling interval (default 500)',
      '  --target <id>    DevTools target id (prefix) — reload exactly this page when several share a URL',
      '  --functions <n>  top n functions by self time inside platform-ready → grid created, plus the components that rendered',
      '                   most before the grid; names come from the source maps (`vite build --sourcemap`)',
      '  --triggers <n>   break on react-dom scheduleUpdateOnFiber for the first n updates and tally the calling stacks (slows the load)'].join('\n'));
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
    if (args.functions > 0) {
      console.log(`  mount stack ${r.mountStack.fromMs} → ${r.mountStack.toMs} ms — top functions by self time:`);
      for (const f of r.mountStack.functions) console.log(`  ${String(f.ms).padStart(7)}  ${f.label}`);
      console.log('  React updates scheduled in that window — sampled ms, entry point, and who called it:');
      for (const t of r.mountStack.triggers) console.log(`  ${String(t.ms).padStart(7)}  ${t.entry} ← ${t.callers.join(' ← ')}`);
      const ex = r.mountStack.exactTriggers;
      if (ex) {
        console.log(`  exact: breakpoint ${ex.armed ? 'armed' : 'NOT armed'}, ${ex.hits} scheduleUpdateOnFiber hits captured — top stacks (count: callers):`);
        for (const s of ex.stacks) console.log(`  ${String(s.count).padStart(6)}: ${s.stack.join(' ← ')}`);
      }
      const cs = r.commitShape;
      console.log(`  pre-grid commits: ${cs.count} between ${cs.firstMs} and ${cs.lastMs} ms (${cs.rootOnly} touched no fiber — root-only commits); gap p50 ${round(cs.gapP50)} / p90 ${round(cs.gapP90)} / max ${round(cs.gapMax)} ms`);
      console.log(`  root text at commit (${cs.flips} flips): ${JSON.stringify(cs.texts)}`);
      console.log(`  root lanes at commit (pending/suspended/pinged): ${JSON.stringify(cs.lanes)}`);
      for (const s of r.commitStacks) console.log(`  commit #${s.commit} committed from: ${s.frames.join(' ← ')}`);
      console.log('  React roots that committed (container: commits, of which with an empty tree; first commit ms):');
      for (const rt of r.roots) console.log(`    ${rt.container}: ${rt.commits} commits, ${rt.emptyCommits} empty, first at ${round(rt.firstMs)} ms`);
      const cnt = r.counterSummary;
      if (cnt) {
        console.log(`  counters (non-pausing) armed for ${cnt.armed.join(', ') || 'nothing'}: ${cnt.inWindow} hits in platform-ready → grid mounted (${cnt.total} total) ${JSON.stringify(cnt.perFn)}`);
        for (const t of cnt.top) console.log(`  ${String(t.count).padStart(6)}  ${t.fn} ← ${t.frames.join(' ← ')}`);
      }
      console.log('  components rendered before the grid mounted (commits / fibers; same-props vs new-props renders; hooks):');
      for (const c of r.rendered.slice(0, args.functions)) {
        const w = c.why ? ` [of ${c.why.samples}: lanes ${c.why.lanes}, altLanes ${c.why.altLanes}, ctx deps ${c.why.deps}, parent rendered ${c.why.parentRendered}${c.why.fallback ? `, showing fallback ${c.why.fallback}` : ''}]${c.why.chain ? `\n           at ${c.why.chain}` : ''}` : '';
        console.log(`  ${String(c.commits).padStart(5)} / ${String(c.fibers).padStart(5)}  same ${c.sameProps} new ${c.newProps} hooks ${c.hooks}  ${c.name}${c.where ? `  → ${c.where}` : ''}${w}`);
      }
    }
    console.log(`  CPU navigation → rows (+1 s): busy ${r.cpu.busyMs} ms, idle ${r.cpu.idleMs} ms of ${r.cpu.totalMs} ms sampled`);
    console.log('  busy ms  chunk');
    for (const c of r.cpu.rows.slice(0, args.top)) console.log(`  ${String(c.ms).padStart(7)}  ${c.chunk}`);
    console.log('  largest scripts (kB, fetched by ms): ' + r.scripts.top.map((s) => `${s.name} ${s.kb} kB @${round(s.end)}`).join(', '));
    if (r.errors.length) console.log('  hook errors: ' + r.errors.join(' | '));
  }
  console.log(`\nwrote ${writeResult('cdp-cold-reload', args.tag, { args: { ...args, runs, timeout }, results })}`);
});
