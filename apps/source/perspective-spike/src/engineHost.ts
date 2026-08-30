/**
 * engineHost.ts — a readable, multi-session host for the Perspective
 * engine WASM, derived from the library's own `perspective-server.worker.js`
 * shim (whose engine-host classes are bundled but not exported, and whose
 * single module-level session breaks multi-window hosting).
 *
 * Scope: wasm32 engine only (the shipped `perspective-server.wasm`; the
 * Memory64 variant is opt-in upstream), in-memory tables (OPFS bridge
 * stubbed), one engine per worker, one session per connected port.
 *
 * Engine ABI (from @perspective-dev/server perspective-server.d.ts):
 *   psp_new_server(pollMode) → server
 *   psp_new_session(server) → client_id
 *   psp_handle_request(server, client_id, ptr, len) → response batch ptr
 *   psp_poll(server) → response batch ptr
 *   psp_alloc / psp_free / psp_close_session / psp_delete_server
 * Response batch layout (wasm32): u32 count @0, u32 entriesPtr @4; each
 * entry 12 bytes: u32 dataPtr, u32 len, i32 client_id. Every dataPtr, the
 * entries array and the descriptor are owned by the caller (free them).
 * client_id 0 in a response means "the session that issued the request".
 */

interface EngineExports {
  memory: WebAssembly.Memory;
  _initialize: () => void;
  psp_new_server: (pollMode: number) => number;
  psp_new_session: (server: number) => number;
  psp_close_session: (server: number, clientId: number) => void;
  psp_handle_request: (server: number, clientId: number, ptr: number, len: number) => number;
  psp_poll: (server: number) => number;
  psp_alloc: (len: number) => number;
  psp_free: (ptr: number) => void;
  psp_delete_server: (server: number) => void;
  psp_is_memory64: () => number;
  __cpp_exception?: unknown; // WebAssembly.Tag — not in lib.dom typings yet
}

// Exception-handling proposal API, present at runtime but not in lib.dom.
const WasmEx = WebAssembly as unknown as {
  Exception?: new (tag: unknown, payload: unknown[], opts?: { traceStack?: boolean }) => Error;
};

const utf8 = new TextDecoder('utf8');

function makeImports(getExports: () => EngineExports | null, heap: () => Uint8Array): WebAssembly.Imports {
  const outBufs: number[][] = [[], [], []];
  const writeByte = (fd: number, byte: number) => {
    const buf = outBufs[fd] ?? outBufs[2];
    if (byte === 0 || byte === 10) {
      const text = utf8.decode(new Uint8Array(buf));
      (fd === 1 ? console.log : console.error)(`[psp-engine] ${text}`);
      buf.length = 0;
    } else buf.push(byte);
  };
  const env: Record<string, unknown> = {
    HaveOffsetConverter() { return 0; },
    __syscall_ftruncate64() { return 0; },
    __syscall_getdents64() { return 0; },
    __syscall_unlinkat() { return 0; },
    __throw_exception_with_stack_trace(ptr: number) {
      const tag = getExports()?.__cpp_exception;
      const ex = tag && WasmEx.Exception
        ? new WasmEx.Exception(tag, [ptr], { traceStack: true })
        : new Error('engine exception');
      (ex as { message?: string }).message = 'Unexpected internal engine error';
      throw ex;
    },
    clock_time_get(id: number, _precision: bigint, outPtr: number) {
      if (!(id >= 0 && id <= 3)) return 28;
      const ms = id === 0 ? Date.now() : performance.now();
      new BigInt64Array(heap().buffer)[(outPtr >>> 0) >>> 3] = BigInt(Math.round(ms * 1e6));
      return 0;
    },
    emscripten_asm_const_int() { return 0; },
    emscripten_notify_memory_growth() { /* HEAPU8 is re-read on each access */ },
    environ_get() { return 0; },
    environ_sizes_get(countPtr: number, sizePtr: number) {
      const u32 = new Uint32Array(heap().buffer);
      u32[countPtr >>> 2] = 0; u32[sizePtr >>> 2] = 0;
      return 0;
    },
    fd_close() { return 0; },
    fd_read() { return 0; },
    fd_seek() { return 0; },
    fd_write(fd: number, iovPtr: number, iovCnt: number, outPtr: number) {
      const u8 = heap();
      const u32 = new Uint32Array(u8.buffer);
      let total = 0;
      for (let i = 0; i < iovCnt; i++) {
        const base = u32[(iovPtr >>> 2) + i * 2];
        const len = u32[(iovPtr >>> 2) + i * 2 + 1];
        for (let j = 0; j < len; j++) writeByte(fd, u8[base + j]);
        total += len;
      }
      u32[outPtr >>> 2] = total;
      return 0;
    },
    proc_exit(code: number) { console.error('[psp-engine] proc_exit', code); return 0; },
    // OPFS bridge — page_to_disk is off for this host.
    psp_opfs_store() { return -1; },
    psp_opfs_load() { return 0; },
    psp_opfs_remove() { /* noop */ },
    psp_stack_trace() {
      const ex = getExports();
      if (!ex) return 0;
      const bytes = new TextEncoder().encode(Error().stack ?? '');
      const ptr = ex.psp_alloc(bytes.byteLength + 1);
      heap().set(bytes, ptr);
      heap()[ptr + bytes.byteLength] = 0;
      return ptr;
    },
    psp_heap_size() { return heap().buffer.byteLength; },
  };
  const mod = env as unknown as WebAssembly.ModuleImports;
  return { env: mod, wasi_snapshot_preview1: mod };
}

export interface EngineResponse { clientId: number; data: Uint8Array; }

export class EngineHost {
  private exports!: EngineExports;
  private server = 0;
  private readonly sessions = new Map<number, (data: Uint8Array) => Promise<void> | void>();
  private queue: Promise<unknown> = Promise.resolve();

  static async create(wasm: WebAssembly.Module | ArrayBuffer): Promise<EngineHost> {
    const host = new EngineHost();
    let exportsRef: EngineExports | null = null;
    const imports = makeImports(() => exportsRef, () => new Uint8Array(exportsRef!.memory.buffer));
    const module = wasm instanceof WebAssembly.Module ? wasm : await WebAssembly.compile(wasm);
    const instance = await WebAssembly.instantiate(module, imports);
    exportsRef = instance.exports as unknown as EngineExports;
    if (typeof exportsRef.psp_new_server !== 'function') {
      const names = WebAssembly.Module.exports(module).map((e) => e.name).slice(0, 10).join(', ');
      throw new Error(`engineHost: not the engine module (no psp_new_server export; exports: ${names}) — ` +
        'the shipped perspective-server.wasm is a stage-0 self-extracting wrapper; pass the compiled module from the client init');
    }
    if (exportsRef.psp_is_memory64()) throw new Error('engineHost: Memory64 engine not supported by this host');
    exportsRef._initialize();
    host.exports = exportsRef;
    // pollMode 0: responses are flushed by the requesting session's poll
    // (client_id 0 → requester), which also delivers pushes to peers.
    host.server = exportsRef.psp_new_server(0);
    return host;
  }

  private heap(): Uint8Array { return new Uint8Array(this.exports.memory.buffer); }

  /** Serialize engine access: the ABI is not re-entrant. */
  private run<T>(fn: () => T | Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }

  /** Decode + free a response batch; returns the entries. */
  private takeResponses(batchPtr: number): EngineResponse[] {
    const ex = this.exports;
    const view = new DataView(ex.memory.buffer, batchPtr >>> 0, 8);
    const count = view.getUint32(0, true);
    const entriesPtr = view.getUint32(4, true);
    const entries = new DataView(ex.memory.buffer, entriesPtr, count * 12);
    const out: EngineResponse[] = [];
    for (let i = 0; i < count; i++) {
      const dataPtr = entries.getUint32(i * 12, true);
      const len = entries.getUint32(i * 12 + 4, true);
      const clientId = entries.getInt32(i * 12 + 8, true);
      // Copy out before freeing — the engine reuses its heap.
      out.push({ clientId, data: this.heap().slice(dataPtr, dataPtr + len) });
    }
    for (let i = 0; i < count; i++) ex.psp_free(entries.getUint32(i * 12, true));
    ex.psp_free(entriesPtr);
    ex.psp_free(batchPtr);
    return out;
  }

  private async dispatch(responses: EngineResponse[], requester: number): Promise<void> {
    for (const r of responses) {
      const target = r.clientId === 0 ? requester : r.clientId;
      const cb = this.sessions.get(target);
      if (cb) await cb(r.data);
    }
  }

  /** Create a session; `send` delivers protobuf response bytes to that client. */
  makeSession(send: (data: Uint8Array) => Promise<void> | void): EngineSession {
    const clientId = this.exports.psp_new_session(this.server);
    this.sessions.set(clientId, send);
    return new EngineSession(this, clientId);
  }

  /** @internal */
  async handleRequest(clientId: number, request: Uint8Array): Promise<void> {
    await this.run(async () => {
      const ex = this.exports;
      const ptr = ex.psp_alloc(request.byteLength);
      this.heap().set(request, ptr);
      let batch: number;
      try {
        batch = ex.psp_handle_request(this.server, clientId, ptr, request.byteLength);
      } finally {
        ex.psp_free(ptr);
      }
      await this.dispatch(this.takeResponses(batch), clientId);
      // Session-level poll: flushes replies + peer notifications produced
      // by this request (client_id 0 routes back to the requester).
      await this.dispatch(this.takeResponses(ex.psp_poll(this.server)), clientId);
    });
  }

  /** Idle poll — delivers anything pending when no request is in flight. */
  async poll(): Promise<void> {
    await this.run(async () => {
      await this.dispatch(this.takeResponses(this.exports.psp_poll(this.server)), 0);
    });
  }

  /** @internal */
  closeSession(clientId: number): void {
    this.sessions.delete(clientId);
    try { this.exports.psp_close_session(this.server, clientId); } catch { /* engine teardown */ }
  }
}

export class EngineSession {
  constructor(private readonly host: EngineHost, readonly clientId: number) {}
  handleRequest(request: Uint8Array): Promise<void> {
    return this.host.handleRequest(this.clientId, request);
  }
  close(): void {
    this.host.closeSession(this.clientId);
  }
}
