// cdp-hidden-liveness.mjs — is a hidden / inactive-tab view alive, and does
// the page even KNOW it is hidden?
//
// Two questions, one probe:
//   1. Liveness (experiment doc §4, Phase A acceptance): a 100 ms interval
//      over 8 s should fire ≥ 70 of 80 times in a hidden tab; the earlier
//      isolation revert's failure mode was hidden views going blank.
//   2. The hidden SIGNAL (refactor plan Phase C entry criterion): the hub's
//      `meta.hidden` is derived from `document.hidden`
//      (SharedWorkerDataServicesClient.ts:969). If an inactive OpenFin tab
//      reports `visibilityState === 'visible'`, hub-side pausing never
//      triggers for exactly its target case. This prints it per view, next
//      to OpenFin's own `View.isShowing()` when `fin` is present.
//
//   node cdp-hidden-liveness.mjs --url blotter --all --seconds 8
import { COMMON_FLAGS, evaluate, forEachPage, pageLabel, parseArgs, round, run, writeResult } from './cdpDock.mjs';

const PROBE = (seconds) => `(async () => {
  const vis = { visibilityState: document.visibilityState, hidden: document.hidden, hasFocus: document.hasFocus(), fin: typeof fin !== 'undefined', finShowing: null };
  if (vis.fin) { try { vis.finShowing = await fin.View.getCurrentSync().isShowing(); } catch (e) { vis.finShowing = 'n/a: ' + String(e && e.message || e); } }
  return new Promise((resolve) => {
    const expected = Math.round(${seconds} * 1000 / 100);
    let fired = 0, maxGap = 0, last = performance.now(), rafFrames = 0, rafOn = true;
    const raf = () => { if (!rafOn) return; rafFrames++; requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    const iv = setInterval(() => { const now = performance.now(); maxGap = Math.max(maxGap, now - last); last = now; fired++; }, 100);
    setTimeout(() => { clearInterval(iv); rafOn = false; resolve({ ...vis, expected, fired, maxGap, rafFrames }); }, ${seconds} * 1000 + 50);
  });
})()`;

run(async () => {
  const args = parseArgs(process.argv.slice(2), { seconds: 8 });
  if (args.help) {
    console.log(['cdp-hidden-liveness.mjs — 100 ms timer liveness + document.visibilityState per page', ...COMMON_FLAGS,
      '  --seconds <n>    window (default 8 → 80 expected ticks)'].join('\n'));
    return;
  }
  const results = await forEachPage(args, async (session, target) => ({ page: pageLabel(target), ...(await evaluate(session, PROBE(args.seconds))) }));
  console.log('\nvisibilityState  hidden  fin.isShowing  ticks fired/expected  max gap ms  rAF frames  page');
  for (const r of results) {
    console.log(`${r.visibilityState.padEnd(15)}  ${String(r.hidden).padEnd(6)}  ${String(r.fin ? r.finShowing : '(no fin)').padEnd(13)}  ${String(r.fired).padStart(5)}/${String(r.expected).padEnd(9)}  ${String(round(r.maxGap, 0)).padStart(10)}  ${String(r.rafFrames).padStart(10)}  ${r.page}`);
  }
  console.log(`\nwrote ${writeResult('cdp-hidden-liveness', args.tag, { args, results })}`);
});
