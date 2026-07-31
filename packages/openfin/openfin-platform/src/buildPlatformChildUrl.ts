/**
 * buildPlatformChildUrl — resolve a child tool-window / popout URL from the
 * platform manifest's `providerUrl` and an app-relative route `path`.
 *
 * The route mode is auto-detected from the manifest `providerUrl`:
 *
 *   - **Path-routed** manifest (`https://host/platform/provider`, BrowserRouter):
 *     child windows load plain path URLs — `https://host/config-browser`.
 *   - **Hash-routed** manifest (`https://host/#/platform/provider`, HashRouter):
 *     child windows load fragment URLs — `https://host/#/config-browser` — so a
 *     static web server with no catch-all rewrite still serves `index.html` and
 *     HashRouter resolves the route client-side.
 *
 * This keeps a single shared OpenFin platform layer working for BOTH an app
 * that uses `BrowserRouter` (path manifest) and one that uses `HashRouter`
 * (hash manifest) with no per-app branching at the call sites.
 *
 * `path` is app-relative and MUST start with `/` (it may carry a query, e.g.
 * `/dataproviders?id=abc`). Under hash mode the query rides inside the
 * fragment (`/#/dataproviders?id=abc`); react-router's hash-aware
 * `useSearchParams` reads it correctly.
 *
 * Returns `null` when `providerUrl` is empty / unparseable, so callers can
 * early-return with their own diagnostic (mirrors the prior inline
 * `new URL(providerUrl).origin` try/catch each site used).
 */
export function buildPlatformChildUrl(providerUrl: string, path: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(providerUrl);
  } catch {
    return null;
  }
  const hashRouted = parsed.hash.startsWith('#');
  return hashRouted ? `${parsed.origin}/#${path}` : `${parsed.origin}${path}`;
}
