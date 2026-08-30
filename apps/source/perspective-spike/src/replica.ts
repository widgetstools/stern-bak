/**
 * replica.ts — a "window" in REPLICATED mode. It takes a one-time Arrow
 * snapshot from the hub's hosted table, spins up its OWN Perspective
 * engine (a dedicated worker via `perspective.worker()`), applies the
 * hub's relayed Arrow row-deltas to that replica, and hosts this window's
 * own view (a per-window filter + sort) on it — per-subscriber views with
 * zero per-subscriber engine cost in the hub.
 *
 * `?leader=1` starts hub ingest once subscribed; `?rate=&seconds=&batchMs=`
 * are forwarded; `?desk=` picks this window's filter.
 */
import perspective from '@perspective-dev/client/inline';

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
const DESK = params.get('desk') ?? 'IG Credit';

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

async function main(): Promise<void> {
  window.__spike.phase = 'connecting';
  const hub = new SharedWorker(new URL('./hub.worker.ts', import.meta.url), {
    type: 'module',
    name: 'perspective-spike-hub',
  });
  hub.onerror = (e) => log(`HUB WORKER ERROR: ${(e as ErrorEvent).message ?? String(e)}`);
  const hubClient = await perspective.worker(Promise.resolve(hub));

  // Subscribe to the relay BEFORE snapshotting so no delta is missed;
  // deltas buffered until the replica exists are applied afterwards
  // (upserts — a pre-snapshot delta can only briefly re-apply an older
  // value that the next update corrects).
  const relay = new BroadcastChannel('perspective-spike-relay');
  const pending: ArrayBuffer[] = [];
  let replicaTable: Awaited<ReturnType<Awaited<ReturnType<typeof perspective.worker>>['table']>> | null = null;
  let applied = 0;
  let appliedBytes = 0;
  let applyMs = 0;
  let applyInFlight = 0;
  let applyMaxInFlight = 0;
  const apply = (buf: ArrayBuffer) => {
    const t = performance.now();
    applyInFlight += 1;
    applyMaxInFlight = Math.max(applyMaxInFlight, applyInFlight);
    void replicaTable!.update(buf, { port_id: null, format: 'arrow' }).then(() => {
      applyInFlight -= 1;
      applied += 1;
      appliedBytes += buf.byteLength;
      applyMs += performance.now() - t;
    });
  };
  relay.addEventListener('message', (evt: MessageEvent) => {
    const m = evt.data as { seq: number; delta: ArrayBuffer };
    if (replicaTable) apply(m.delta); else pending.push(m.delta);
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
  const snapshotMs = Math.round(performance.now() - tSnap);

  const tReplica = performance.now();
  const replica = await perspective.worker(); // this window's own engine
  replicaTable = await replica.table(snapshot, { index: 'positionId', format: 'arrow' });
  const replicaBootMs = Math.round(performance.now() - tReplica);
  log(`snapshot ${(snapshot.byteLength / 1048576).toFixed(2)}MB in ${snapshotMs}ms; replica engine + table up in ${replicaBootMs}ms; applying ${pending.length} buffered deltas`);
  for (const buf of pending.splice(0)) apply(buf);

  // This window's OWN view on its replica: per-desk filter + pnl sort,
  // with a row-mode delta subscription (what a grid would consume).
  const myView = await replicaTable.view({
    filter: [['desk', '==', DESK]],
    sort: [['pnl', 'desc']],
  });
  let viewDeltas = 0;
  let viewDeltaBytes = 0;
  await myView.on_update(
    (updated: { delta?: ArrayBuffer | Uint8Array | number[] }) => {
      viewDeltas += 1;
      const d = updated.delta as { byteLength?: number; length?: number } | undefined;
      viewDeltaBytes += d?.byteLength ?? d?.length ?? 0;
    },
    { mode: 'row' },
  );
  const myViewRows = await myView.num_rows();

  const frames: number[] = [];
  let stopRaf = false;
  let lastFrame = performance.now();
  const raf = (now: number) => { frames.push(now - lastFrame); lastFrame = now; if (!stopRaf) requestAnimationFrame(raf); };
  requestAnimationFrame(raf);

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
  await new Promise((r) => setTimeout(r, 750));
  while (applyInFlight > 0) await new Promise((r) => setTimeout(r, 20));
  stopRaf = true;

  const sumFrames = frames.reduce((s, d) => s + d, 0);
  const tJson = performance.now();
  const rows = await myView.to_json({ start_row: 0, end_row: 500 });
  const toJson500Ms = Math.round(performance.now() - tJson);

  window.__spike.results = {
    leader: LEADER,
    desk: DESK,
    snapshotMs,
    replicaBootMs,
    relay: { applied, totalMB: +(appliedBytes / 1048576).toFixed(2), avgApplyMs: +(applyMs / Math.max(1, applied)).toFixed(1), maxInFlight: applyMaxInFlight },
    myView: { rows: myViewRows, deltas: viewDeltas, deltaMB: +(viewDeltaBytes / 1048576).toFixed(2) },
    mainThread: {
      fps: Math.round((frames.length / sumFrames) * 1000),
      worstFrameMs: Math.round(frames.reduce((m, d) => Math.max(m, d), 0)),
      framesOver50ms: frames.filter((d) => d > 50).length,
    },
    toJson500Ms,
    toJson500Rows: rows.length,
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
