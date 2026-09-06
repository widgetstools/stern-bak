/**
 * Whether this window has nothing to render.
 *
 * A window has something to show when it was opened from an analysis result (a
 * HANDOFF) or when it is a SAVED DASHBOARD. Testing only for the handoff meant
 * every dashboard opened from the dock fell into "nothing to show" no matter
 * that its spec and rows had both loaded — and regenerating it through the chat
 * appeared to fix it, because a fresh report arrives with a handoff.
 *
 * Exported so the condition itself is testable: rendering the whole window
 * drags in the grid customizer barrel and a second React, and the bug was never
 * in the rendering — it was here.
 */
export function hasNothingToShow(opts: {
  handoffId?: string;
  dashboardId?: string;
  spec: unknown;
  error?: string;
}): boolean {
  const addressed = Boolean(opts.handoffId) || Boolean(opts.dashboardId);
  if (!addressed) return true;
  // Addressed but still resolving: no spec yet and nothing has failed.
  return !opts.spec && !opts.error;
}

