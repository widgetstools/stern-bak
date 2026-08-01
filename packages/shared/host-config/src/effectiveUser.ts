// ─── Effective user helper (Decision 5 / Session 8) ──────────────────
//
// The `ApplicationContext` AppData provider carries two identity slots:
//   - `LoggedInUser`     — the real signed-in user. Drives audit fields.
//   - `ImpersonatedUser` — optional override set by an admin / debug UI.
//
// Visibility (Session 4) and owner stamping on `AppConfigRow.userId`
// (Session 3) collapse the two into a single **effective** user via
// `getEffectiveUser(ctx)`: when impersonation is active the effective
// user is the impersonated user; otherwise it falls back to the
// logged-in user.
//
// Audit fields (`createdBy` / `updatedBy`) NEVER use this helper —
// they always reflect the real logged-in user so impersonation can't
// rewrite history.

import type { ApplicationContext } from './types';

/**
 * Resolve the user whose visibility / ownership applies to a given
 * write or read. When `ImpersonatedUser` is set the helper returns it;
 * otherwise it returns `LoggedInUser`.
 *
 * Pure function — no side effects, no DB access. The
 * `ApplicationContext` supplied by callers is the same one
 * `ConfigManager.getApplicationContext()` returns, so hosts can apply
 * the same rule outside the manager (e.g. a "what would alice see?"
 * preview view).
 */
export function getEffectiveUser(
  ctx: ApplicationContext,
): { userId: string; displayName?: string } {
  return ctx.ImpersonatedUser ?? ctx.LoggedInUser;
}
