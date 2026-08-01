/**
 * rowExclusionFilter — compile a "Custom Settings" row-exclusion DSL
 * expression into AG-Grid's external-filter callbacks.
 *
 * Semantics: the expression is an EXCLUDE-when-true predicate. A row whose
 * expression evaluates truthy is hidden (e.g. `[ccy] == "INR"`). The row is
 * never removed from `rowData` — AG-Grid's external filter only hides it — so
 * it reappears the moment the offending value changes back. See AG-Grid's
 * "External Filter" docs: `isExternalFilterPresent()` gates whether the filter
 * runs, `doesExternalFilterPass(node)` returns true to KEEP a row, and a
 * re-evaluation is triggered by `api.onFilterChanged()` (wired in the module's
 * `activate`, on cell edits and expression changes).
 *
 * Fails OPEN: a parse failure or a per-row eval throw excludes nothing, so a
 * bad expression can never make rows silently vanish.
 *
 * Both callbacks read the LIVE expression through `ctx.getModuleState` at call
 * time (not a captured snapshot), so once installed they always reflect the
 * latest edit without needing the host to re-install them — it's enough for
 * `activate` to call `onFilterChanged()`.
 */

import type { GridOptions, IRowNode } from 'ag-grid-community';
import type {
  ExpressionEngineLike,
  ExpressionNode,
  TransformContext,
} from '@wellsfargo-starui/core';
import {
  INITIAL_TOOLBAR_DATE_SETTINGS,
  TOOLBAR_DATE_SETTINGS_MODULE_ID,
  type ToolbarDateSettingsState,
} from './state';

type Compiled = { node: ExpressionNode } | { error: string };

// Module-level parse cache keyed by expression string — dedupes identical
// expressions so the per-row hot path is a pure AST walk (no re-parse).
const parseCache = new Map<string, Compiled>();

function compile(engine: ExpressionEngineLike, expression: string): Compiled {
  let entry = parseCache.get(expression);
  if (entry) return entry;
  try {
    entry = { node: engine.parse(expression) as ExpressionNode };
  } catch (err) {
    entry = { error: err instanceof Error ? err.message : String(err) };
    // One warning per unique bad expression — never per row.
    // eslint-disable-next-line no-console
    console.warn('[toolbar-date-settings] invalid row-exclusion expression:', expression, err);
  }
  parseCache.set(expression, entry);
  return entry;
}

/**
 * Evaluate the row-exclusion predicate against one row's data.
 * Returns true when the row should be EXCLUDED (hidden). Fails open:
 * empty expression, parse error, or eval throw → false (keep the row).
 */
export function evaluateRowExclusion(
  engine: ExpressionEngineLike,
  expression: string,
  data: Record<string, unknown>,
): boolean {
  const expr = expression.trim();
  if (!expr) return false;
  const compiled = compile(engine, expr);
  if (!('node' in compiled)) return false;
  try {
    const result = engine.evaluate(compiled.node, {
      data,
      columns: data,
      value: null,
      x: null,
    });
    return Boolean(result);
  } catch {
    return false;
  }
}

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

/** Test-only: clear the expression parse cache between suites. */
export function __resetRowExclusionCache(): void {
  parseCache.clear();
}
