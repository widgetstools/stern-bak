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
 * It also DECLARES the columns the expression reads on the platform's
 * external-filter registry (refactor plan B2): AG Grid cannot tell which
 * columns `doesExternalFilterPass` looks at, so without the declaration the
 * rendered-row apply path has to send every updated row through a
 * transaction while the exclusion is active; with it, only rows whose
 * declared columns changed ride one — and those re-filter, so a row whose
 * `ccy` ticks to `INR` still vanishes. An empty expression withdraws the
 * declaration; one that does not parse excludes nothing (fails open) and
 * so depends on no column.
 *
 * Each nudge is gated on a non-empty expression so a grid with no exclusion
 * rule never pays for a full `onFilterChanged()` on every cell edit.
 */

import { collectColumnRefs, type ExpressionNode, type Module, type PlatformHandle } from '@wellsfargo-starui/core';
import { TOOLBAR_DATE_SETTINGS_MODULE_ID, type ToolbarDateSettingsState } from './state';

/** Columns a row-exclusion expression reads; `[]` when it cannot be parsed (it then excludes nothing). */
export function rowExclusionColumns(
  parse: (source: string) => unknown,
  expression: string,
): string[] {
  try {
    return collectColumnRefs(parse(expression) as ExpressionNode);
  } catch {
    return [];
  }
}

export function activateRowExclusion(
  platform: PlatformHandle<ToolbarDateSettingsState>,
): ReturnType<NonNullable<Module<ToolbarDateSettingsState>['activate']>> {
  const expression = (): string => (platform.getState().rowExclusionExpression ?? '').trim();
  const hasExpression = (): boolean => expression().length > 0;

  const refilter = (): void => {
    platform.api.use((api) => api.onFilterChanged(), undefined);
  };

  const declare = (): void => {
    const expr = expression();
    platform.externalFilters.declare(
      TOOLBAR_DATE_SETTINGS_MODULE_ID,
      expr ? rowExclusionColumns((s) => platform.resources.expression().parse(s), expr) : null,
    );
  };

  declare();
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
    // Expression edits (Save in the panel): re-declare, then re-filter the rows already shown.
    platform.subscribe((state, prev) => {
      if (state.rowExclusionExpression !== prev.rowExclusionExpression) {
        declare();
        refilter();
      }
    }),
    () => platform.externalFilters.declare(TOOLBAR_DATE_SETTINGS_MODULE_ID, null),
  ];

  return () => {
    for (const d of disposers) {
      try { d(); } catch { /* per-disposer isolation */ }
    }
  };
}
