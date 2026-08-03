/**
 * Window side of the pull path: turn a provider id into the worker-held Table.
 *
 * Three steps, all of which have a reason to be here rather than in an app:
 *
 *   1. ask the hub to bind a ProxySession to a fresh MessagePort
 *   2. build this window's Perspective `Client` on that port
 *   3. `open_table(name)` — the Table the provider's feed already filled
 *
 * `perspective.worker(port)` runs HERE, not in the worker, because it is the
 * call that needs `customElements`. The module is loaded dynamically so the
 * engine's wasm is fetched only by windows that actually open a blotter.
 *
 * The client is structural on purpose. This folder must not import
 * `@wellsfargo-starui/data` — a grid package reaching into the data bucket
 * inverts the layer rules, and the only thing it needs is one method.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { loadPerspectiveClient } from './loadPerspectiveClient.js';
import type { PerspectiveTableLike } from './viewManager.js';

/** Answer from the data-services client's `attachPerspective`. */
export type PerspectiveAttachOutcome =
  | { ok: true; port: MessagePort; tableName: string }
  | { ok: false; reason: string };

export interface PerspectiveAttachClientLike {
  attachPerspective(providerId: string): Promise<PerspectiveAttachOutcome>;
}

/** The slice of `@perspective-dev/client` a window needs. */
export interface PerspectiveClientModuleLike {
  worker(port: Promise<MessagePort> | MessagePort): Promise<{
    open_table(name: string): Promise<PerspectiveTableLike>;
  }>;
}

export type PerspectiveTableStatus =
  | 'idle'
  | 'attaching'
  | 'ready'
  /** The provider holds no Table — a caller should use the push path. */
  | 'unavailable'
  | 'error';

export interface UsePerspectiveTableOpts {
  /**
   * Resolve the Perspective module. Defaults to `loadPerspectiveClient` — the
   * slim 47.70 kB build pointed at the client wasm as a separate cacheable
   * asset, rather than the 5,070 kB inline build that also carries the server
   * binary this window can never run.
   */
  loadPerspective?: () => Promise<PerspectiveClientModuleLike>;
  /** Set false to hold off attaching (e.g. before a provider is chosen). */
  enabled?: boolean;
}

export interface UsePerspectiveTableResult {
  /** Pass straight to `MarketsGrid`'s `perspectiveTable`. Null until ready. */
  table: PerspectiveTableLike | null;
  tableName: string | null;
  status: PerspectiveTableStatus;
  /** Why there is no Table — set for `unavailable` and `error`. */
  reason?: string;
}

const defaultLoad = (): Promise<PerspectiveClientModuleLike> => loadPerspectiveClient();

/**
 * One attach per (hub client, provider) in a window, ref-counted.
 *
 * MEASURED, and the reason this cache exists at all: React StrictMode
 * double-invokes the mount effect, so a naive per-effect attach ran
 * setup → cleanup → setup. The cleanup CLOSED the frame port, and the Table
 * handle opened over it kept being used — it read 0 rows forever while another
 * client on the same worker read the full 20,000, with no error to explain it.
 *
 * Sharing is right on its own terms too: two blotters on the same provider in
 * one window should read the Table over one port and one engine instance, not
 * two.
 *
 * Teardown is DEFERRED rather than immediate. A synchronous release on
 * StrictMode's cleanup would drop the refcount to zero and close the port a
 * microtask before the second setup asks for it back.
 */
interface Attachment {
  refs: number;
  result: Promise<
    | { ok: true; table: PerspectiveTableLike; tableName: string }
    | { ok: false; reason: string }
  >;
  port: MessagePort | null;
  teardown: ReturnType<typeof setTimeout> | null;
}

const ATTACH_LINGER_MS = 1_000;

const attachments = new WeakMap<
  PerspectiveAttachClientLike,
  Map<string, Attachment>
>();

function acquire(
  client: PerspectiveAttachClientLike,
  providerId: string,
  load: () => Promise<PerspectiveClientModuleLike>,
): Attachment {
  let byProvider = attachments.get(client);
  if (!byProvider) {
    byProvider = new Map();
    attachments.set(client, byProvider);
  }

  const existing = byProvider.get(providerId);
  if (existing) {
    if (existing.teardown !== null) {
      clearTimeout(existing.teardown);
      existing.teardown = null;
    }
    existing.refs += 1;
    return existing;
  }

  const attachment: Attachment = { refs: 1, port: null, teardown: null, result: null! };
  attachment.result = (async () => {
    const outcome = await client.attachPerspective(providerId);
    if (!outcome.ok) return { ok: false as const, reason: outcome.reason };
    attachment.port = outcome.port;
    const perspective = await load();
    const windowClient = await perspective.worker(Promise.resolve(outcome.port));
    const table = await windowClient.open_table(outcome.tableName);
    return { ok: true as const, table, tableName: outcome.tableName };
  })();
  byProvider.set(providerId, attachment);
  return attachment;
}

function release(
  client: PerspectiveAttachClientLike,
  providerId: string,
  attachment: Attachment,
): void {
  attachment.refs -= 1;
  if (attachment.refs > 0 || attachment.teardown !== null) return;

  attachment.teardown = setTimeout(() => {
    if (attachment.refs > 0) return;
    attachments.get(client)?.delete(providerId);
    // The Table is NOT deleted — the worker owns it and other windows are
    // reading it. Closing the port is what ends THIS window's session.
    try {
      attachment.port?.close();
    } catch {
      /* idempotent */
    }
  }, ATTACH_LINGER_MS);
}

export function usePerspectiveTable(
  client: PerspectiveAttachClientLike | null | undefined,
  providerId: string | null | undefined,
  opts: UsePerspectiveTableOpts = {},
): UsePerspectiveTableResult {
  const { loadPerspective, enabled = true } = opts;
  const [state, setState] = useState<UsePerspectiveTableResult>({
    table: null,
    tableName: null,
    status: 'idle',
  });

  // Held in a ref so changing the loader identity — an inline arrow in a
  // caller's render is the normal case — does not tear down a live Table.
  const loadRef = useRef(loadPerspective);
  loadRef.current = loadPerspective;

  useEffect(() => {
    if (!client || !providerId || !enabled) {
      setState({ table: null, tableName: null, status: 'idle' });
      return;
    }

    let live = true;
    setState({ table: null, tableName: null, status: 'attaching' });
    const attachment = acquire(client, providerId, loadRef.current ?? defaultLoad);

    void attachment.result.then(
      (outcome) => {
        if (!live) return;
        setState(
          outcome.ok
            ? { table: outcome.table, tableName: outcome.tableName, status: 'ready' }
            : { table: null, tableName: null, status: 'unavailable', reason: outcome.reason },
        );
      },
      (err: unknown) => {
        if (!live) return;
        setState({
          table: null,
          tableName: null,
          status: 'error',
          reason: err instanceof Error ? err.message : String(err),
        });
      },
    );

    return () => {
      live = false;
      release(client, providerId, attachment);
    };
  }, [client, providerId, enabled]);

  return useMemo(() => state, [state]);
}
