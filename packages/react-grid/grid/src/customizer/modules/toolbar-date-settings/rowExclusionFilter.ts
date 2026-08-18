/**
 * rowExclusionFilter — install the "Custom Settings" row-exclusion rule as
 * AG-Grid's external-filter callbacks, which is how the CLIENT-SIDE row model
 * applies it.
 *
 * The rule's MEANING is not here. `evaluateRowExclusion` lives in
 * `@wellsfargo-starui/core` because the server-side query plane applies the
 * same rule inside the worker, before paging, and the two must not be able to
 * disagree about what an expression means. What stays here is the client-side
 * installation: `isExternalFilterPresent()` gates whether the filter runs,
 * `doesExternalFilterPass(node)` returns true to KEEP a row, and a
 * re-evaluation is triggered by `api.onFilterChanged()` — which the module
 * reaches through `platform.data.setRowExclusion`, never by branching on the
 * row model.
 *
 * The row is never removed from `rowData` — AG-Grid's external filter only
 * hides it — so it reappears the moment the offending value changes back.
 *
 * Both callbacks read the LIVE expression through `ctx.getModuleState` at call
 * time (not a captured snapshot), so once installed they always reflect the
 * latest edit without needing the host to re-install them.
 */

import type { GridOptions, IRowNode } from 'ag-grid-community';
import type { TransformContext } from '@wellsfargo-starui/core';
import { evaluateRowExclusion } from '@wellsfargo-starui/core';
import {
  INITIAL_TOOLBAR_DATE_SETTINGS,
  TOOLBAR_DATE_SETTINGS_MODULE_ID,
  type ToolbarDateSettingsState,
} from './state';

/** Read the live (uncommitted-edits-excluded) exclusion expression. */
function liveExpression(ctx: TransformContext): string {
  const state = ctx.getModuleState<ToolbarDateSettingsState>(TOOLBAR_DATE_SETTINGS_MODULE_ID)
    ?? INITIAL_TOOLBAR_DATE_SETTINGS;
  return (state.rowExclusionExpression ?? '').trim();
}

/**
 * Build the external-filter slice of GridOptions, composing with any
 * external filter another module may have set. Always emitted (even when the
 * expression is empty) so the host's `setGridOption` sync clears a previously
 * installed filter when the expression is removed.
 */
export function buildExternalFilterOptions(
  opts: Partial<GridOptions>,
  ctx: TransformContext,
): Pick<GridOptions, 'isExternalFilterPresent' | 'doesExternalFilterPass'> {
  const engine = ctx.resources.expression();
  const prevPresent = opts.isExternalFilterPresent;
  const prevPass = opts.doesExternalFilterPass;

  return {
    isExternalFilterPresent: (params) =>
      liveExpression(ctx).length > 0 || (prevPresent?.(params) ?? false),
    doesExternalFilterPass: (node: IRowNode) => {
      // Compose: another module's external filter still gets a say. If it
      // already hides the row, keep it hidden.
      if (prevPass && !prevPass(node)) return false;
      const data = node.data;
      if (!data || typeof data !== 'object') return true;
      return !evaluateRowExclusion(engine, liveExpression(ctx), data as Record<string, unknown>);
    },
  };
}

