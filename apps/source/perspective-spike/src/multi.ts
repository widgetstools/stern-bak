/**
 * multi.ts — a "window" in the multi-window hosting test. Connects a
 * Perspective Client to the hub SharedWorker (one engine for all windows),
 * opens the hosted 'positions' table, subscribes to row-mode Arrow
 * deltas, and reports what it received while the hub ingests.
 *
 * `?leader=1` makes this window send the `start` command once it has
 * subscribed (the runner opens it last, so every other window is already
 * listening). `?rate=&seconds=` are forwarded to the hub.
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
const BATCH_MS = Number(params.get('batchMs') ?? 20);

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
  const t0 = performance.now();
  const hub = new SharedWorker(new URL('./hub.worker.ts', import.meta.url), {
    type: 'module',
    name: 'perspective-spike-hub',
  });
  hub.onerror = (e) => log(`HUB WORKER ERROR: ${(e as ErrorEvent).message ?? String(e)}`);
  const client = await perspective.worker(Promise.resolve(hub));
  log(`client connected to hub in ${Math.round(performance.now() - t0)}ms`);

  // The hub creates the table at boot; wait until it is hosted.
  // Open by name directly (the production flow: hub hosts by name, windows
  // open by name). `get_hosted_table_names()` hung in this hosting mode —
  // the shim's poll-thread path appears to drop client_id-0 replies — so
  // we don't depend on it. Retry covers the hub still booting.
  const tOpen = performance.now();
  let table: Awaited<ReturnType<typeof client.open_table>> | null = null;
  for (let attempt = 0; table === null; attempt++) {
    try {
      table = await Promise.race([
        client.open_table('positions'),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('open_table hung >5s')), 5000)),
      ]);
    } catch (err) {
      if (attempt >= 20) throw err;
      if (attempt % 5 === 0) log(`open_table retry ${attempt}: ${err instanceof Error ? err.message : String(err)}`);
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  const view = await table.view();
  const size = await table.size();
  log(`opened hosted table (${size} rows) in ${Math.round(performance.now() - tOpen)}ms`);

  let deltaCount = 0;
  let deltaBytes = 0;
  let deltaCbMs = 0;
  await view.on_update(
    (updated: { port_id: number; delta?: ArrayBuffer | Uint8Array | number[] }) => {
      const t = performance.now();
      deltaCount += 1;
      const d = updated.delta as { byteLength?: number; length?: number } | undefined;
      deltaBytes += d?.byteLength ?? d?.length ?? 0;
      deltaCbMs += performance.now() - t;
    },
    { mode: 'row' },
  );

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
  // Let trailing deltas land.
  await new Promise((r) => setTimeout(r, 500));
  stopRaf = true;

  const sumFrames = frames.reduce((s, d) => s + d, 0);
  const tJson = performance.now();
  const rowsJson = await view.to_json({ start_row: 0, end_row: 500 });
  const toJson500Ms = Math.round(performance.now() - tJson);

  window.__spike.results = {
    leader: LEADER,
    tableSize: size,
    deltas: { count: deltaCount, totalMB: +(deltaBytes / 1048576).toFixed(2), avgKB: +(deltaBytes / Math.max(1, deltaCount) / 1024).toFixed(1), callbackMs: Math.round(deltaCbMs) },
    mainThread: {
      fps: Math.round((frames.length / sumFrames) * 1000),
      worstFrameMs: Math.round(frames.reduce((m, d) => Math.max(m, d), 0)),
      framesOver50ms: frames.filter((d) => d > 50).length,
    },
    toJson500Ms,
    toJson500Rows: rowsJson.length,
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
