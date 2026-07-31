/// <reference path="../types/openfinRuntime.d.ts" />
import type { ActiveIdSource } from '@wellsfargo-starui/engine';

/**
 * OpenFin per-view active-profile pointer source.
 *
 * Stores the active profile id on the current view's `customData`. This
 * lets duplicated views show different profiles of the same MarketsGrid
 * instance: each view carries its own override on `customData`, and the
 * platform's snapshot capture round-trips it through workspace
 * save/restore for free.
 *
 * Returns `null` when `fin` is unavailable, so non-OpenFin hosts (browser,
 * Electron, tests) silently fall through to localStorage as before. Both
 * `read()` and `write()` swallow errors — the source is best-effort and
 * must never block ProfileManager boot or a profile commit.
 *
 * Read on grid mount:
 *   - When set, the manager prefers this id over the localStorage
 *     pointer. If the row no longer exists on disk, it falls through to
 *     localStorage, then Default.
 *
 * Written on every active-id commit (boot/load/create/clone/import/
 * remove-active):
 *   - `fin.me.updateOptions({ customData: { ...current, activeProfileId } })`
 *     mutates the live view's options. `Platform.getSnapshot()` reads
 *     from those same options, so the active id is captured into the
 *     workspace snapshot automatically.
 */
export function createOpenFinViewProfileSource(): ActiveIdSource | null {
  // `globalThis.fin` is declared by src/types/openfinRuntime.d.ts as a
  // narrow surface — just the two `me.*` methods this module uses.
  // Capture `me` locally so TypeScript's narrowing flows into the async
  // closures below (it forgets the optional-chain refinement across
  // function boundaries).
  const me = globalThis.fin?.me;
  if (!me?.getOptions || !me?.updateOptions) return null;

  return {
    async read(): Promise<string | null> {
      try {
        const opts = await me.getOptions();
        const id = opts?.customData?.activeProfileId;
        return typeof id === 'string' && id ? id : null;
      } catch {
        return null;
      }
    },
    async write(id: string): Promise<void> {
      try {
        const opts = await me.getOptions();
        const current = (opts?.customData ?? {}) as Record<string, unknown>;
        if (current.activeProfileId === id) return;
        await me.updateOptions({
          customData: { ...current, activeProfileId: id },
        });
      } catch {
        /* swallow — best-effort */
      }
    },
  };
}
