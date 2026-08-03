/**
 * Window side of the push path: ask the worker a whole-book question once,
 * and be told the answer whenever it changes.
 *
 * There is no polling here, and that is the point. Counting a saved filter,
 * asking whether any row trips a style rule, listing a column's distinct
 * values and watching an alert rule used to mean a window re-scanning the
 * whole filtered book on a timer — one scan per window per question, all of
 * them queued in the same serialized engine the block reads a user is
 * scrolling toward go through. The worker answers each question once for
 * every window that asked; this is the subscribe/unsubscribe end of that.
 *
 * The client is STRUCTURAL, like `usePerspectiveTable`'s: this folder must
 * not import `@wellsfargo-starui/data`. Only the wire types are shared, and
 * those live in the foundation layer where both sides may reach them.
 */
import type {
  PerspectiveQueryResult,
  PerspectiveQuerySpec,
} from '@wellsfargo-starui/types';

/** Handle the data-services client hands back for one worker subscription. */
export interface PerspectiveQuerySubscriptionLike {
  subId: string;
  unsubscribe(): void;
}

export interface PerspectiveQueryClientLike {
  subscribePerspectiveQuery(
    providerId: string,
    query: PerspectiveQuerySpec,
    onResult: (result: PerspectiveQueryResult) => void,
  ): PerspectiveQuerySubscriptionLike;
}

export type PerspectiveQueryListener = (result: PerspectiveQueryResult) => void;

export interface PerspectiveQueryClient {
  /**
   * Watch one question. Returns an unsubscribe; calling it twice is safe.
   * The listener fires on every push, and — for the kinds that carry an
   * absolute answer — immediately with the last one if there is one.
   */
  subscribe(
    providerId: string,
    query: PerspectiveQuerySpec,
    onResult: PerspectiveQueryListener,
  ): () => void;
  /** Worker subscriptions currently open — for diagnostics and tests. */
  readonly openSubscriptions: number;
  /** Drop everything this window opened. */
  close(): void;
}

/**
 * Kinds whose result is an ABSOLUTE answer rather than a transition.
 *
 * Only these are shared between local listeners. A `matchSet` or
 * `changeRule` push says what just CHANGED, so handing the same push to a
 * listener that subscribed later would report transitions it was not around
 * for — and replaying a cached one would report them twice. Those kinds get
 * their own worker subscription each, which costs a registry entry and not
 * a second View: the worker still dedupes the View across them, and tracks
 * per-subscriber what each has already seen.
 */
const SHAREABLE_KINDS = new Set<PerspectiveQuerySpec['kind']>([
  'count',
  'countExpression',
  'aggregate',
  'distinctValues',
]);

interface Shared {
  key: string;
  handle: PerspectiveQuerySubscriptionLike;
  listeners: Set<PerspectiveQueryListener>;
  last: PerspectiveQueryResult | null;
}

/**
 * Local identity for a question. Coarser than the worker's — it does not
 * translate the filter model — because its only job is to stop ONE window
 * opening the same subscription twice. Two windows converging on the same
 * View is the worker's registry to decide.
 */
function localKey(providerId: string, query: PerspectiveQuerySpec): string {
  return `${providerId} ${JSON.stringify(query)}`;
}

export function createPerspectiveQueryClient(
  client: PerspectiveQueryClientLike,
): PerspectiveQueryClient {
  const shared = new Map<string, Shared>();
  const solo = new Set<PerspectiveQuerySubscriptionLike>();
  let closed = false;

  function subscribeShared(
    providerId: string,
    query: PerspectiveQuerySpec,
    onResult: PerspectiveQueryListener,
  ): () => void {
    const key = localKey(providerId, query);
    let entry = shared.get(key);
    if (!entry) {
      const created: Shared = {
        key,
        listeners: new Set(),
        last: null,
        handle: null!,
      };
      created.handle = client.subscribePerspectiveQuery(providerId, query, (result) => {
        created.last = result;
        for (const listener of [...created.listeners]) listener(result);
      });
      shared.set(key, created);
      entry = created;
    }

    const live = entry;
    live.listeners.add(onResult);
    // A second panel asking a question this window already answered should
    // paint now, not after the next tick of a feed that may be quiet.
    if (live.last) onResult(live.last);

    let released = false;
    return () => {
      if (released) return;
      released = true;
      live.listeners.delete(onResult);
      if (live.listeners.size > 0) return;
      shared.delete(live.key);
      live.handle.unsubscribe();
    };
  }

  function subscribeSolo(
    providerId: string,
    query: PerspectiveQuerySpec,
    onResult: PerspectiveQueryListener,
  ): () => void {
    const handle = client.subscribePerspectiveQuery(providerId, query, onResult);
    solo.add(handle);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      solo.delete(handle);
      handle.unsubscribe();
    };
  }

  return {
    get openSubscriptions() {
      return shared.size + solo.size;
    },

    subscribe(providerId, query, onResult) {
      if (closed) return () => {};
      return SHAREABLE_KINDS.has(query.kind)
        ? subscribeShared(providerId, query, onResult)
        : subscribeSolo(providerId, query, onResult);
    },

    close() {
      if (closed) return;
      closed = true;
      for (const entry of [...shared.values()]) {
        entry.listeners.clear();
        entry.handle.unsubscribe();
      }
      shared.clear();
      for (const handle of [...solo]) handle.unsubscribe();
      solo.clear();
    },
  };
}
