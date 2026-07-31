/**
 * AutoFormatButton — a one-click "Auto Format" action in the primary
 * toolbar. It reads every column from the live grid, matches each field
 * name against the FI/equity field-format catalog (see
 * `@wellsfargo-starui/engine` → `buildAutoFormatPlan`), and applies the resolved
 * NATIVE formatting in ONE profile-persisted state update: number/date
 * value formatters, sign-coloured P&L/change via `excelFormat` colour tags,
 * right-alignment for numerics, localised dates, centred categoricals, and
 * bold tickers. No opaque cell renderers — so every auto-applied aspect
 * stays editable from the formatter toolbar and saves to the active profile.
 *
 * Self-contained like {@link QuickSearch}: it reaches the live `GridApi`
 * and the module store through the platform context rather than props, so
 * the view-only `PrimaryToolbar` stays free of grid wiring. It uses the
 * *optional* platform accessor so it renders a harmless no-op when mounted
 * outside a `<GridProvider>` (e.g. characterisation tests) instead of
 * throwing.
 *
 * Overwrite mode: Auto Format re-applies the catalog to every matched
 * column (replacing prior formatting and clearing any prior renderer). The
 * user can then override any aspect afterward in the formatter toolbar —
 * those manual edits persist until Auto Format is clicked again. The reducer
 * still supports a non-destructive (`onlyUnstyled`) mode for other callers.
 */
import { Check, Wand2 } from 'lucide-react';
import { Button } from '@wellsfargo-starui/ui';
import { useAutoFormatAction } from './useAutoFormatAction';

export function AutoFormatButton() {
  const { run, confirmed } = useAutoFormatAction();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="ds-primary-action"
      onClick={run}
      title="Auto-format all columns from the field catalog"
      data-testid="auto-format-btn"
      data-state={confirmed ? 'saved' : 'idle'}
      aria-label="Auto-format all columns"
    >
      {confirmed ? <Check size={14} strokeWidth={2.5} /> : <Wand2 size={14} strokeWidth={2} />}
    </Button>
  );
}
