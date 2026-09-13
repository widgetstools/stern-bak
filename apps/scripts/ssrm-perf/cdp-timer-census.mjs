// cdp-timer-census.mjs — who schedules timers on a view's main thread?
//
// WORKLOG 21: AG Grid's transaction path scheduled two timers per updated
// row — 189 490 setTimeout + 94 726 clearTimeout in 10 s on ONE view, 74 841
// of them run as separate macrotasks. CPU profiles show that only as native
// self time; wrapping setTimeout/clearTimeout and bucketing by callback
// source names the schedulers (ag-grid-react RenderStatusService, the
// enterprise FindService debounce). Refactor plan B0/B1 acceptance:
// setTimeout < 5 000 per 10 s, timers run as tasks < 2 000.
//
//   node cdp-timer-census.mjs --url blotter --all          # every docked blotter view
//   node cdp-timer-census.mjs --url stomp-ssrm --seconds 10
//   --reload   install the wrapper BEFORE the app loads (catches code that
//              captured setTimeout at module init). Default: wrap the live
//              page in place — no reload, the docked layout keeps its state.
import { COMMON_FLAGS, evaluate, forEachPage, pageLabel, parseArgs, reloadWith, run, sleep, writeResult } from './cdpDock.mjs';

const WRAP = `(() => {
  if (window.__timerCensus) return 'already';
  const C = window.__timerCensus = { on: false, set: 0, clear: 0, ran: 0, buckets: new Map(), t0: 0 };
  const keyOf = (fn, delay) => {
    let src;
    if (typeof fn === 'function') src = (fn.name ? fn.name + ' ' : '') + String(fn).replace(/\\s+/g, ' ').slice(0, 96);
    else src = 'string:' + String(fn).slice(0, 60);
    return (delay | 0) + 'ms ' + src;
  };
  const oSet = window.setTimeout, oClear = window.clearTimeout;
  window.setTimeout = function (fn, delay, ...rest) {
    if (!C.on) return oSet.call(window, fn, delay, ...rest);
    C.set++;
    const key = keyOf(fn, delay);
    let b = C.buckets.get(key);
    if (!b) { b = { set: 0, ran: 0 }; C.buckets.set(key, b); }
    b.set++;
    const wrapped = typeof fn === 'function'
      ? function (...a) { if (C.on) { C.ran++; b.ran++; } return fn.apply(this, a); }
      : fn;
    return oSet.call(window, wrapped, delay, ...rest);
  };
  window.clearTimeout = function (id) { if (C.on) C.clear++; return oClear.call(window, id); };
  C.start = () => { C.on = true; C.set = C.clear = C.ran = 0; C.buckets.clear(); C.t0 = performance.now(); };
  C.stop = () => {
    C.on = false;
    const ms = performance.now() - C.t0;
    const buckets = [...C.buckets.entries()].map(([key, b]) => ({ key, ...b })).sort((a, b) => b.set - a.set);
    return { ms, set: C.set, clear: C.clear, ran: C.ran, buckets };
  };
  return 'installed';
})()`;

run(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(['cdp-timer-census.mjs — count setTimeout/clearTimeout by callback source', ...COMMON_FLAGS,
      '  --seconds <n>    census window (default 10)', '  --reload         install before load (default: wrap in place)',
      '  --warmup <s>     seconds to wait after a reload (default 3)', '  --top <n>        buckets to print (default 15)'].join('\n'));
    return;
  }
  const results = await forEachPage(args, async (session, target) => {
    let dispose = null;
    if (args.reload) dispose = await reloadWith(session, WRAP, { warmupMs: args.warmup * 1000 });
    else {
      const r = await evaluate(session, WRAP);
      if (r !== 'installed' && r !== 'already') throw new Error(`${pageLabel(target)}: wrapper returned ${r}`);
    }
    await evaluate(session, 'window.__timerCensus.start()');
    await sleep(args.seconds * 1000);
    const snap = await evaluate(session, 'window.__timerCensus.stop()');
    if (dispose) await dispose();
    return { page: pageLabel(target), ...snap, bucketCount: snap.buckets.length, buckets: snap.buckets.slice(0, args.top) };
  });

  for (const r of results) {
    const s = r.ms / 1000;
    console.log(`\n${r.page}\n  ${s.toFixed(1)} s: setTimeout ${r.set}  clearTimeout ${r.clear}  ran as tasks ${r.ran}  (${(r.set / s).toFixed(0)} set/s, ${r.bucketCount} buckets)`);
    console.log('  set      ran      bucket (delay + callback source)');
    for (const b of r.buckets) console.log(`  ${String(b.set).padStart(7)}  ${String(b.ran).padStart(7)}  ${b.key}`);
  }
  console.log(`\nwrote ${writeResult('cdp-timer-census', args.tag, { args, results })}`);
});
