/**
 * ⊘ DESTRUCT — clear all column-customization styles in this profile.
 *
 * Always last in the module sequence. The actual confirm AlertDialog
 * is mounted once at the orchestrator level so both surfaces share a
 * single dialog instance — this module just renders the trigger.
 *
 * Renders as an icon-only pill in horizontal mode (saves space) and
 * as a full destructive button in vertical mode (matches the panel's
 * footer affordance).
 */
import { Check, Eraser, Trash2 } from 'lucide-react';
import { Tooltip } from '../../../customizer/internal.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import { Button, cn } from '@wellsfargo-starui/react';
import type { Orientation } from '../primitives';
import type { FormatterActions, FormatterState } from '../state';

// Shared destructive-pill styling. shadcn `<Button variant="outline">`
// gives us the focus ring + a11y baseline; the className supplies the
// destructive-tinted border/text and primary-tinted "confirmed" state.
// Every colour resolves through `@wellsfargo-starui/design-system` tokens — no
// `.fx-destruct` CSS class needed.
const destructPillClass = cn(
  // Horizontal-mode default: 28×28 icon button (matches Pill rhythm).
  // Vertical orientation flips to full-width via the `vertical` class
  // appended at the call site.
  'h-7 w-7 p-0 justify-center gap-0',
  'rounded-[3px] border bg-transparent shadow-none',
  // Rest state — quiet destructive outline.
  'border-destructive/35 text-destructive',
  // Hover — strengthen destructive tone with a tinted fill.
  'hover:bg-destructive/10 hover:border-destructive hover:text-destructive',
  // Disabled — soften.
  'disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:border-destructive/35',
  // Confirmed (one click before destructive fires) — flip to brand
  // primary so the user sees the click registered, second click
  // commits.
  'data-[confirmed=true]:bg-primary/10 data-[confirmed=true]:border-primary/35 data-[confirmed=true]:text-primary',
);

// Vertical mode override — full-width pill with text label, taller.
const destructPillVerticalClass = cn(
  'h-[30px] w-auto px-3 gap-2 justify-start',
  'text-[10px] font-semibold uppercase tracking-[0.12em]',
);

export function ModuleClear({
  state,
  actions,
  orientation,
}: {
  state: FormatterState;
  actions: FormatterActions;
  orientation: Orientation;
}) {
  const selectedTitle = state.disabled
    ? 'Select a cell or column to clear its styles'
    : state.colIds.length === 1
      ? `Clear styling, value formatter, borders, filter, and template references for "${state.colLabel}"`
      : `Clear styling, value formatter, borders, filter, and template references for ${state.colIds.length} selected columns`;

  const isVertical = orientation === 'vertical';

  const SelBtn = (
    <Button
      type="button"
      variant="outline"
      onClick={actions.confirmClearSelected}
      disabled={state.disabled}
      data-testid={orientation === 'horizontal' ? 'formatting-clear-selected' : 'fmt-panel-clear-selected'}
      data-confirmed={state.clearSelectedConfirmed ? 'true' : undefined}
      title={selectedTitle}
      aria-label="Clear styles for selected column(s)"
      className={cn(destructPillClass, isVertical && destructPillVerticalClass)}
    >
      {state.clearSelectedConfirmed
        ? <Check size={13} strokeWidth={2.5} />
        : <Eraser size={13} strokeWidth={1.75} />}
      {isVertical && <span>Clear selected</span>}
    </Button>
  );

  const AllBtn = (
    <Button
      type="button"
      variant="outline"
      onClick={actions.confirmClearAll}
      data-testid={orientation === 'horizontal' ? 'formatting-clear-all' : 'fmt-panel-clear-all'}
      data-confirmed={state.clearConfirmed ? 'true' : undefined}
      title="Clear every column's styling, value formatter, borders, filter config, and template references from this layout"
      aria-label="Clear all styles in this layout"
      className={cn(destructPillClass, isVertical && destructPillVerticalClass)}
    >
      {state.clearConfirmed
        ? <Check size={13} strokeWidth={2.5} />
        : <Trash2 size={13} strokeWidth={1.75} />}
      {isVertical && <span>Clear all styles</span>}
    </Button>
  );

  if (orientation === 'horizontal') {
    return (
      <>
        <Tooltip content={selectedTitle}>{SelBtn}</Tooltip>
        <Tooltip content="Clear all styles in this layout">{AllBtn}</Tooltip>
      </>
    );
  }
  return (
    <>
      {SelBtn}
      {AllBtn}
    </>
  );
}
