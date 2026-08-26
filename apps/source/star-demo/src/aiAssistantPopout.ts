/**
 * Opens the AI Assistant scoped to one blotter — the wand button on that
 * blotter's toolbar.
 *
 * Mirrors `dataProvidersPopout.ts`: one transport (`runtime.openSurface`)
 * regardless of host, with context forwarded on the URL and read back with
 * `useSearchParams` in the route (see `views/AiAssistant.tsx`).
 *
 * The window name is per-grid on purpose. The dock's general assistant is a
 * singleton, which is right for it — but two blotters each asking for their own
 * scoped assistant must get two windows rather than fighting over one.
 */
import type { RuntimePort } from '@wellsfargo-starui/core/host';

const POPOUT_WIDTH = 620;
const POPOUT_HEIGHT = 820;

export interface OpenAssistantOpts {
  /**
   * The calling window's own config-row id. This is what a blotter reliably
   * knows about itself; the assistant resolves it to a registry entry (see
   * `resolveGridForInstance`). Preferred over passing a registry id, which the
   * window can only guess at.
   */
  instanceId: string;
  /** Component Registry id, when the caller genuinely knows it. */
  gridId?: string;
  /** Shown in the assistant header alongside the id. */
  displayName?: string;
  /** Mounted route path. Defaults to `/ai-assistant`. */
  route?: string;
}

export function buildAssistantUrl(opts: OpenAssistantOpts): string {
  const route = opts.route ?? '/ai-assistant';
  const params = new URLSearchParams({ scope: 'locked', instance: opts.instanceId });
  if (opts.gridId) params.set('grid', opts.gridId);
  if (opts.displayName) params.set('name', opts.displayName);
  return `${window.location.origin}/#${route}?${params.toString()}`;
}

export async function openAssistantPopout(runtime: RuntimePort, opts: OpenAssistantOpts): Promise<void> {
  await runtime.openSurface({
    kind: 'popout',
    url: buildAssistantUrl(opts),
    // One assistant per blotter WINDOW — two windows of the same blotter each
    // get their own rather than re-targeting a shared one.
    windowName: `ai-assistant-${opts.gridId ?? opts.instanceId}`,
    width: POPOUT_WIDTH,
    height: POPOUT_HEIGHT,
  });
}
