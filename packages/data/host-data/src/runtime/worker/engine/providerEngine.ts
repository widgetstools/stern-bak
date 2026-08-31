/**
 * providerEngine — a Perspective engine living INSIDE the provider
 * sub-worker (`dataPlane: 'engine'`, Phase 2 of
 * docs/wasm-data-plane-plan.md).
 *
 * Topology (validated by the Phase 0 spike): our own `EngineHost` runs
 * the engine wasm; a loopback `MessageChannel` connects it to one
 * in-worker `@perspective-dev/client` Client (`perspective.worker(port)`),
 * which sends the compiled engine module in its `init` message — we
 * register the wasm sources first (`init_client` / `init_server` with
 * URLs the caller supplies), so the package performs its own stage-0
 * self-extraction and no asset resolution happens inside the bundle.
 *
 * Ingest paths, in preference order:
 *   1. TEXT (`ingestFrame`, STOMP `frameTap`): array-shaped frame bodies
 *      run `flattenJsonText` — the requested columns as flat scalars,
 *      straight from wire text to engine JSON, no row objects built.
 *      Requires a plain top-level key column (the text path cannot add
 *      a synthetic `__rowId`).
 *   2. OBJECTS (`ingest`, and the fallback inside `ingestFrame` for
 *      non-array bodies): `flattenRow` per row + one stringify. Also
 *      used for the one-shot catch-up from the worker's row cache when
 *      the engine finishes booting mid-stream.
 *
 * Flatten-first is mandatory either way: raw nested 64-field feed rows
 * measured 0.5–1 s per 1000-row engine update; the flattened projection
 * (`compileFlattenPlan(columnDefinitions, keyColumn)`) is milliseconds.
 *
 * This is still the measurement SHADOW: no view, no delta subscription
 * (a consumer-less row-mode subscription snowballs into ~4 MB coalesced
 * Arrow deltas). The relay to windows pulls at a fixed cadence in the
 * next increment.
 */

import { composeRowId, type ColumnDefinition } from '@wellsfargo-starui/types';
import { collectFieldPaths } from '../../providers/fieldProjection.js';
import { compileFlattenPlan, flattenJsonText, flattenRow, type FlattenPlan } from '../../providers/jsonFlatten.js';
import { EngineHost, type EngineSession } from './engineHost.js';

export interface ProviderEngineOpts {
  providerId: string;
  keyColumn: string | readonly string[] | undefined;
  /** The provider's columns — the engine's flattened schema. */
  columnDefinitions?: readonly ColumnDefinition[];
  /** `perspective-js.wasm` (client) location. */
  clientWasmUrl: string;
  /** `perspective-server.wasm` (engine, stage-0 wrapped) location. */
  serverWasmUrl: string;
}

export interface ProviderEngineStats {
  ready: boolean;
  rows: number;
  /** Batches ingested via the text path / the object path. */
  textBatches: number;
  objectBatches: number;
  error?: string;
}

export interface ProviderEngine {
  /**
   * Raw data-frame tap (text-first). `bodyText` must be the frame body;
   * `rows` its extracted rows (used when the body is not an array).
   */
  ingestFrame(bodyText: string, rows: readonly unknown[]): void;
  /** Object-path ingest (catch-up, non-STOMP transports). */
  ingest(rows: readonly unknown[], replace: boolean): void;
  /** Drop all rows (provider restart — the stream refills the table). */
  reset(): void;
  stats(): ProviderEngineStats;
  dispose(): void;
}

/** `perspective.worker()` touches `customElements` even off-DOM. */
function stubCustomElements(): void {
  const g = globalThis as { customElements?: unknown };
  if (!g.customElements) {
    g.customElements = {
      define() { /* noop */ },
      get() { return undefined; },
      whenDefined() { return Promise.resolve(); },
    };
  }
}

interface InitMessage { cmd?: string; id?: number; args?: unknown[] }

/**
 * Serve the engine side of the loopback port: the client's `init`
 * carries the (stage-0-extracted) engine module; afterwards raw
 * protobuf `ArrayBuffer`s flow both ways.
 */
function serveEnginePort(port: MessagePort, onError: (err: unknown) => void): () => void {
  let host: EngineHost | null = null;
  let session: EngineSession | null = null;
  port.onmessage = (ev: MessageEvent) => {
    const data = ev.data as InitMessage | ArrayBuffer;
    if (data && typeof data === 'object' && !(data instanceof ArrayBuffer) && data.cmd === 'init') {
      void (async () => {
        try {
          const wasm = data.args?.[0];
          if (!(wasm instanceof WebAssembly.Module) && !(wasm instanceof ArrayBuffer)) {
            throw new Error(`engine init did not carry wasm (got ${Object.prototype.toString.call(wasm)})`);
          }
          host = await EngineHost.create(wasm);
          session = host.makeSession((bytes) => {
            const copy = bytes.slice();
            port.postMessage(copy.buffer, [copy.buffer]);
          });
          port.postMessage({ id: data.id });
        } catch (err) {
          onError(err);
        }
      })();
      return;
    }
    if (!session) return; // protocol bytes before init — ignore
    void session.handleRequest(new Uint8Array(data as ArrayBuffer)).catch(onError);
  };
  port.start();
  return () => {
    session?.close();
    port.onmessage = null;
    try { port.close(); } catch { /* closed */ }
  };
}

let wasmRegistered = false;

const CH_LBRACKET = 91;

/** First non-whitespace char code of `text`, or -1. */
function firstCharCode(text: string): number {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c !== 32 && c !== 9 && c !== 10 && c !== 13) return c;
  }
  return -1;
}

export async function startProviderEngine(opts: ProviderEngineOpts): Promise<ProviderEngine> {
  stubCustomElements();
  // Dynamic so the JS planes never load Perspective at all.
  const { default: perspective } = await import('@perspective-dev/client');
  if (!wasmRegistered) {
    wasmRegistered = true;
    perspective.init_client(fetch(opts.clientWasmUrl));
    perspective.init_server(fetch(opts.serverWasmUrl));
  }

  const stats: ProviderEngineStats = { ready: false, rows: 0, textBatches: 0, objectBatches: 0 };
  const fail = (err: unknown): void => {
    if (stats.error) return;
    stats.error = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.warn(`[provider-engine] '${opts.providerId}' engine error — shadow disabled: ${stats.error}`);
  };

  const channel = new MessageChannel();
  const closePort = serveEnginePort(channel.port2, fail);
  const client = await perspective.worker(Promise.resolve(channel.port1));

  type Client = Awaited<ReturnType<typeof perspective.worker>>;
  type Table = Awaited<ReturnType<Client['table']>>;

  let table: Table | null = null;
  let queue: Promise<void> = Promise.resolve();
  let disposed = false;
  let batchesSinceSize = 0;
  let applyMsTotal = 0;
  let applyMsMax = 0;
  let applyCount = 0;
  let ingestedRows = 0;

  // A plain top-level key column indexes directly (and enables the text
  // path); composite or grammar-bearing keys index an added `__rowId`.
  const plainKey =
    typeof opts.keyColumn === 'string' && opts.keyColumn.length > 0 && !/[.["'\]]/.test(opts.keyColumn)
      ? opts.keyColumn
      : null;
  const indexColumn = plainKey ?? '__rowId';

  // Column-driven flattening: the engine's table is the requested paths
  // as flat scalars (opaque object columns come out as JSON strings).
  const plan: FlattenPlan | null =
    opts.columnDefinitions && opts.columnDefinitions.length > 0
      ? compileFlattenPlan(collectFieldPaths(opts.columnDefinitions, opts.keyColumn))
      : null;
  const textCapable = plan !== null && plainKey !== null;

  const rowsToJson = (rows: readonly unknown[]): string | null => {
    if (rows.length === 0) return null;
    if (plainKey && !plan) return JSON.stringify(rows);
    const out: Record<string, unknown>[] = [];
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const flat = plan ? flattenRow(row, plan) : { ...(row as Record<string, unknown>) };
      if (!plainKey) {
        const key = composeRowId(row, opts.keyColumn);
        if (key === null) continue;
        flat.__rowId = key;
      }
      out.push(flat);
    }
    return out.length === 0 ? null : JSON.stringify(out);
  };

  const applyJson = async (json: string, replace: boolean): Promise<void> => {
    if (!table) {
      table = await client.table(json, { index: indexColumn, format: 'json', name: opts.providerId });
      stats.ready = true;
      // eslint-disable-next-line no-console
      console.log(
        `[provider-engine] '${opts.providerId}' table up: index=${indexColumn}, ` +
        `${plan ? `${plan.columns.length} flattened columns` : 'raw rows'}, text path ${textCapable ? 'on' : 'off'}`,
      );
    } else if (replace) {
      await table.replace(json);
    } else {
      // `port_id: null` — no originating client port (server-side ingest).
      await table.update(json, { port_id: null, format: 'json' } as unknown as Parameters<Table['update']>[1]);
    }
    // `size()` is an engine round trip — sample it, don't pay it per batch.
    batchesSinceSize += 1;
    if (replace || batchesSinceSize >= 25) {
      batchesSinceSize = 0;
      stats.rows = await table.size();
    }
  };

  const enqueue = (fn: () => Promise<void>): void => {
    queue = queue
      .then(async () => {
        if (disposed || stats.error) return;
        const t0 = performance.now();
        await fn();
        const ms = performance.now() - t0;
        applyMsTotal += ms;
        applyCount += 1;
        if (ms > applyMsMax) applyMsMax = ms;
      })
      .catch(fail);
  };

  const statsTimer = setInterval(() => {
    if (!stats.ready && !stats.error) return;
    // eslint-disable-next-line no-console
    console.log(
      `[provider-engine] '${opts.providerId}' rows=${stats.rows} ingested=${ingestedRows} ` +
      `text=${stats.textBatches} obj=${stats.objectBatches} ` +
      `applyMs avg=${applyCount ? (applyMsTotal / applyCount).toFixed(1) : 0} max=${applyMsMax.toFixed(0)}` +
      `${stats.error ? ` ERROR=${stats.error}` : ''}`,
    );
    applyMsTotal = 0;
    applyMsMax = 0;
    applyCount = 0;
  }, 5000);

  const api: ProviderEngine = {
    ingestFrame(bodyText, rows) {
      if (textCapable && firstCharCode(bodyText) === CH_LBRACKET) {
        stats.textBatches += 1;
        ingestedRows += rows.length;
        enqueue(async () => {
          const flat = flattenJsonText(bodyText, plan!);
          if (flat !== '[]') await applyJson(flat, false);
        });
        return;
      }
      api.ingest(rows, false);
    },
    ingest(rows, replace) {
      if (rows.length === 0) return;
      stats.objectBatches += 1;
      ingestedRows += rows.length;
      enqueue(async () => {
        const json = rowsToJson(rows);
        if (json !== null) await applyJson(json, replace);
      });
    },
    reset() {
      enqueue(async () => {
        if (table) {
          await table.clear();
          stats.rows = 0;
        }
      });
    },
    stats: () => ({ ...stats }),
    dispose() {
      if (disposed) return;
      disposed = true;
      clearInterval(statsTimer);
      queue = queue
        .then(async () => {
          await table?.delete();
        })
        .catch(() => undefined)
        .then(() => closePort());
    },
  };
  return api;
}
