/**
 * Opens a registered component — the same path a dock click takes.
 *
 * The import is DYNAMIC on purpose. `launchRegisteredComponent` lives in the
 * main `@wellsfargo-starui/openfin` barrel, which pulls
 * `@openfin/workspace-platform` at module top level and throws at module-eval
 * time outside OpenFin (see the note in `iabTopics.ts`). A static import would
 * break the assistant in a plain browser and in the unit suite, so the module
 * is only pulled in when there's a `fin` runtime to use it.
 */

export type LaunchOutcome =
  | { ok: true }
  | { ok: false; reason: 'no-openfin' | 'failed'; detail?: string };

function hasOpenFin(): boolean {
  return typeof (globalThis as { fin?: unknown }).fin !== 'undefined';
}

export async function launchBlotter(entryId: string, asWindow: boolean): Promise<LaunchOutcome> {
  if (!hasOpenFin()) return { ok: false, reason: 'no-openfin' };
  try {
    const mod = await import('@wellsfargo-starui/openfin');
    const view = await mod.launchRegisteredComponent(entryId, { asWindow });
    // The launcher is deliberately fire-and-forget for unresolvable ids: it
    // warns and returns undefined rather than throwing.
    return view ? { ok: true } : { ok: false, reason: 'failed', detail: `registry entry "${entryId}" did not resolve` };
  } catch (err) {
    return { ok: false, reason: 'failed', detail: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Reloads the windows already showing `entryId`, in place.
 *
 * Most assistant edits are picked up live — the blotter re-reads its config row
 * when an outside writer touches it. A few can't be: the provider BINDING and a
 * provider's column definitions are read once when the container mounts, so a
 * change to either leaves the open grid on the old feed.
 *
 * The answer to that is to reload the window the user already has, not to tell
 * them to open the blotter again — reopening a non-singleton spawns a second
 * copy, and even for a singleton the launcher focuses without reloading, so the
 * stale feed would survive the trip.
 *
 * Matching is by the launcher's deterministic window name,
 * `registered-<entryId>-<instanceId>` (see `createComponentInstance`), so every
 * window of this component is found whether it is a singleton (one window, id
 * === the template) or an older multi-instance blotter. Views hosted inside a
 * layout are not reachable this way — `createView` gets no name — so a
 * view-hosted blotter still needs a manual reopen; the count returned is what
 * actually reloaded, never a guess.
 */
export async function reloadOpenComponents(entryId: string): Promise<number> {
  if (!hasOpenFin()) return 0;
  try {
    const fin = (globalThis as { fin?: OpenFinLike }).fin;
    const app = fin?.Application?.getCurrentSync?.();
    if (!app?.getChildWindows) return 0;
    const windows = await app.getChildWindows();
    const prefix = `registered-${entryId}-`;
    const mine = windows.filter((w) => w?.identity?.name?.startsWith(prefix));
    // Reloaded in parallel and counted by what resolved: one window failing
    // (closing mid-call is the ordinary case) must not lose the others.
    const results = await Promise.allSettled(mine.map((w) => w.reload()));
    return results.filter((r) => r.status === 'fulfilled').length;
  } catch (err) {
    console.debug('[aiAssistant] could not reload open component windows:', err);
    return 0;
  }
}

/** Minimal shape of the OpenFin globals this module touches. */
interface OpenFinLike {
  Application?: {
    getCurrentSync?: () => {
      getChildWindows?: () => Promise<Array<{ identity?: { name?: string }; reload: () => Promise<void> }>>;
    };
  };
}

/**
 * Tail for a tool summary that had to reload rather than apply live. Says what
 * happened to the windows the user already has open.
 */
export function describeReload(reloaded: number): string {
  if (reloaded > 0) {
    return ` Reloaded the ${reloaded} open window(s) in place, so this is already showing.`;
  }
  return ' Nothing is open to reload — it applies when you open the blotter.';
}

/** Tail for a tool summary — says whether the window actually opened. */
export function describeLaunch(outcome: LaunchOutcome, displayName: string): string {
  if (outcome.ok) return ` Opened "${displayName}".`;
  if (outcome.reason === 'no-openfin') return ' Open it from the dock button (not running under OpenFin here).';
  return ` Couldn't open it automatically (${outcome.detail ?? 'unknown error'}) — use the dock button.`;
}
