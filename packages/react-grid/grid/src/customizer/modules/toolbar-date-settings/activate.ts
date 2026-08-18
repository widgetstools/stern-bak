/**
 * Runtime for the Custom Settings module's row-exclusion rule.
 *
 * This runtime's whole job is to say "the rule may have changed" whenever the
 * answer could differ, and it says it to `platform.data` — NOT to the grid
 * api. That is the difference between the rule working and the rule being
 * inert: under the client-side row model the port re-runs the external filter
 * the transform installed, and under the server-side one it hands the
 * expression to the query plane so exclusion happens before paging and
 * `rowCount` follows. A module that called `api.onFilterChanged()` itself
 * would be doing the first of those and silently nothing for the second, which
 * is exactly the branch-on-row-model the port exists to remove.
 *
 * The moments the answer can change:
 *
 *   - a cell edit (the user types `INR` into the ccy cell → row must vanish),
 *   - an expression edit (Save in the panel → existing rows re-filter),
 *   - first grid-ready (apply a profile-loaded expression to initial rows).
 *
 * Live STOMP ticks arrive as AG-Grid transactions, which already re-filter
 * updated rows client-side, and reach the plane as store ticks that invalidate
 * its memo — so neither model needs a nudge for them.
 *
 * The cell-edit nudge is gated on a non-empty expression so a grid with no
 * rule never pays for a full re-filter on every edit. The other two are not:
 * clearing a rule has to reach the plane, and it is precisely the case where
 * the expression is now empty.
 */

import type { Module, PlatformHandle } from '@wellsfargo-starui/core';
import type { ToolbarDateSettingsState } from './state';

export function activateRowExclusion(
  platform: PlatformHandle<ToolbarDateSettingsState>,
): ReturnType<NonNullable<Module<ToolbarDateSettingsState>['activate']>> {
  const expression = (): string =>
    (platform.getState().rowExclusionExpression ?? '').trim();
  const hasExpression = (): boolean => expression().length > 0;

  const refilter = (): void => {
    // Detached: the port's server-side implementation crosses a worker
    // boundary, and none of the three triggers below has anywhere to await it.
    void platform.data.setRowExclusion(expression() || null).catch(() => {});
  };

  const disposers: Array<() => void> = [
    // Cell edits: re-evaluate so an edited row that now matches disappears
    // (and one that no longer matches reappears).
    platform.api.on('cellValueChanged', () => {
      if (hasExpression()) refilter();
    }),
    // Profile load / mount: apply an already-configured expression once the
    // grid is ready and the first rows are in. Ungated — the plane holds this
    // per session and a fresh session starts with no rule, so a grid whose
    // profile carries none still has to say so rather than leave whatever a
    // previous session on the same id installed.
    platform.api.onReady(() => {
      refilter();
    }),
    // Expression edits (Save in the panel): re-filter the rows already shown.
    platform.subscribe((state, prev) => {
      if (state.rowExclusionExpression !== prev.rowExclusionExpression) refilter();
    }),
  ];

  return () => {
    for (const d of disposers) {
      try { d(); } catch { /* per-disposer isolation */ }
    }
  };
}
