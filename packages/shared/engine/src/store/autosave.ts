import type { SerializedState, Store } from '../platform/types';

interface Snapshotable {
  serializeAll(): Record<string, SerializedState>;
}

export interface AutoSaveOptions {
  /** Source of truth for module state. */
  platform: Snapshotable;
  /** Store to subscribe to. */
  store: Store;
  /** Called after the debounce settles. May be async. */
  persist: (snapshot: Record<string, SerializedState>) => void | Promise<void>;
  /** Debounce window in ms. Default 300. */
  debounceMs?: number;
  /** Optional error sink. Defaults to console.warn. Never re-thrown. */
  onError?: (err: unknown) => void;
}

export interface AutoSaveHandle {
  /** Stop subscribing. Cancels pending debounce but does NOT wait for
   *  in-flight persist. Call `flushNow()` first if you need a clean stop. */
  dispose(): void;
  /** Cancel debounce and persist immediately. Resolves once the write
   *  (and any coalesced follow-up) settles. Safe from a Save button. */
  flushNow(): Promise<void>;
  /** Cancel the debounce without persisting. Used by delete-profile: a
   *  flush would recreate the just-deleted record. */
  cancelScheduled(): void;
}

/**
 * Debounced auto-save. Subscribes to the store; on every change schedules
 * a serialize+persist after `debounceMs` of quiet.
 *
 * Concurrency contract:
 *   - At most one persist in flight at any time.
 *   - Updates arriving during an in-flight persist coalesce into one
 *     follow-up write (using the freshest snapshot at that moment).
 *   - Writes never interleave, even with slow adapters.
 */
export function startAutoSave(opts: AutoSaveOptions): AutoSaveHandle {
  const debounceMs = opts.debounceMs ?? 300;
  const onError = opts.onError ?? ((err) => console.warn('[autosave]', err));

  let timer: ReturnType<typeof setTimeout> | null = null;
  let inflight: Promise<void> | null = null;
  let pending = false;
  let disposed = false;

  const runPersist = async (): Promise<void> => {
    if (inflight) {
      pending = true;
      return inflight;
    }
    inflight = (async () => {
      try {
        while (!disposed) {
          pending = false;
          try {
            await opts.persist(opts.platform.serializeAll());
          } catch (err) {
            onError(err);
          }
          if (!pending) break; // no one requested a follow-up while we were writing
        }
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  };

  const schedule = () => {
    if (disposed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void runPersist();
    }, debounceMs);
  };

  const unsubscribe = opts.store.subscribe(() => schedule());

  return {
    dispose() {
      disposed = true;
      if (timer) clearTimeout(timer);
      timer = null;
      unsubscribe();
    },
    async flushNow() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      await runPersist();
    },
    cancelScheduled() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
