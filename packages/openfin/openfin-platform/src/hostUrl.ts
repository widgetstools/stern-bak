// ─── Host URL resolution ─────────────────────────────────────────────
//
// OpenFin's `platform.createView({url})` and `fin.Window.create({url})`
// run in the OpenFin runtime process and have no implicit base URL —
// they require an absolute URL. The Registry stores `hostUrl` as the
// user typed it (could be an absolute `https://…` or a host-relative
// path like `/blotters/marketsgrid`). Normalising at launch time, not
// at registry-write time, keeps registries portable: an entry written
// on `localhost:5174` resolves correctly when imported on prod.
//
// Lives in its own file (no top-level workspace-platform imports) so
// the side-effect-free `@wellsfargo-starui/openfin-platform/config` subpath
// can re-export it for in-browser consumers like the registry editor.

/**
 * Normalise a registry `hostUrl` into an absolute URL OpenFin will
 * accept.
 *
 * Rules:
 *   • Already-absolute (`http://`, `https://`, `file://`, `data:`,
 *     etc.) — returned unchanged.
 *   • Starts with `//` — protocol-relative, resolved against
 *     `window.location.href` (gets the current protocol).
 *   • Starts with `/` — host-relative path, resolved against
 *     `window.location.href` (gets origin).
 *   • Anything else (bare relative like `views/foo`) — also resolved
 *     against `window.location.href`, so it behaves like an `<a href>`.
 *
 * Returns the input unchanged when `window` isn't available (Node /
 * SSR contexts), since there's no origin to graft onto.
 */
export function resolveHostUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl;
  // Already absolute (scheme:// or scheme:) — leave alone
  if (/^[a-z][a-z0-9+.-]*:/i.test(rawUrl)) return rawUrl;
  if (typeof window === "undefined" || !window.location) return rawUrl;
  try {
    return new URL(rawUrl, window.location.href).toString();
  } catch {
    return rawUrl;
  }
}

/**
 * Stamp launch identity onto a view/window URL so reloads and workspace
 * snapshots resolve the per-instance id synchronously from the query string.
 *
 * Writes both `instanceId` (read by `useHostedIdentity`) and `id` (read by
 * workspace GC via `instanceIdsFromSnapshot`).
 */
export function appendLaunchIdentityParams(url: string, instanceId: string): string {
  if (!url || !instanceId) return url;
  try {
    const resolved = new URL(url, typeof window !== "undefined" ? window.location.href : undefined);
    resolved.searchParams.set("instanceId", instanceId);
    resolved.searchParams.set("id", instanceId);
    return resolved.toString();
  } catch {
    return url;
  }
}
