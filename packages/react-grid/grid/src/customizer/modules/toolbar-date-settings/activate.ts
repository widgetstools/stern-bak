/**
 * Runtime for the Custom Settings module's row-exclusion filter.
 *
 * The external-filter callbacks are installed by `transformGridOptions`
 * (see ./rowExclusionFilter) and read the live expression each evaluation,
 * so all this runtime owes them is a nudge to re-run via
 * `api.onFilterChanged()` whenever the answer could have changed:
 *
 *   - a cell edit (the user types `INR` into the ccy cell → row must vanish),
 *   - an expression edit (Save in the panel → existing rows re-filter),
 *   - first grid-ready (apply a profile-loaded expression to initial rows).
 *
 * Live STOMP ticks arrive as AG-Grid transactions, which already re-filter
 * updated rows, so they need no nudge here.
 *
 * Each nudge is gated on a non-empty expression so a grid with no exclusion
 * rule never pays for a full `onFilterChanged()` on every cell edit.
 */

import type { Module, PlatformHandle } from '@wellsfargo-starui/engine';
import type { ToolbarDateSettingsState } from './state';

export function activateRowExclusion(
  platform: PlatformHandle<ToolbarDateSettingsState>,
): ReturnType<NonNullable<Module<ToolbarDateSettingsState>['activate']>> {
  const hasExpression = (): boolean =>
    (platform.getState().rowExclusionExpression ?? '').trim().length > 0;

  const refilter = (): void => {
    platform.api.use((api) => api.onFilterChanged(), undefined);
  };

  const disposers: Array<() => void> = [
    // Cell edits: re-evaluate so an edited row that now matches disappears
    // (and one that no longer matches reappears).
    platform.api.on('cellValueChanged', () => {
      if (hasExpression()) refilter();
    }),
    // Profile load / mount: apply an already-configured expression once the
    // grid is ready and the first rows are in.
    platform.api.onReady(() => {
      if (hasExpression()) refilter();
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
