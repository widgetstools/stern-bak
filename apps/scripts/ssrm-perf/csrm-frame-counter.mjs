// csrm-frame-counter.mjs — what arrives on a view's data port, per second?
//
// WORKLOG 19 counted a view's port for 10 s (31 `ssrm-tick` rowDelta frames,
// 45 MB) and found the tick fan-out shipping the whole table's churn to every
// view; WORKLOG 21's CSRM feed shape (3 500 rows per 250 ms throttle frame,
// ~5 000 rows/s) is the input the apply-path rewrite (plan B) is judged
// against. This counts frames, rows and (with --bytes) payload size by
// message kind on every SharedWorker port the page opens.
//
// Reloads the page (the SharedWorker constructor is wrapped before the app
// connects):
//   node csrm-frame-counter.mjs --url stomp-marketsgrid --seconds 10
//   node csrm-frame-counter.mjs --url blotter --all --bytes   # JSON.stringify per frame: measures, but costs the page
import { COMMON_FLAGS, evaluate, forEachPage, pageLabel, parseArgs, reloadWith, round, run, sleep, writeResult } from './cdpDock.mjs';

const HOOK = `(() => {
  if (window.__frameCounter) return;
  const F = window.__frameCounter = { on: false, bytes: false, t0: 0, ports: 0, byKind: new Map() };
  const note = (kind, rows, bytes) => {
    if (!F.on) return;
    let b = F.byKind.get(kind);
    if (!b) { b = { frames: 0, rows: 0, bytes: 0, maxRows: 0, maxBytes: 0 }; F.byKind.set(kind, b); }
    b.frames++; b.rows += rows; b.bytes += bytes;
    if (rows > b.maxRows) b.maxRows = rows;
    if (bytes > b.maxBytes) b.maxBytes = bytes;
  };
  const rowsOf = (d) => {
    if (d.rows && d.rows.length != null) return d.rows.length;
    if (d.patches && d.patches.length != null) return d.patches.length;
    const p = d.payload;
    if (p && typeof p === 'object') return ((p.upserts && p.upserts.length) || 0) + ((p.removals && p.removals.length) || 0);
    return 0;
  };
  const bytesOf = (d) => {
    try {
      if (d.buf && d.buf.byteLength != null) return d.buf.byteLength;
      if (F.bytes) return JSON.stringify(d).length;
    } catch {}
    return 0;
  };
  const hookPort = (port) => {
    if (!port || port.__fcHooked) return;
    port.__fcHooked = true; F.ports++;
    port.addEventListener('message', (ev) => {
      const d = ev.data;
      if (!d || typeof d !== 'object' || typeof d.kind !== 'string') return;
      const kind = d.kind === 'ssrm-tick' && d.payload ? 'ssrm-tick:' + d.payload.kind : d.kind;
      note(kind, rowsOf(d), bytesOf(d));
    });
  };
  const Orig = window.SharedWorker;
  if (Orig) {
    const Wrapped = function (...a) { const w = new Orig(...a); try { hookPort(w.port); } catch {} return w; };
    Wrapped.prototype = Orig.prototype;
    window.SharedWorker = Wrapped;
  }
  F.start = (bytes) => { F.on = true; F.bytes = !!bytes; F.byKind.clear(); F.t0 = performance.now(); };
  F.stop = () => {
    F.on = false;
    const ms = performance.now() - F.t0;
    return { ms, ports: F.ports, kinds: [...F.byKind.entries()].map(([kind, b]) => ({ kind, ...b })).sort((a, b) => b.frames - a.frames) };
  };
})()`;

run(async () => {
  const args = parseArgs(process.argv.slice(2), { warmup: 5 });
  if (args.help) {
    console.log(['csrm-frame-counter.mjs — frames / rows / bytes per message kind on the data port (reloads the page)', ...COMMON_FLAGS,
      '  --seconds <n>    window (default 10)', '  --warmup <s>     wait after reload (default 5)', '  --bytes          JSON.stringify each frame to size it (costs the page)'].join('\n'));
    return;
  }
  const results = await forEachPage(args, async (session, target) => {
    const dispose = await reloadWith(session, HOOK, { warmupMs: args.warmup * 1000 });
    await evaluate(session, `window.__frameCounter.start(${args.bytes})`);
    await sleep(args.seconds * 1000);
    const snap = await evaluate(session, 'window.__frameCounter.stop()');
    await dispose();
    return { page: pageLabel(target), ...snap };
  });

  for (const r of results) {
    const s = r.ms / 1000;
    console.log(`\n${r.page}\n  ${s.toFixed(1)} s, ${r.ports} SharedWorker port(s) hooked`);
    if (r.kinds.length === 0) { console.log('  no messages seen — no port opened, or the feed is idle'); continue; }
    console.log('  frames   /s     rows      rows/s   max rows   bytes/s     max bytes  kind');
    for (const k of r.kinds) {
      console.log(`  ${String(k.frames).padStart(6)} ${String(round(k.frames / s)).padStart(5)}  ${String(k.rows).padStart(8)} ${String(round(k.rows / s, 0)).padStart(9)}  ${String(k.maxRows).padStart(9)}  ${String(k.bytes ? round(k.bytes / s, 0) : '-').padStart(9)}  ${String(k.bytes ? k.maxBytes : '-').padStart(11)}  ${k.kind}`);
    }
  }
  console.log(`\nwrote ${writeResult('csrm-frame-counter', args.tag, { args, results })}`);
});
