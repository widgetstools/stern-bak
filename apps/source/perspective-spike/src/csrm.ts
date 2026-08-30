/**
 * csrm.ts — a "window" hosting a REAL AG Grid in client-side row model,
 * fed from the hub's replicated Arrow stream. This measures the piece the
 * plan flagged as unmeasured: window-side materialization for AG Grid.
 *
 *   hub `to_arrow()` snapshot ──► apache-arrow decode ──► row objects ──► grid rowData
 *   relayed Arrow row-delta  ──► apache-arrow decode ──► row objects ──► applyTransactionAsync
 *
 * Perspective row-mode deltas carry FULL rows of the changed keys (all
 * view columns), so each delta row is a complete replacement object —
 * exactly what an AG Grid `update` transaction wants.
 *
 * `?leader=1` starts hub ingest; `?rate=&seconds=&batchMs=` forwarded.
 */
import perspective from '@perspective-dev/client/inline';
import { tableFromIPC, type Table as ArrowTable } from 'apache-arrow';
import { AllCommunityModule, ModuleRegistry, createGrid, type GridApi } from 'ag-grid-community';

ModuleRegistry.registerModules([AllCommunityModule]);

declare global {
  interface Window {
    __spike: { phase: string; results: Record<string, unknown> };
  }
}

const params = new URLSearchParams(location.search);
const LEADER = params.get('leader') === '1';
const RATE = Number(params.get('rate') ?? 20_000);
const SECONDS = Number(params.get('seconds') ?? 15);
const BATCH_MS = Number(params.get('batchMs') ?? 200);

const out = document.getElementById('out')!;
const log = (msg: string) => {
  // eslint-disable-next-line no-console
  console.log(`[spike] ${msg}`);
  out.textContent += `\n${msg}`;
};
window.__spike = { phase: 'boot', results: {} };

const control = new BroadcastChannel('perspective-spike-control');
control.addEventListener('message', (evt: MessageEvent) => {
  const m = evt.data as { cmd: string; msg?: string };
  if (m.cmd === 'log' && LEADER && m.msg) log(m.msg);
  if (m.cmd === 'error') log(`HUB ERROR: ${m.msg}`);
});

/** Column-wise materialization: one `get(i)` per cell, plain objects out. */
function rowsFromArrow(table: ArrowTable): Record<string, unknown>[] {
  const n = table.numRows;
  const fields = table.schema.fields.map((f) => f.name);
  const vectors = fields.map((name) => table.getChild(name)!);
  const rows: Record<string, unknown>[] = new Array(n);
  for (let i = 0; i < n; i++) {
    const row: Record<string, unknown> = {};
    for (let c = 0; c < fields.length; c++) row[fields[c]] = vectors[c].get(i);
    rows[i] = row;
  }
  return rows;
}

async function main(): Promise<void> {
  window.__spike.phase = 'connecting';
  const hub = new SharedWorker(new URL('./hub.worker.ts', import.meta.url), {
    type: 'module',
    name: 'perspective-spike-hub',
  });
  hub.onerror = (e) => log(`HUB WORKER ERROR: ${(e as ErrorEvent).message ?? String(e)}`);
  const hubClient = await perspective.worker(Promise.resolve(hub));

  // Subscribe first so nothing is missed; apply buffered deltas once the grid exists.
  const relay = new BroadcastChannel('perspective-spike-relay');
  const pending: ArrayBuffer[] = [];
  let gridApi: GridApi | null = null;
  let deltas = 0;
  let deltaRows = 0;
  let decodeMs = 0;
  let materializeMs = 0;
  let applyCallMs = 0;
  let deltaBytes = 0;
  const applyDelta = (buf: ArrayBuffer) => {
    const t0 = performance.now();
    const table = tableFromIPC(new Uint8Array(buf));
    const t1 = performance.now();
    const rows = rowsFromArrow(table);
    const t2 = performance.now();
    gridApi!.applyTransactionAsync({ update: rows });
    const t3 = performance.now();
    deltas += 1;
    deltaRows += rows.length;
    deltaBytes += buf.byteLength;
    decodeMs += t1 - t0;
    materializeMs += t2 - t1;
    applyCallMs += t3 - t2;
  };
  relay.addEventListener('message', (evt: MessageEvent) => {
    const m = evt.data as { seq: number; delta: ArrayBuffer };
    if (gridApi) applyDelta(m.delta); else pending.push(m.delta);
  });

  let hubTable: Awaited<ReturnType<typeof hubClient.open_table>> | null = null;
  for (let attempt = 0; hubTable === null; attempt++) {
    try {
      hubTable = await Promise.race([
        hubClient.open_table('positions'),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('open_table hung >5s')), 5000)),
      ]);
    } catch (err) {
      if (attempt >= 20) throw err;
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  const tSnap = performance.now();
  const hubView = await hubTable.view();
  const snapshot = await hubView.to_arrow();
  await hubView.delete();
  const tDecode = performance.now();
  const snapTable = tableFromIPC(new Uint8Array(snapshot));
  const rowData = rowsFromArrow(snapTable);
  const tGrid = performance.now();
  const fields = snapTable.schema.fields.map((f) => f.name);
  gridApi = createGrid(document.getElementById('grid')!, {
    columnDefs: fields.map((field) => ({ field, width: 130 })),
    rowData,
    getRowId: (p) => String((p.data as { positionId: string }).positionId),
    asyncTransactionWaitMillis: 200,
    defaultColDef: { enableCellChangeFlash: true },
  });
  await new Promise((r) => setTimeout(r, 300)); // let the initial render settle
  const tReady = performance.now();
  log(`snapshot ${(snapshot.byteLength / 1048576).toFixed(2)}MB in ${Math.round(tDecode - tSnap)}ms; ` +
    `arrow decode+materialize ${rowData.length} rows ${Math.round(tGrid - tDecode)}ms; grid up ${Math.round(tReady - tGrid)}ms; ` +
    `applying ${pending.length} buffered deltas`);
  for (const buf of pending.splice(0)) applyDelta(buf);

  // Main-thread health: rAF cadence + long tasks during ingest.
  const frames: number[] = [];
  const longTasks: number[] = [];
  let stopRaf = false;
  let lastFrame = performance.now();
  const raf = (now: number) => { frames.push(now - lastFrame); lastFrame = now; if (!stopRaf) requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  let observer: PerformanceObserver | null = null;
  try {
    observer = new PerformanceObserver((list) => { for (const e of list.getEntries()) longTasks.push(e.duration); });
    observer.observe({ type: 'longtask', buffered: false });
  } catch { /* unsupported */ }

  let flushes = 0;
  gridApi.addEventListener('asyncTransactionsFlushed', () => { flushes += 1; });

  window.__spike.phase = 'ingest';
  const done = new Promise<Record<string, unknown>>((resolve) => {
    control.addEventListener('message', (evt: MessageEvent) => {
      const m = evt.data as { cmd: string; hub?: Record<string, unknown> };
      if (m.cmd === 'done') resolve(m.hub ?? {});
    });
  });
  if (LEADER) {
    log(`leader: starting hub ingest at ${RATE} rows/s for ${SECONDS}s (batch ${BATCH_MS}ms)`);
    control.postMessage({ cmd: 'start', rate: RATE, seconds: SECONDS, batchMs: BATCH_MS });
  }
  const hubStats = await done;
  await new Promise((r) => setTimeout(r, 750)); // trailing deltas + final AG flush
  stopRaf = true;
  observer?.disconnect();

  const sumFrames = frames.reduce((s, d) => s + d, 0);
  window.__spike.results = {
    leader: LEADER,
    gridRows: gridApi.getDisplayedRowCount(),
    deltas: {
      count: deltas,
      rows: deltaRows,
      totalMB: +(deltaBytes / 1048576).toFixed(2),
      avgDecodeMs: +(decodeMs / Math.max(1, deltas)).toFixed(2),
      avgMaterializeMs: +(materializeMs / Math.max(1, deltas)).toFixed(2),
      avgApplyCallMs: +(applyCallMs / Math.max(1, deltas)).toFixed(2),
      totalWindowSideMs: Math.round(decodeMs + materializeMs + applyCallMs),
    },
    agFlushes: flushes,
    longTasks: {
      count: longTasks.length,
      totalMs: Math.round(longTasks.reduce((s, d) => s + d, 0)),
      maxMs: Math.round(longTasks.reduce((m, d) => Math.max(m, d), 0)),
    },
    mainThread: {
      fps: Math.round((frames.length / sumFrames) * 1000),
      worstFrameMs: Math.round(frames.reduce((m, d) => Math.max(m, d), 0)),
      framesOver50ms: frames.filter((d) => d > 50).length,
    },
    hub: hubStats,
  };
  window.__spike.phase = 'done';
  log(`done: ${JSON.stringify(window.__spike.results)}`);
}

main().catch((err) => {
  log(`FAILED: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  window.__spike.results = { error: String(err) };
  window.__spike.phase = 'done';
});
