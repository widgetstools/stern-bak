/**
 * Host the Perspective engine and its Tables inside a worker.
 *
 * One engine and one Table per provider serve every blotter window: a window
 * opens a View against a Table it did not create and reads only the rows its
 * viewport asks for, instead of being sent the whole book. That is the entire
 * point of the pull path.
 *
 * Roles, forced by the runtime:
 *
 *   here (worker)   perspective.worker()          -> the host Client, owns the Tables
 *                   client.new_proxy_session(cb)  -> one per attached window
 *                   session.handle_request(frame) <- frames from that window
 *
 *   there (window)  perspective.worker(port)      -> that window's Client
 *                   client.open_table(name)       -> Table -> View
 *
 * `loadPerspective` is INJECTED rather than imported. The inline build carries
 * its wasm as base64 and the worker asset is a single esbuild bundle that every
 * app loads, so importing it here statically would add megabytes to workers
 * that never open a blotter. Injection keeps the cost with the entry that opts
 * in — and makes this module testable without a wasm engine.
 */

/** The slice of the Perspective module this needs. */
export interface PerspectiveModuleLike {
  worker(port?: Promise<unknown>): Promise<HostClientLike>;
}

export interface HostClientLike {
  table(
    schema: unknown,
    options: { index?: string; name?: string },
  ): Promise<HostTableLike & { clear?(): Promise<void>; view?(config: unknown): Promise<unknown> }>;
  new_proxy_session(onResponse: (response: Uint8Array) => void): ProxySessionLike;
  get_hosted_table_names?(): Promise<string[]>;
}

export interface HostTableLike {
  update(rows: unknown): Promise<void>;
  delete(): Promise<void>;
  size?(): Promise<number>;
  /**
   * Drop every row, keeping the schema, the index and every registered View.
   * This is what lets a restart happen under attached windows — see the note
   * on the wrapper in `tableFactoryFor`.
   */
  clear?(): Promise<void>;
  /**
   * Build a View on the host side, for the worker's own query engine.
   * Optional: a Table that only ever serves attached windows never needs it,
   * and every test fake would otherwise have to implement it.
   */
  view?(config: unknown): Promise<unknown>;
}

export interface ProxySessionLike {
  handle_request(frame: Uint8Array): Promise<void>;
  close?(): Promise<void>;
}

/**
 * KNOWN, MEASURED, and not fixable from this side: on a large book the engine
 * throws `TypeError: Cannot perform DataView.prototype.getInt32 on a detached
 * or out-of-bounds ArrayBuffer` from inside its OWN transport, once per worker
 * boot, before any window has sent a frame. Its protocol buffers are views over
 * the wasm `HEAPU8`, which detaches when wasm memory grows, and a large enough
 * book forces that growth mid-request. `onError` below is what makes this
 * attributable instead of an invisible, unhandled rejection inside a
 * SharedWorker — recovering from it needs the engine, not this layer.
 */

/** Enough of a `MessagePort` to carry protocol frames. */
export interface FramePortLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  start?(): void;
  close?(): void;
}

export interface PerspectiveHostOpts {
  /** Resolve the Perspective module — usually `import('@perspective-dev/client/inline')`. */
  loadPerspective(): Promise<PerspectiveModuleLike>;
  onError?(stage: 'attach' | 'request' | 'table', error: unknown): void;
}

export interface PerspectiveHost {
  /**
   * A `createTable` bound to `name`, shaped for `createPerspectiveTableFeed`.
   * The name is what a window passes to `client.open_table(name)`.
   */
  tableFactoryFor(name: string): (schema: unknown, index: string) => Promise<HostTableLike>;
  /**
   * Bind one window's frame port to a ProxySession onto the host Client.
   * Accepts a real `MessagePort` as well as the structural shape, so callers
   * can hand over `event.ports[0]` without a cast of their own.
   */
  attach(port: FramePortLike | MessagePort): Promise<void>;
  hostedTableNames(): Promise<string[]>;
  /** The hosted Table, for the worker's own query engine. Null if not built. */
  getTable(name: string): HostTableLike | null;
  /**
   * Fire whenever rows land in the named Table. Returns an unsubscribe.
   *
   * Taken from the host's own `update()` wrapper rather than from a
   * `Table.on_update` callback: the wrapper is code we own and is exact by
   * construction, where the engine's own update callbacks live on VIEWS in
   * 4.5.2 and would mean building a throwaway View just to learn that the
   * book changed. Registering before the Table exists is legal — the
   * listener simply fires from the first update onward.
   */
  onTableUpdate(name: string, listener: () => void): () => void;
  readonly attachedPorts: number;
  stop(): Promise<void>;
}

/**
 * Make `@perspective-dev/client` usable in a worker.
 *
 * MEASURED cause of "worker() throws `customElements is not defined`": it is
 * not deep DOM coupling, it is ONE line. `get_client()` opens with
 * `customElements.get("perspective-viewer")` — a bare identifier that simply
 * does not exist in a WorkerGlobalScope, so the lookup throws before the `if`
 * is reached. Everything past it already falls through to the wasm module that
 * `init_client()` stored. Making the lookup return nothing is the whole fix;
 * in a window this is a no-op.
 */
export function installCustomElementsShim(scope: Record<string, unknown> = globalThis): void {
  if (typeof scope.customElements !== 'undefined') return;
  scope.customElements = {
    get: () => undefined,
    define: () => {},
    whenDefined: () => Promise.resolve(undefined),
  };
}

export function createPerspectiveHost(opts: PerspectiveHostOpts): PerspectiveHost {
  const { loadPerspective, onError = () => {} } = opts;

  let clientPromise: Promise<HostClientLike> | null = null;
  const sessions: ProxySessionLike[] = [];
  const tables = new Map<string, HostTableLike>();
  /** Per-table-name update listeners — see `onTableUpdate`. */
  const updateListeners = new Map<string, Set<() => void>>();
  let stopped = false;

  function notifyUpdate(name: string): void {
    const listeners = updateListeners.get(name);
    if (!listeners) return;
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (err) {
        // One subscriber's throw must not stop the rest from being told.
        onError('table', err);
      }
    }
  }

  function hostClient(): Promise<HostClientLike> {
    if (clientPromise === null) {
      clientPromise = (async () => {
        // Before the module is loaded, not after: the shim has to be in place
        // the first time any perspective code resolves its client.
        installCustomElementsShim();
        const perspective = await loadPerspective();
        return perspective.worker();
      })();
    }
    return clientPromise;
  }

  return {
    tableFactoryFor(name: string) {
      return async (schema: unknown, index: string) => {
        const client = await hostClient();
        const existing = tables.get(name);
        if (existing) {
          // A rebuild (restart, or a changed schema) replaces the hosted table
          // under the same name, so windows can re-open it by the same id.
          tables.delete(name);
          await existing.delete().catch((err) => onError('table', err));
        }
        const table = await client.table(schema, { index, name });

        // MEASURED: the Table has two plausible owners — the feed that built
        // it and this host that serves it by name — and a second `delete()`
        // on a freed handle throws `null pointer passed to rust` from a wasm
        // microtask. That is the uncatchable family that can take the whole
        // worker down. So deletion is idempotent and de-registers, and
        // whoever calls first wins.
        let deleted = false;
        const owned: HostTableLike = {
          update: async (rows: unknown) => {
            await table.update(rows);
            // AFTER the write lands, so a query engine recompute triggered
            // here reads the book that includes it.
            notifyUpdate(name);
          },
          size: table.size ? () => table.size!() : undefined,
          view: table.view ? (config: unknown) => table.view!(config) : undefined,
          // MEASURED: omitting this is not a missing convenience, it silently
          // changes the restart path. The feed asks `typeof table.clear ===
          // 'function'` to decide whether a declared-schema Table can survive
          // a `replace` — without it every snapshot DELETED and rebuilt the
          // Table, and each attached window was left holding a handle to the
          // dead one, reading 0 rows forever with no error anywhere.
          clear: table.clear ? () => table.clear!() : undefined,
          delete: async () => {
            if (deleted) return;
            deleted = true;
            if (tables.get(name) === owned) tables.delete(name);
            await table.delete();
          },
        };
        tables.set(name, owned);
        return owned;
      };
    },

    async attach(portLike: FramePortLike | MessagePort): Promise<void> {
      if (stopped) return;
      // One cast here rather than one at every call site: a `MessagePort`'s
      // `onmessage` is typed against the full DOM `MessageEvent`, which is not
      // assignable to the structural handler under `strictFunctionTypes`.
      const port = portLike as FramePortLike;
      let client: HostClientLike;
      try {
        client = await hostClient();
      } catch (err) {
        onError('attach', err);
        return;
      }

      const session = client.new_proxy_session((response: Uint8Array) => {
        // COPY before it leaves. Protocol buffers are views over the wasm
        // HEAPU8, which DETACHES when wasm memory grows; every vendor
        // transport slices for the same reason.
        const frame = response.slice().buffer;
        port.postMessage(frame, [frame as unknown as Transferable]);
      });
      sessions.push(session);

      // Requests are serialized. `handle_request` is async and port delivery
      // does not wait for it, so without this chain frame N+1 can enter the
      // engine while frame N is still being decoded.
      let queue: Promise<void> = Promise.resolve();

      port.onmessage = (event: { data: unknown }) => {
        const data = event.data as { cmd?: string; id?: unknown } | ArrayBuffer;
        if (data !== null && typeof data === 'object' && 'cmd' in data && data.cmd === 'init') {
          // The vendor handshake: `_init` resolves on the FIRST message it
          // sees, so this must be answered with exactly one and nothing else.
          // Its `args[0]` is the window's copy of the server wasm, ignored
          // here because the engine is already up — which is the point.
          port.postMessage({ id: (data as { id?: unknown }).id });
          return;
        }
        queue = queue
          .then(() => session.handle_request(new Uint8Array(data as ArrayBuffer)))
          .catch((err) => onError('request', err));
      };
      port.start?.();
    },

    async hostedTableNames(): Promise<string[]> {
      const client = await hostClient();
      return (await client.get_hosted_table_names?.()) ?? [...tables.keys()];
    },

    getTable(name: string): HostTableLike | null {
      return tables.get(name) ?? null;
    },

    onTableUpdate(name: string, listener: () => void): () => void {
      let listeners = updateListeners.get(name);
      if (!listeners) {
        listeners = new Set();
        updateListeners.set(name, listeners);
      }
      listeners.add(listener);
      return () => {
        const set = updateListeners.get(name);
        if (!set) return;
        set.delete(listener);
        if (set.size === 0) updateListeners.delete(name);
      };
    },

    get attachedPorts() {
      return sessions.length;
    },

    async stop(): Promise<void> {
      stopped = true;
      for (const session of sessions.splice(0)) {
        await session.close?.().catch(() => {});
      }
      // Snapshot first: each delete de-registers itself from the map.
      for (const table of [...tables.values()]) {
        await table.delete().catch(() => {});
      }
      tables.clear();
      updateListeners.clear();
    },
  };
}
