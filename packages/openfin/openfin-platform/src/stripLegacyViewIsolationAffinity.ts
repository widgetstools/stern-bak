/**
 * Cleanup for the reverted per-view renderer isolation experiment.
 *
 * While isolation was active, every view creation was stamped with a
 * unique `processAffinity: "view-iso-…"` — and those values were then
 * PERSISTED into saved pages and workspace snapshots. Reverting the
 * stamping alone is not enough: contaminated layouts keep restoring
 * views into solo renderer processes, which Chromium throttles and
 * then freezes once the view is hidden, occluded, or on an inactive
 * tab — the "blotter goes blank until you switch tabs" symptom.
 *
 * These helpers run at restore time (platform `createView` /
 * `createWindow` overrides) and normalize any legacy `view-iso-*`
 * affinity back to the shared per-app group, so every contaminated
 * snapshot self-heals on its next restore. Non-legacy affinities
 * (e.g. an explicit seed value or a deliberate future grouping) are
 * left untouched.
 */

export const LEGACY_VIEW_ISOLATION_AFFINITY_PREFIX = 'view-iso-';

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

function isLegacy(value: unknown): value is string {
  return (
    typeof value === 'string'
    && value.startsWith(LEGACY_VIEW_ISOLATION_AFFINITY_PREFIX)
  );
}

/**
 * Replace a legacy isolation affinity on one options object with the
 * shared group (or drop it entirely when no shared value is supplied —
 * OpenFin then applies its default same-app grouping). Mutates and
 * returns `opts`.
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
// the strategy governs; without the strategy it is the legacy cleanup above.

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
