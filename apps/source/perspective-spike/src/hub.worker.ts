/// <reference lib="webworker" />
/**
 * hub.worker.ts — spike step 1: host the Perspective ENGINE inside OUR OWN
 * SharedWorker script (the platform's hub topology), serve N windows from
 * it over their MessagePorts, and drive ingest from inside the worker.
 *
 * Why not just import Perspective's `perspective-server.worker.js` shim?
 * It keeps ONE module-level session and routes every port's requests
 * through whichever client `init`'d last — a dedicated-worker assumption.
 * With two sessions (hub-local + a window) the window's requests were
 * answered on the hub's port and hung. The library's engine-host classes
 * are bundled but not exported, so `engineHost.ts` re-implements that
 * ~150-line host with a session PER PORT.
 *
 * Wire protocol per port (what the Client library speaks):
 *   client → { cmd: 'init', id, args: [serverWasmModule] }   → ack { id }
 *   client → ArrayBuffer (protobuf request)                   → session
 *   server → ArrayBuffer (protobuf response, transferred)
 *
 * Control plane for the spike: a BroadcastChannel (the ports carry only
 * Perspective protocol traffic).
 */
import perspective from '@perspective-dev/client/inline';
import { EngineHost, type EngineSession } from './engineHost.js';
import { buildSnapshotJson, buildUpdatePool } from './synth.js';

declare const self: SharedWorkerGlobalScope;

// `perspective.worker()` (the Client facade) touches `customElements` even
// with no DOM involved; a worker scope has none. Spike-only stub — the
// production hub would construct the Rust Client over the port directly.
const g = globalThis as unknown as { customElements?: unknown };
if (!g.customElements) {
  g.customElements = { define() {}, get() { return undefined; }, whenDefined() { return Promise.resolve(); } };
}

const control = new BroadcastChannel('perspective-spike-control');
const log = (msg: string) => control.postMessage({ cmd: 'log', msg: `[hub] ${msg}` });

const ROWS = 20_000;
const BATCH_MS = 20;
const POOL = 64;
const IDLE_POLL_MS = 50;

// ── engine hosting ─────────────────────────────────────────────────

let hostPromise: Promise<EngineHost> | null = null;
let portsServed = 0;

/**
 * The engine binary the package ships (`perspective-server.wasm`) is a
 * stage-0 SELF-EXTRACTING wrapper (5 exports, 0 imports) — not the engine.
 * The Client library decompresses it and sends the compiled real engine
 * `WebAssembly.Module` in its `init` message (`args[0]`), exactly as the
 * upstream worker shim relies on. So the host takes the module from the
 * first `init` it sees; later inits reuse the running engine.
 */
async function ensureHost(engineWasm: unknown): Promise<EngineHost> {
  if (!hostPromise) {
    // The inline client sends the engine as raw bytes (ArrayBuffer); other
    // builds may send a compiled Module. Accept both.
    let source: WebAssembly.Module | ArrayBuffer;
    if (engineWasm instanceof WebAssembly.Module || engineWasm instanceof ArrayBuffer) {
      source = engineWasm;
    } else if (ArrayBuffer.isView(engineWasm)) {
      const v = engineWasm as Uint8Array;
      source = v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer;
    } else {
      throw new Error(`init did not carry engine wasm (got ${Object.prototype.toString.call(engineWasm)})`);
    }
    hostPromise = (async () => {
      const t0 = performance.now();
      const host = await EngineHost.create(source);
      // Idle poll so pushes still flow when no session is mid-request.
      setInterval(() => { void host.poll(); }, IDLE_POLL_MS);
      log(`engine up in ${Math.round(performance.now() - t0)}ms (module from client init)`);
      return host;
    })();
  }
  return hostPromise;
}

function servePort(port: MessagePort): void {
  let session: EngineSession | null = null;
  port.addEventListener('message', (evt: MessageEvent) => {
    const data = evt.data as { cmd?: string; id?: number; args?: unknown[] } | ArrayBuffer;
    if (data && typeof data === 'object' && !(data instanceof ArrayBuffer) && data.cmd === 'init') {
      void (async () => {
        try {
          const host = await ensureHost(data.args?.[0]);
          session = host.makeSession((reply) => {
            const buf = reply.buffer.slice(reply.byteOffset, reply.byteOffset + reply.byteLength) as ArrayBuffer;
            port.postMessage(buf, [buf]);
          });
          portsServed += 1;
          port.postMessage({ id: data.id });
        } catch (err) {
          const msg = err instanceof Error ? err.stack ?? err.message : String(err);
          control.postMessage({ cmd: 'error', msg: `engine host failed: ${msg}` });
        }
      })();
      return;
    }
    if (!session) return; // protocol bytes before init — ignore
    void session.handleRequest(new Uint8Array(data as ArrayBuffer));
  });
  port.start();
}

self.addEventListener('connect', (evt: MessageEvent) => {
  servePort(evt.ports[0]);
});

// ── hub-side local client + ingest ────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

type LocalTable = Awaited<ReturnType<Awaited<ReturnType<typeof perspective.worker>>['table']>>;

async function boot(): Promise<void> {
  const ch = new MessageChannel();
  servePort(ch.port2);
  const t0 = performance.now();
  const client = await perspective.worker(Promise.resolve(ch.port1));
  log(`local client up in ${Math.round(performance.now() - t0)}ms`);

  const snapshotJson = buildSnapshotJson(ROWS);
  const tLoad = performance.now();
  const table = await client.table(snapshotJson, { index: 'positionId', format: 'json', name: 'positions' });
  log(`table 'positions' hosted: ${await table.size()} rows in ${Math.round(performance.now() - tLoad)}ms`);
  control.postMessage({ cmd: 'ready' });

  control.addEventListener('message', (evt: MessageEvent) => {
    const m = evt.data as { cmd: string; rate?: number; seconds?: number };
    if (m.cmd !== 'start') return;
    void ingest(table, m.rate ?? 20_000, m.seconds ?? 15);
  });
}

async function ingest(table: LocalTable, rate: number, seconds: number): Promise<void> {
  const batchRows = Math.max(1, Math.round(rate / (1000 / BATCH_MS)));
  const pool = buildUpdatePool(ROWS, batchRows, POOL);
  log(`ingest start: ${rate} rows/s, ${batchRows} rows/${BATCH_MS}ms for ${seconds}s, ports served=${portsServed}`);
  const latencies: number[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  let sent = 0;
  let rowsSent = 0;
  let k = 0;
  const tIngest = performance.now();
  const endAt = tIngest + seconds * 1000;
  await new Promise<void>((resolve) => {
    const timer = setInterval(() => {
      if (performance.now() >= endAt) { clearInterval(timer); resolve(); return; }
      const batch = pool[k++ % POOL];
      const tu = performance.now();
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      sent += 1;
      rowsSent += batchRows;
      table.update(batch, { port_id: null, format: 'json' }).then(() => {
        inFlight -= 1;
        latencies.push(performance.now() - tu);
      });
    }, BATCH_MS);
  });
  while (inFlight > 0) await new Promise((r) => setTimeout(r, 10));
  const wallMs = performance.now() - tIngest;
  latencies.sort((a, b) => a - b);
  const stats = {
    rate, seconds, batchRows, portsServed,
    wallMs: Math.round(wallMs),
    batchesSent: sent,
    rowsSent,
    achievedRowsPerSec: Math.round(rowsSent / (wallMs / 1000)),
    updateLatencyMs: {
      p50: Math.round(percentile(latencies, 0.5)),
      p90: Math.round(percentile(latencies, 0.9)),
      p99: Math.round(percentile(latencies, 0.99)),
      max: Math.round(latencies[latencies.length - 1] ?? 0),
    },
    maxInFlight,
  };
  log(`ingest done: ${JSON.stringify(stats)}`);
  control.postMessage({ cmd: 'done', hub: stats });
}

boot().catch((err) => {
  control.postMessage({ cmd: 'error', msg: err instanceof Error ? err.stack ?? err.message : String(err) });
});
