/**
 * A `ProviderHandle` that stands in while the real transport is not yet
 * running — the hub has asked a window for a provider sub-worker port and
 * the answer is in flight. `restart(extra)` calls are queued and replayed
 * onto the real handle once it exists; `stop()` before resolution cancels
 * the queue and stops the real handle on arrival.
 */

import type { ProviderHandle } from '../providers/Provider.js';

export interface DeferredProviderHandle {
  handle: ProviderHandle;
  /** Bind the real transport; replays queued restarts (or stops it if already stopped). */
  resolve(real: ProviderHandle): void;
  /** True once `resolve` ran. */
  readonly resolved: boolean;
}

export function createDeferredProviderHandle(): DeferredProviderHandle {
  let real: ProviderHandle | null = null;
  let stopped = false;
  const queued: Array<Record<string, unknown> | undefined> = [];

  const handle: ProviderHandle = {
    stop() {
      stopped = true;
      queued.length = 0;
      return real?.stop();
    },
    restart(extra) {
      if (real) return real.restart(extra);
      if (!stopped) queued.push(extra);
      return undefined;
    },
  };

  return {
    handle,
    get resolved() {
      return real !== null;
    },
    resolve(r) {
      if (real) return;
      real = r;
      if (stopped) {
        void r.stop();
        return;
      }
      for (const extra of queued.splice(0)) void r.restart(extra);
    },
  };
}
