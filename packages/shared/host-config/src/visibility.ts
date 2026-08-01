// ─── Visibility predicate (Decision 6 / Session 4) ───────────────────
//
// Every list path in `ConfigManager` runs returned rows through this
// predicate. The rule is intentionally tiny so it can be reasoned about
// without re-reading the manager:
//
//   1. The row must belong to the same app as the caller's context.
//   2. Public rows are visible to every effective user inside that app.
//   3. Private rows are visible only to their owner (`row.userId`).
//
// Rows written before Session 1's schema upgrade have `isPublic` filled
// to `true` by the Dexie migration, so existing data keeps reading
// identically. Until Session 8 lands impersonation, `effectiveUserId`
// is just the manager's `identity.userId`; afterwards it flips to the
// impersonated user when one is set.

import type { AppConfigRow } from "./types";

/**
 * Inputs required to decide whether a row is visible to the current
 * caller. Built once per list call from the manager's `appId` plus the
 * effective user (logged-in user, or — post-Session 8 — the impersonated
 * user when one has been set).
 */
export interface VisibilityContext {
  /** The app this caller is acting under. Rows from other apps are hidden. */
  appId: string;
  /**
   * The user whose visibility we're computing. Equals the real
   * logged-in user under normal operation; equals the impersonated user
   * when impersonation is active (Session 8).
   */
  effectiveUserId: string;
}

/**
 * Returns true when `row` is visible to a caller running with `ctx`.
 *
 * Pure function — no side effects, no DB access. Safe to call from any
 * read path; the manager builds `ctx` once per call and reuses it for
 * every row.
 */
export function isVisible(row: AppConfigRow, ctx: VisibilityContext): boolean {
  if (row.appId !== ctx.appId) return false;
  if (row.isPublic) return true;
  return row.userId === ctx.effectiveUserId;
}
