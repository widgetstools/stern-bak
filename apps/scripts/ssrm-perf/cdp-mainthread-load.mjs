// cdp-mainthread-load.mjs — event-loop lag, frame gaps and long tasks per
// view, the numbers that diagnosed the docked six-blotter freeze (WORKLOG 21,
// experiment doc §4): shared renderer 338 ms p50 / 737 ms p95 lag at 4–5 fps;
// one renderer per view 0 / 96–153 ms at 60 fps. Refactor plan acceptance:
// six docked views without isolation lag p95 < 250 ms (B3); with isolation
// < 150 ms (A).
//
//   node cdp-mainthread-load.mjs --url blotter --all --seconds 10
// Runs in parallel on every selected page; nothing is reloaded. A hidden view
// reports no frames (requestAnimationFrame does not run while hidden) — that
// is expected; its lag and long tasks still measure.
import { COMMON_FLAGS, evaluate, forEachPage, pageLabel, parseArgs, pct, round, run, writeResult } from './cdpDock.mjs';

const SAMPLE = (seconds) => `new Promise((resolve) => {
  const lag = [], gaps = [], long = [];
  const period = 50;
  let expected = performance.now() + period;
  const iv = setInterval(() => { const now = performance.now(); lag.push(Math.max(0, now - expected)); expected = now + period; }, period);
  let last = performance.now(), rafOn = true;
  const raf = () => { if (!rafOn) return; const now = performance.now(); gaps.push(now - last); last = now; requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  let po = null;
  try { po = new PerformanceObserver((l) => { for (const e of l.getEntries()) long.push(e.duration); }); po.observe({ type: 'longtask' }); } catch {}
  setTimeout(() => {
    clearInterval(iv); rafOn = false; if (po) po.disconnect();
    resolve({ ms: ${seconds} * 1000, visibility: document.visibilityState, lag, gaps, longTasks: long });
  }, ${seconds} * 1000);
})`;

run(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(['cdp-mainthread-load.mjs — lag / frame gaps / long tasks per page', ...COMMON_FLAGS,
      '  --seconds <n>    sample window (default 10)'].join('\n'));
    return;
  }
  const results = await forEachPage(args, async (session, target) => {
    const s = await evaluate(session, SAMPLE(args.seconds));
    const sec = s.ms / 1000;
    return {
      page: pageLabel(target), visibility: s.visibility, seconds: sec,
      lag: { p50: round(pct(s.lag, 50)), p95: round(pct(s.lag, 95)), max: round(Math.max(0, ...s.lag)) },
      frames: s.gaps.length > 1
        ? { count: s.gaps.length, fps: round(s.gaps.length / sec), gapP50: round(pct(s.gaps, 50)), gapP95: round(pct(s.gaps, 95)), gapMax: round(Math.max(...s.gaps)) }
        : null,
      longTasks: { count: s.longTasks.length, totalMs: round(s.longTasks.reduce((a, b) => a + b, 0)), maxMs: round(s.longTasks.length ? Math.max(...s.longTasks) : 0) },
    };
  });

  console.log('\nlag p50/p95/max ms   frames fps gap p50/p95 ms   long tasks n / total ms / max ms   visibility   page');
  for (const r of results) {
    const f = r.frames ? `${String(r.frames.count).padStart(4)} ${String(r.frames.fps).padStart(4)} ${String(r.frames.gapP50).padStart(5)}/${String(r.frames.gapP95).padStart(5)}` : '   no frames (hidden)  ';
    console.log(`${String(r.lag.p50).padStart(5)}/${String(r.lag.p95).padStart(5)}/${String(r.lag.max).padStart(5)}   ${f}   ${String(r.longTasks.count).padStart(3)} / ${String(r.longTasks.totalMs).padStart(7)} / ${String(r.longTasks.maxMs).padStart(6)}   ${r.visibility.padEnd(10)}   ${r.page}`);
  }
  console.log(`\nwrote ${writeResult('cdp-mainthread-load', args.tag, { args, results })}`);
});
