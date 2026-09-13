/**
 * Cleanup for per-view renderer isolation artefacts in saved layouts.
 *
 * Two generations of isolation leave `processAffinity` values behind in
 * saved pages and workspace snapshots (OpenFin persists each view's
 * fully-resolved options):
 *
 * - the reverted stamping experiment wrote a unique
 *   `processAffinity: "view-iso-…"` on every view creation;
 * - the manifest switch `platform.viewProcessAffinityStrategy: "different"`
 *   makes the RUNTIME stamp every view with a bare uuid affinity
 *   (measured 2026-09-13 on OpenFin 43.142.101.2: `view.getOptions()`
 *   reports a fresh uuid per view, and `Platform.getSnapshot()` carries
 *   it in every view's `componentState`).
 *
 * Either kind, restored on a platform where the strategy is off, keeps
 * re-creating one renderer per view — so removing the manifest key alone
 * does not switch isolation off for restored layouts. These helpers run
 * at restore time (platform `createView` / `createWindow` overrides) and
 * normalize both kinds back to the shared per-app group, so every
 * contaminated snapshot self-heals on its next restore. Other explicit
 * affinities (e.g. a readable seed value or a deliberate future grouping)
 * are left untouched.
 */

export const LEGACY_VIEW_ISOLATION_AFFINITY_PREFIX = 'view-iso-';

/**
 * A bare uuid is what the runtime assigns per view under
 * `viewProcessAffinityStrategy: "different"`; nothing in this repo sets a
 * uuid-shaped affinity on purpose.
 */
const RUNTIME_ASSIGNED_AFFINITY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface AffinityCarrier {
  processAffinity?: string;
}

interface ThrottlingCarrier {
  backgroundThrottling?: boolean;
}

/**
 * Force `backgroundThrottling: false` on view/window creation options.
 *
 * Trading-platform policy: hidden / minimized / inactive-tab views must
 * never be throttled or frozen (measured: Chromium freezes a hidden
 * view's WebContents regardless of process sharing — blotters went
 * blank until a tab switch). The manifest's `defaultViewOptions`
 * carries the same value, but saved pages/workspaces persist each
 * view's fully-RESOLVED options — layouts saved before the policy have
 * `backgroundThrottling: true` baked in, and explicit per-view options
 * beat launch defaults. Enforcing it at the platform override covers
 * every path: defaults, restores, duplication.
 */
export function disableBackgroundThrottling<T extends ThrottlingCarrier>(opts: T): T {
  opts.backgroundThrottling = false;
  return opts;
}

/** Layout-tree twin of {@link disableBackgroundThrottling} (snapshot restore). */
export function disableBackgroundThrottlingInLayout(layout: unknown): void {
  if (!layout || typeof layout !== 'object') return;
  const node = layout as Record<string, unknown>;

  if (node.componentName === 'view' || 'backgroundThrottling' in node) {
    (node as ThrottlingCarrier).backgroundThrottling = false;
  }

  const componentState = node.componentState;
  if (componentState && typeof componentState === 'object') {
    disableBackgroundThrottlingInLayout(componentState);
  }
  const content = node.content;
  if (Array.isArray(content)) {
    for (const child of content) disableBackgroundThrottlingInLayout(child);
  }
}

/** Legacy `view-iso-*` stamp or a runtime-assigned uuid: both are isolation artefacts. */
function isLegacy(value: unknown): value is string {
  return (
    typeof value === 'string'
    && (value.startsWith(LEGACY_VIEW_ISOLATION_AFFINITY_PREFIX) || RUNTIME_ASSIGNED_AFFINITY.test(value))
  );
}

/**
 * Replace an isolation artefact affinity (legacy `view-iso-*` or a
 * runtime-assigned uuid) on one options object with the shared group (or
 * drop it entirely when no shared value is supplied — OpenFin then applies
 * its default same-app grouping). Mutates and returns `opts`.
 *
 * `sharedAffinity` should be a single stable per-app value (the
 * platform uuid) so cleaned views land in the SAME renderer group as
 * seed-configured views — a cleaned view must never end up alone in a
 * fresh group, or the freeze this cleanup exists to cure comes back.
 */
export function stripLegacyViewIsolationAffinity<T extends AffinityCarrier>(
  opts: T,
  sharedAffinity?: string,
): T {
  if (isLegacy(opts.processAffinity)) {
    if (sharedAffinity) opts.processAffinity = sharedAffinity;
    else delete opts.processAffinity;
  }
  return opts;
}

/**
 * Walk a snapshot/seed window layout tree (same shape the old
 * isolation stamping walked) and clean every embedded view
 * componentState. Unknown shapes are left untouched.
 */
export function stripLegacyViewIsolationFromLayout(
  layout: unknown,
  sharedAffinity?: string,
): void {
  if (!layout || typeof layout !== 'object') return;
  const node = layout as Record<string, unknown>;

  if (isLegacy(node.processAffinity)) {
    stripLegacyViewIsolationAffinity(node as AffinityCarrier, sharedAffinity);
  }

  const componentState = node.componentState;
  if (componentState && typeof componentState === 'object') {
    stripLegacyViewIsolationFromLayout(componentState, sharedAffinity);
  }
  const content = node.content;
  if (Array.isArray(content)) {
    for (const child of content) stripLegacyViewIsolationFromLayout(child, sharedAffinity);
  }
}

// ─── Platform-level process-affinity policy ────────────────────────────
//
// The manifest's `platform.viewProcessAffinityStrategy` ("same" |
// "different") decides how same-origin views are grouped into renderer
// processes. When it is "different" (one renderer per view — the WORKLOG 21
// experiment for blotters docked into one Browser window), any explicit
// `processAffinity` on a view would regroup views again: the seed used to
// pin `"star-demo"` on every view and saved pages / workspaces persist each
// view's fully-resolved options, so old layouts still carry it. The policy
// strips EVERY affinity (legacy `view-iso-*` and the shared group alike) so
// the strategy governs. Without the strategy it is the cleanup above, which
// also normalizes the uuid affinities the runtime stamped while the strategy
// was "different" — that is what makes removing the manifest key a real
// switch for layouts saved under isolation.

export type ViewProcessAffinityStrategy = 'same' | 'different';

export interface ViewProcessAffinityPolicy {
  /** Manifest `platform.viewProcessAffinityStrategy`; undefined = not set. */
  strategy?: ViewProcessAffinityStrategy;
  /** Shared per-app group for legacy cleanup when no strategy is set. */
  sharedAffinity?: string;
}

/** Apply the policy to one view/window options object. Mutates and returns `opts`. */
export function applyViewProcessAffinityPolicy<T extends AffinityCarrier>(
  opts: T,
  policy: ViewProcessAffinityPolicy,
): T {
  if (policy.strategy === 'different') {
    delete opts.processAffinity;
    return opts;
  }
  return stripLegacyViewIsolationAffinity(opts, policy.sharedAffinity);
}

/** Layout-tree twin of {@link applyViewProcessAffinityPolicy}. */
export function applyViewProcessAffinityPolicyToLayout(
  layout: unknown,
  policy: ViewProcessAffinityPolicy,
): void {
  if (policy.strategy !== 'different') {
    stripLegacyViewIsolationFromLayout(layout, policy.sharedAffinity);
    return;
  }
  if (!layout || typeof layout !== 'object') return;
  const node = layout as Record<string, unknown>;
  if ('processAffinity' in node) delete node.processAffinity;
  const componentState = node.componentState;
  if (componentState && typeof componentState === 'object') {
    applyViewProcessAffinityPolicyToLayout(componentState, policy);
  }
  const content = node.content;
  if (Array.isArray(content)) {
    for (const child of content) applyViewProcessAffinityPolicyToLayout(child, policy);
  }
}
