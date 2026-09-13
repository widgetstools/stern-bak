// cdp-process-map.mjs — which renderer process does each docked view run in?
//
// WORKLOG 21 / experiment doc: six views in ONE renderer (pid 10932, 2.9 GB)
// shared one main thread; with `viewProcessAffinityStrategy: "different"`
// each view got its own PID (505–644 MB). Refactor plan Phase A acceptance:
// one PID per docked view with the switch on, memory within budget.
//
// Runs on the OpenFin PROVIDER page (it owns the platform's windows):
//   node cdp-process-map.mjs                       # default --url /platform/provider
//   node cdp-process-map.mjs --url provider --tag isolated
// Prints one row per view (window, view, pid, memory, affinity tag)
// and a PID summary; the raw `fin.System.getAllProcessInfo()` tree goes to
// the JSON. Not an OpenFin page → says so and exits 1.
import { COMMON_FLAGS, evaluate, forEachPage, pageLabel, parseArgs, round, run, writeResult } from './cdpDock.mjs';

const MAP = `(async () => {
  if (typeof fin === 'undefined') return { error: 'fin is not defined on this page — point --url at the OpenFin provider page' };
  const app = fin.Application.getCurrentSync();
  const wins = await app.getChildWindows();
  const views = [];
  for (const w of wins) {
    let list = [];
    try { list = await w.getCurrentViews(); } catch {}
    for (const v of list) {
      const row = { window: w.identity.name, view: v.identity.name };
      try { const o = await v.getOptions(); row.url = o.url; row.processAffinity = o.processAffinity ?? null; row.backgroundThrottling = o.backgroundThrottling ?? null; } catch (e) { row.optionsError = String(e); }
      try { row.process = await v.getProcessInfo(); } catch (e) { row.processError = String(e); }
      views.push(row);
    }
  }
  let processes = null;
  try { processes = await fin.System.getAllProcessInfo(); } catch (e) { processes = { error: String(e) }; }
  return { windows: wins.map((w) => w.identity.name), views, processes };
})()`;

const mb = (bytes) => (typeof bytes === 'number' ? round(bytes / 1048576, 0) : null);

run(async () => {
  const args = parseArgs(process.argv.slice(2), { url: '/platform/provider' });
  if (args.help) {
    console.log(['cdp-process-map.mjs — view → renderer PID map via fin.View.getProcessInfo (provider page)', ...COMMON_FLAGS].join('\n'));
    return;
  }
  const [result] = await forEachPage(args, async (session, target) => ({ page: pageLabel(target), ...(await evaluate(session, MAP)) }));
  if (result.error) throw new Error(`${result.page}: ${result.error}`);

  const rows = result.views.map((v) => ({
    window: v.window, view: v.view, pid: v.process?.pid ?? null,
    workingSetMB: mb(v.process?.workingSetSize), privateMB: mb(v.process?.privateSetSize),
    cpu: v.process?.cpuUsage ?? null, affinity: v.processAffinity,
    url: v.url, error: v.processError ?? v.optionsError ?? null,
  }));
  console.log(`\n${result.page}\n${result.windows.length} child window(s), ${rows.length} view(s)\n`);
  console.log('pid      workingSet MB  private MB  cpu   affinity        window / view');
  for (const r of rows) {
    console.log(`${String(r.pid ?? '?').padEnd(8)} ${String(r.workingSetMB ?? '?').padStart(13)}  ${String(r.privateMB ?? '?').padStart(10)}  ${String(r.cpu ?? '?').padStart(4)}  ${String(r.affinity ?? '(none)').padEnd(15)} ${r.window} / ${r.view}${r.error ? `   ! ${r.error}` : ''}`);
  }
  const byPid = new Map();
  for (const r of rows) { if (r.pid == null) continue; byPid.set(r.pid, (byPid.get(r.pid) ?? 0) + 1); }
  console.log(`\n${byPid.size} distinct renderer PID(s) for ${rows.length} view(s): ${[...byPid.entries()].map(([pid, n]) => `${pid}×${n}`).join(', ')}`);
  console.log(`\nwrote ${writeResult('cdp-process-map', args.tag, { args, result, rows })}`);
});
