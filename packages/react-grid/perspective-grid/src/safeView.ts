/**
 * Deletion-safe wrapper around a Perspective View.
 *
 * MEASURED on @perspective-dev/client 4.5.2: calling `view.delete()` while a
 * `to_columns()` read is in flight throws
 *
 *     Error: attempted to take ownership of Rust value while it was borrowed
 *
 * from inside a wasm-futures microtask. This is NOT catchable by the caller —
 * neither `try/await/catch` around the read nor `.catch()` on the delete
 * intercepts it; in Node it terminated the process outright. The same defect
 * was present in @finos/perspective 3.8 and survives into 4.5.2.
 *
 * The Table lives in the SharedWorker, so an uncatchable throw there can take
 * the worker down and with it every blotter. AG Grid swaps Views on every
 * sort/filter change while blocks are still in flight, so this is a routine
 * path, not an edge case.
 *
 * The rule this enforces: a View is deleted only once its in-flight reads
 * have drained. `close()` is therefore asynchronous and idempotent; reads
 * attempted after close resolve to `null` so the datasource can settle the
 * block EMPTY rather than leaking an AG Grid request (see
 * `createPerspectiveDatasource`, rule 1).
 */
import type { PerspectiveViewLike } from './perspectiveDatasource.js';

export interface DeletableView extends PerspectiveViewLike {
  delete(): Promise<void>;
}

export interface SafeView {
  /**
   * Read a window. Resolves `null` when the view is closing/closed —
   * callers must treat that as "settle empty", never as "skip settling".
   */
  read(window: { start_row: number; end_row: number }): Promise<Record<string, unknown[]> | null>;
  /**
   * Current row count. Resolves `null` when the view is closing/closed.
   *
   * Refcounted for the same reason `read` is: `num_rows()` borrows the same
   * Rust value a concurrent `delete()` would take ownership of.
   */
  rows(): Promise<number | null>;
  /** Drain in-flight reads, then delete exactly once. Safe to call repeatedly. */
  close(): Promise<void>;
  readonly closed: boolean;
  /** In-flight read count — for diagnostics/tests. */
  readonly pending: number;
}

export function createSafeView(view: DeletableView): SafeView {
  let pending = 0;
  let closing = false;
  let deleted: Promise<void> | null = null;
  /** Resolvers waiting for `pending` to hit zero. */
  let drainWaiters: (() => void)[] = [];

  const settleDrain = () => {
    if (pending === 0 && drainWaiters.length > 0) {
      const waiters = drainWaiters;
      drainWaiters = [];
      for (const w of waiters) w();
    }
  };

  return {
    get closed() {
      return closing;
    },
    get pending() {
      return pending;
    },

    async read(window) {
      // Refuse once closing: starting a read now could overlap the delete.
      if (closing) return null;

      pending += 1;
      try {
        return await view.to_columns(window);
      } finally {
        pending -= 1;
        settleDrain();
      }
    },

    async rows() {
      if (closing) return null;

      pending += 1;
      try {
        return await view.num_rows();
      } finally {
        pending -= 1;
        settleDrain();
      }
    },

    close(): Promise<void> {
      // Idempotent: every caller awaits the same single deletion.
      if (deleted) return deleted;

      closing = true; // no new reads from this point

      deleted = (async () => {
        if (pending > 0) {
          await new Promise<void>((resolve) => {
            drainWaiters.push(resolve);
            settleDrain(); // guard against draining between the check and the push
          });
        }
        await view.delete();
      })();

      return deleted;
    },
  };
}
