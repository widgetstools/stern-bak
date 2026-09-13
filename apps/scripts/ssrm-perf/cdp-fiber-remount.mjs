// cdp-fiber-remount.mjs — how many AG Grid instances does a page mount, when,
// and how deep in the React tree?
//
// WORKLOG 20 found every blotter building its grid twice by installing a
// minimal `__REACT_DEVTOOLS_GLOBAL_HOOK__` before the app ran (production
// React still calls `hook.onCommitFiberRoot` per commit) and diffing the
// ancestor chains of the two instances. This is that probe as a script.
// Refactor plan D0/D2: fiber depth to the grid, one instance per load.
//
// A grid instance is the host fiber whose DOM node carries `ag-root-wrapper`
// (the scrollbar-width probe appends one under <body> outside React, so it
// never appears here). Component names come from `type.displayName || name`;
// a minified production bundle may shorten them — the chain SHAPE and the
// keys still tell two instances apart.
//
// Always reloads the page (the hook must exist before React loads):
//   node cdp-fiber-remount.mjs --url blotter --warmup 8
import { COMMON_FLAGS, evaluate, forEachPage, pageLabel, parseArgs, reloadWith, run, writeResult } from './cdpDock.mjs';

const HOOK = `(() => {
  if (window.__REACT_DEVTOOLS_GLOBAL_HOOK__) return;
  const R = window.__fiberRemount = { commits: 0, renderers: 0, grids: [], events: [], lastCount: -1 };
  const seen = new WeakMap();
  let nextId = 0;
  const nm = (t) => (t && (t.displayName || t.name)) || null;
  const nameOf = (f) => {
    const t = f.type ?? f.elementType;
    if (typeof t === 'string') return t;
    if (nm(t)) return nm(t);
    if (t && t.render && nm(t.render)) return 'forwardRef(' + nm(t.render) + ')';
    if (t && t.type && nm(t.type)) return 'memo(' + nm(t.type) + ')';
    if (t && t._payload) return 'lazy';
    return 'tag' + f.tag;
  };
  const isGridRoot = (f) => !!(f.stateNode && f.stateNode.classList && f.stateNode.classList.contains('ag-root-wrapper'));
  const chainOf = (f) => { const out = []; for (let p = f; p; p = p.return) out.push(nameOf(p) + (p.key != null ? '[key=' + String(p.key) + ']' : '')); return out.reverse(); };
  const walk = (root, fn) => {
    let n = root;
    while (n) {
      fn(n);
      if (n.child) { n = n.child; continue; }
      while (n && n !== root && !n.sibling) n = n.return;
      if (!n || n === root) return;
      n = n.sibling;
    }
  };
  const record = (root) => {
    R.commits++;
    const t = Math.round(performance.now());
    let count = 0;
    walk(root.current, (f) => {
      if (!isGridRoot(f)) return;
      count++;
      if (seen.has(f.stateNode)) return;
      const id = ++nextId; seen.set(f.stateNode, id);
      const chain = chainOf(f);
      R.grids.push({ id, firstCommit: R.commits, tMs: t, depth: chain.length, chain });
      R.events.push({ commit: R.commits, tMs: t, type: 'grid-mounted', id });
    });
    if (count !== R.lastCount) { R.lastCount = count; R.events.push({ commit: R.commits, tMs: t, type: 'grid-count', count }); }
  };
  const hook = {
    renderers: new Map(), supportsFiber: true, isDisabled: false,
    inject(renderer) { const id = ++R.renderers; this.renderers.set(id, renderer); return id; },
    on() {}, off() {}, sub() { return () => {}; }, emit() {}, checkDCE() {},
    onCommitFiberRoot(id, root) { try { record(root); } catch (e) { R.events.push({ type: 'error', error: String(e) }); } },
    onPostCommitFiberRoot() {}, onCommitFiberUnmount() {}, getFiberRoots() { return new Set(); },
  };
  Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', { value: hook, configurable: false, enumerable: false, writable: false });
})()`;

function diffChains(a, b) {
  let common = 0;
  while (common < a.length && common < b.length && a[common] === b[common]) common++;
  return { commonDepth: common, tailA: a.slice(common), tailB: b.slice(common) };
}

run(async () => {
  const args = parseArgs(process.argv.slice(2), { warmup: 8 });
  if (args.help) {
    console.log(['cdp-fiber-remount.mjs — AG Grid instances per load + fiber depth (reloads the page)', ...COMMON_FLAGS,
      '  --warmup <s>     seconds to wait after the reload before reading (default 8)'].join('\n'));
    return;
  }
  const results = await forEachPage(args, async (session, target) => {
    const dispose = await reloadWith(session, HOOK, { warmupMs: args.warmup * 1000 });
    const r = await evaluate(session, 'window.__fiberRemount ? JSON.parse(JSON.stringify(window.__fiberRemount)) : { missing: true }');
    await dispose();
    return { page: pageLabel(target), ...r };
  });

  for (const r of results) {
    console.log(`\n${r.page}`);
    if (r.missing) { console.log('  hook not installed — the page did not reload through this session'); continue; }
    if (r.renderers === 0) { console.log(`  no React renderer injected in ${args.warmup} s — not a React page, or React loaded before the hook`); continue; }
    console.log(`  ${r.commits} commits, ${r.renderers} renderer(s), ${r.grids.length} AG Grid instance(s) mounted`);
    for (const g of r.grids) console.log(`  grid #${g.id}: first commit ${g.firstCommit} at ${g.tMs} ms, depth ${g.depth} fibers\n    ${g.chain.join(' > ')}`);
    if (r.grids.length >= 2) {
      const d = diffChains(r.grids[0].chain, r.grids[1].chain);
      console.log(`  grid #1 vs #2: share ${d.commonDepth} ancestors; diverge at\n    #1 …${d.tailA.slice(0, 6).join(' > ')}\n    #2 …${d.tailB.slice(0, 6).join(' > ')}`);
    }
    const counts = r.events.filter((e) => e.type === 'grid-count').map((e) => `${e.count}@${e.commit}`);
    console.log(`  grid count by commit: ${counts.join(' → ')}`);
  }
  console.log(`\nwrote ${writeResult('cdp-fiber-remount', args.tag, { args, results })}`);
});
