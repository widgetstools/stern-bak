// cdp-cpu-profile.mjs — where does a view's main thread go, by function?
//
// WORKLOG 21 put AG Grid's batched transaction flushes
// (`executeBatchUpdateRowData`) at 867 ms per 10 s per view; refactor plan
// B0 / B1 judge "flush + listener time per 10 s". This samples a page with
// the DevTools Profiler for --seconds and reports, per --match pattern, the
// time of samples whose stack contains a matching frame (inclusive, counted
// once per sample even when frames nest), plus busy / idle / (program) / GC
// totals and the top self-time functions.
//
//   node cdp-cpu-profile.mjs --url blotter --all --seconds 10
//   node cdp-cpu-profile.mjs --url blotter --match executeBatchUpdateRowData,refreshCells --interval 100
// Sampling adds a little overhead to the page; run the lag probe separately.
import { COMMON_FLAGS, forEachPage, pageLabel, parseArgs, round, run, sleep, writeResult } from './cdpDock.mjs';

const DEFAULT_MATCH = 'executeBatchUpdateRowData,processResizeOperations,refreshCells,flushAsyncQueue,handleMessage';

function summarize(profile, patterns) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const parent = new Map();
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id);
  const regs = patterns.map((p) => new RegExp(p));
  const matched = patterns.map(() => 0);
  const self = new Map();
  let total = 0, idle = 0, program = 0, gc = 0;
  const { samples, timeDeltas } = profile;
  for (let i = 0; i < samples.length; i++) {
    const d = timeDeltas[i] ?? 0;
    total += d;
    const id = samples[i];
    const fn = byId.get(id)?.callFrame.functionName ?? '';
    if (fn === '(idle)') { idle += d; continue; }
    if (fn === '(program)') program += d;
    else if (fn === '(garbage collector)') gc += d;
    self.set(id, (self.get(id) ?? 0) + d);
    const hit = new Array(regs.length).fill(false);
    for (let p = id; p != null; p = parent.get(p)) {
      const name = byId.get(p)?.callFrame.functionName ?? '';
      for (let k = 0; k < regs.length; k++) if (!hit[k] && regs[k].test(name)) hit[k] = true;
    }
    for (let k = 0; k < hit.length; k++) if (hit[k]) matched[k] += d;
  }
  const top = [...self.entries()]
    .map(([id, us]) => { const f = byId.get(id).callFrame; return { fn: f.functionName || '(anonymous)', file: (f.url || '').split('/').pop().split('?')[0], line: f.lineNumber, ms: round(us / 1000) }; })
    .sort((a, b) => b.ms - a.ms);
  return {
    totalMs: round(total / 1000), busyMs: round((total - idle) / 1000), idleMs: round(idle / 1000),
    programMs: round(program / 1000), gcMs: round(gc / 1000),
    matched: patterns.map((pattern, k) => ({ pattern, ms: round(matched[k] / 1000) })),
    top,
  };
}

run(async () => {
  const args = parseArgs(process.argv.slice(2), { match: DEFAULT_MATCH });
  if (args.help) {
    console.log(['cdp-cpu-profile.mjs — sampled CPU profile per page, inclusive time per matched function', ...COMMON_FLAGS,
      '  --seconds <n>     profile window (default 10)', '  --interval <µs>   sampling interval (default 250)',
      `  --match <a,b,…>   regex patterns for functionName (default ${DEFAULT_MATCH})`, '  --top <n>         self-time rows to print (default 15)'].join('\n'));
    return;
  }
  const patterns = args.match.split(',').map((s) => s.trim()).filter(Boolean);
  const results = await forEachPage(args, async (session, target) => {
    await session.send('Profiler.enable');
    await session.send('Profiler.setSamplingInterval', { interval: args.interval });
    await session.send('Profiler.start');
    await sleep(args.seconds * 1000);
    const { profile } = await session.send('Profiler.stop');
    await session.send('Profiler.disable');
    const s = summarize(profile, patterns);
    return { page: pageLabel(target), ...s, top: s.top.slice(0, args.top) };
  });

  for (const r of results) {
    console.log(`\n${r.page}\n  sampled ${r.totalMs} ms: busy ${r.busyMs} ms (${round((r.busyMs / r.totalMs) * 100, 0)} %), idle ${r.idleMs}, (program) ${r.programMs}, GC ${r.gcMs}`);
    console.log('  inclusive ms  pattern');
    for (const m of r.matched) console.log(`  ${String(m.ms).padStart(12)}  ${m.pattern}`);
    console.log('  self ms   function  (file:line)');
    for (const t of r.top) console.log(`  ${String(t.ms).padStart(7)}   ${t.fn}  (${t.file}:${t.line})`);
  }
  console.log(`\nwrote ${writeResult('cdp-cpu-profile', args.tag, { args, results: results.map((r) => ({ ...r, top: r.top })) })}`);
});
