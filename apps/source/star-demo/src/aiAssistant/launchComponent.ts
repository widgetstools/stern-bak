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

/** Tail for a tool summary — says whether the window actually opened. */
export function describeLaunch(outcome: LaunchOutcome, displayName: string): string {
  if (outcome.ok) return ` Opened "${displayName}".`;
  if (outcome.reason === 'no-openfin') return ' Open it from the dock button (not running under OpenFin here).';
  return ` Couldn't open it automatically (${outcome.detail ?? 'unknown error'}) — use the dock button.`;
}
