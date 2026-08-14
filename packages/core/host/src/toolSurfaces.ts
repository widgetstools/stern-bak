import type { SurfaceHandle } from '@wellsfargo-starui/types';
import type { RuntimePort } from './RuntimePort.js';

/**
 * Platform tool-window openers — ONE definition of each tool surface's
 * name, route, and dimensions, shared by every app view that opens them
 * through `RuntimePort.openSurface` (browser popup or OpenFin platform
 * window — the port owns named-window dedup, focus-on-reopen, and
 * customData encoding).
 *
 * The routes are the platform's HashRouter conventions (the fragment
 * keeps deep links servable from a static web server); the same
 * name/route/size triples back the dock's tool-window handlers in
 * `@wellsfargo-starui/openfin`, which resolves its origin from the
 * OpenFin manifest instead of `window.location` because the platform
 * provider window may run in a different document context. App views
 * don't have that problem: OpenFin views and the browser both load from
 * the Vite app origin, so `window.location.origin` is correct here.
 */

export interface OpenProviderEditorOpts {
  /** When set, the editor opens on this provider's row (`?id=…` in the hash). */
  readonly providerId?: string;
  /** Mounted route path. Defaults to `/dataproviders`. */
  readonly route?: string;
}

export interface OpenConfigBrowserOpts {
  /** Mounted route path. Defaults to `/config-browser`. */
  readonly route?: string;
}

/**
 * Open (or focus) the DataProvider editor tool window. Optional
 * `providerId` rides the URL fragment (`#/dataproviders?id=…`) so the
 * editor snaps to that row on mount, and is mirrored into `customData`
 * for the OpenFin path (matching the dock's contract); the editor reads
 * `?id=` via react-router's hash-aware `useSearchParams`.
 */
export function openProviderEditorSurface(
  runtime: RuntimePort,
  opts: OpenProviderEditorOpts = {},
): Promise<SurfaceHandle> {
  const route = opts.route ?? '/dataproviders';
  const qs = opts.providerId ? `?id=${encodeURIComponent(opts.providerId)}` : '';
  return runtime.openSurface({
    kind: 'popout',
    url: `${window.location.origin}/#${route}${qs}`,
    windowName: 'data-providers',
    width: 1180,
    height: 760,
    customData: opts.providerId ? { providerId: opts.providerId } : undefined,
  });
}

/** Open (or focus) the Config Browser tool window. */
export function openConfigBrowserSurface(
  runtime: RuntimePort,
  opts: OpenConfigBrowserOpts = {},
): Promise<SurfaceHandle> {
  const route = opts.route ?? '/config-browser';
  return runtime.openSurface({
    kind: 'popout',
    url: `${window.location.origin}/#${route}`,
    windowName: 'config-browser',
    width: 1100,
    height: 720,
  });
}
