/**
 * data-providers-popout — open the DataProvider editor as a popout.
 *
 * Single transport: delegates to `runtime.openSurface({ kind: 'popout' })`
 * regardless of host (OpenFin / browser). The runtime port owns the
 * named-window dedup, focus-on-reopen, and customData encoding.
 *
 * Optional `providerId` is forwarded on the URL (`?id=…`) so the
 * editor snaps to that row on mount — see `views/DataProviders.tsx`
 * which reads it via `useSearchParams`.
 *
 * Previously this helper branched on `isOpenFin()` to call either
 * `window.open()` or `@wellsfargo-starui/openfin-platform/openDataProvidersToolWindow`.
 * That duplication is gone; the runtime port is the single seam.
 */

import type { RuntimePort } from '@wellsfargo-starui/host';

const POPOUT_NAME = 'data-providers';
const POPOUT_WIDTH = 1180;
const POPOUT_HEIGHT = 760;

export interface OpenProviderEditorOpts {
  /** When set, the popout opens on this provider's row. */
  providerId?: string;
  /** Mounted route path. Defaults to `/dataproviders`. */
  route?: string;
}

export async function openProviderEditorPopout(
  runtime: RuntimePort,
  opts: OpenProviderEditorOpts = {},
): Promise<void> {
  const route = opts.route ?? '/dataproviders';
  const url = buildUrl(route, opts.providerId);
  await runtime.openSurface({
    kind: 'popout',
    url,
    windowName: POPOUT_NAME,
    width: POPOUT_WIDTH,
    height: POPOUT_HEIGHT,
    // Forwarded so the OpenFin path stamps it onto window.customData
    // (matching the dock's openDataProvidersToolWindow contract).
    // The browser path serialises this to `?data=<base64>` — the
    // editor reads providerId from `?id=` so the customData copy
    // is redundant on the browser side, but harmless.
    customData: opts.providerId ? { providerId: opts.providerId } : undefined,
  });
}

function buildUrl(route: string, providerId?: string): string {
  // Both OpenFin views and the browser load from the same origin
  // (Vite app origin = OpenFin manifest providerUrl origin), so
  // `window.location.origin` is correct in both contexts. The
  // historical `resolveProviderOrigin()` indirection in
  // `@wellsfargo-starui/openfin-platform` exists for the platform provider
  // window, which may run in a different document context — views
  // don't have that problem.
  const origin = window.location.origin;
  const qs = providerId ? `?id=${encodeURIComponent(providerId)}` : '';
  // HashRouter: the route lives in the fragment so a static web server serves
  // index.html for any deep link. The `?id=` stays inside the hash — the
  // editor reads it via react-router's `useSearchParams`, which is hash-aware.
  return `${origin}/#${route}${qs}`;
}
