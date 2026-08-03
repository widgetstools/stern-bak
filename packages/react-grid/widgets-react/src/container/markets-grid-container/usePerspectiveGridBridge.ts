/**
 * The container's end of the Perspective pull path.
 *
 * `MarketsGridContainer` is the only place that knows both which provider is
 * selected and which data-services client this window holds, so it is the only
 * place that can turn a `*-perspective` provider into the four props the grid's
 * engine layer needs. Everything here is inert for a classic provider: `active`
 * false yields no rowModel, no table and no queries, and the container passes
 * exactly what it passed before.
 *
 * Order matters, and it is the reason this is a hook rather than four lines
 * inlined in the container:
 *
 *   1. The worker refuses `attachPerspective` for a provider that is not
 *      running — there is no Table until a feed has built one. So the provider
 *      must be STARTED first, and the attach held off (`enabled`) until it is.
 *      Attaching eagerly gets a permanent-looking refusal for a condition that
 *      resolves a moment later.
 *   2. Starting is what this window does INSTEAD of wiring rows into the grid.
 *      `useProviderDataWiring` is handed a null provider on this path, so
 *      `applyProviderToGrid` — client-side `applyTransactionAsync` tick
 *      classification, which is not a write path at all under a server row
 *      model — never runs.
 *
 * The window still receives the provider's push stream, because the tee feeds
 * the Table off the SIDE of that stream rather than replacing it. Nothing is
 * done with those rows here; suppressing the fanout is a worker-side change to
 * the tee, not something a consumer can decide.
 *
 * A refusal is rendered, never spun on: `attachPerspective` never rejects, so
 * every failure arrives as a `reason` the container puts on screen.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  createPerspectiveQueryClient,
  usePerspectiveTable,
  type PerspectiveAttachClientLike,
  type PerspectiveQueryClient,
  type PerspectiveQueryClientLike,
  type PerspectiveTableLike,
  type PerspectiveTableStatus,
  type UsePerspectiveTableOpts,
} from '@wellsfargo-starui/grid/perspective';
import {
  createPerspectiveWorkerQueries,
  type MarketsGridRowModel,
  type PerspectiveGridQueries,
} from '@wellsfargo-starui/grid';
import type { ProviderConfig } from '@wellsfargo-starui/types/shared';

/** The two slices of the data-services client this path uses. */
export interface PerspectiveHubClientLike
  extends PerspectiveAttachClientLike,
    PerspectiveQueryClientLike {}

/** Minimal provider surface — only `start()` is needed to bring the slot up. */
export interface StartableProviderLike {
  start(): Promise<void>;
}

export interface UsePerspectiveGridBridgeParams {
  /** Resolved cfg of the active provider, or null while it loads. */
  cfg: ProviderConfig | null;
  providerId: string | null;
  provider: StartableProviderLike | null;
  client: PerspectiveHubClientLike | null | undefined;
  /**
   * Resolve the Perspective module. Defaults to the engine's own slim client
   * build; a host supplies one to point at a different build, and a test to
   * stay off wasm entirely.
   */
  loadPerspective?: UsePerspectiveTableOpts['loadPerspective'];
}

export interface PerspectiveGridBridge {
  /**
   * `undefined` for a classic provider. It must stay undefined rather than
   * `'client'`: a host that never opts in should reach `MarketsGrid` with the
   * prop absent, exactly as before this path existed.
   */
  rowModel?: MarketsGridRowModel;
  /** Null while attaching — `GridSurfaceSlot` renders `'pending'`, never a stand-in grid. */
  table: PerspectiveTableLike | null;
  /** The Table's index column. Only ever a single scalar column. */
  keyColumn?: string;
  queries: PerspectiveGridQueries | null;
  status: PerspectiveTableStatus;
  /** Why there is no Table. Set for `unavailable` and `error`. */
  reason?: string;
}

const INACTIVE: PerspectiveGridBridge = { table: null, queries: null, status: 'idle' };

/** True for the provider types whose book lives in a worker-held Table. */
export function isPerspectiveProviderType(providerType: string | undefined): boolean {
  return providerType === 'stomp-perspective' || providerType === 'mock-perspective';
}

export function usePerspectiveGridBridge(
  params: UsePerspectiveGridBridgeParams,
): PerspectiveGridBridge {
  const { cfg, providerId, provider, client, loadPerspective } = params;
  const active = isPerspectiveProviderType(cfg?.providerType);

  // Perspective indexes by ONE scalar column. A composite key has no Table
  // equivalent, and the worker refuses the attach naming the columns — so
  // there is nothing to pass down and nothing to guess at here.
  const rawKeyColumn = (cfg as { keyColumn?: string | readonly string[] } | null)?.keyColumn;
  const keyColumn = typeof rawKeyColumn === 'string' && rawKeyColumn ? rawKeyColumn : undefined;

  const [started, setStarted] = useState(false);
  const [startError, setStartError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!active || !provider || !providerId) {
      setStarted(false);
      setStartError(undefined);
      return;
    }
    let live = true;
    setStarted(false);
    setStartError(undefined);
    void provider.start().then(
      () => {
        if (live) setStarted(true);
      },
      (err: unknown) => {
        if (live) setStartError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      live = false;
    };
  }, [active, provider, providerId]);

  const attach = usePerspectiveTable(active ? client : null, providerId, {
    enabled: started,
    loadPerspective,
  });

  // One query client per hub client, not per subscription: it dedupes the
  // questions this window asks so two panels watching one saved filter open a
  // single worker subscription between them.
  //
  // Created INSIDE the effect, not in a memo, because `close()` is permanent —
  // a closed client answers every later `subscribe` with a no-op. A memo would
  // survive React StrictMode's cleanup-then-setup, so the second setup would
  // reuse the instance the first cleanup had just closed and every whole-book
  // question would go unanswered, silently.
  //
  // Kept in a REF rather than state, and this is not a style choice: a state
  // write here re-renders, and a caller whose `client` identity is unstable
  // would then re-run this effect on every render — an infinite loop rather
  // than the wasted work it looks like. Nothing needs the render anyway; the
  // ref is populated on mount, long before the attach that `queries` waits on.
  const queryClientRef = useRef<PerspectiveQueryClient | null>(null);
  useEffect(() => {
    if (!active || !client) return;
    const created = createPerspectiveQueryClient(client);
    queryClientRef.current = created;
    return () => {
      created.close();
      if (queryClientRef.current === created) queryClientRef.current = null;
    };
  }, [active, client]);

  const queries = useMemo(
    () =>
      queryClientRef.current && providerId && attach.table
        ? createPerspectiveWorkerQueries({ client: queryClientRef.current, providerId })
        : null,
    [providerId, attach.table],
  );

  return useMemo(() => {
    if (!active) return INACTIVE;
    if (startError) {
      return { rowModel: 'perspective', table: null, queries: null, status: 'error', reason: startError };
    }
    return {
      rowModel: 'perspective',
      table: attach.table,
      keyColumn,
      queries,
      // While `provider.start()` is in flight the attach has not been enabled
      // yet and reports `'idle'`. Reporting that verbatim would read as "not
      // using this seam" to a caller deciding whether to show progress.
      status: started ? attach.status : 'attaching',
      reason: attach.reason,
    };
  }, [active, startError, attach.table, attach.status, attach.reason, keyColumn, queries, started]);
}
