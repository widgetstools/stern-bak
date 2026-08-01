import type { ReactNode } from 'react';
import { cn } from '@wellsfargo-starui/react';

/**
 * Canonical "label + control" row used by every editor panel in the
 * Grid Customizer (Grid Options, Column Settings band sub-editors,
 * Filter editor, Row-Grouping editor, …).
 *
 * Layout:
 *
 *   ┌─────────────────┬──────────────────────────────┐
 *   │ LABEL           │  control                     │   row 1 — items-center
 *   │                 │  hint (when present)         │   row 2 — col 2 only
 *   └─────────────────┴──────────────────────────────┘
 *
 * Key alignment guarantees:
 *
 * 1. The label and the control sit in the SAME implicit grid row and
 *    are both `items-center`-aligned, so the label TEXT lines up
 *    vertically with the control TEXT regardless of which control kind
 *    the row is hosting (Switch / IconInput / Select / custom node).
 * 2. The hint (when present) drops onto a second grid row in column 2
 *    only — it never pushes the label off-centre relative to the
 *    control. Rows without a hint stay tight; rows with a hint grow
 *    only by the hint's own line height.
 * 3. The label column is a fixed `160px` so every row across the same
 *    band gets the same label gutter — controls down the right column
 *    are visually aligned to the same x-coordinate.
 *
 * All visual tokens (font size, border, colour) route through
 * `--ds-*` design-system variables via Tailwind utilities so the row
 * renders correctly in both dark and light themes.
 */
export interface SettingsRowProps {
  label: string;
  hint?: string;
  control: ReactNode;
  /** Drop the bottom divider on the final row of a band. */
  noDivider?: boolean;
  /** Extra classes applied to the row's outer grid. */
  className?: string;
  'data-testid'?: string;
}

export function SettingsRow({
  label,
  hint,
  control,
  noDivider,
  className,
  ...rest
}: SettingsRowProps) {
  return (
    <div
      data-testid={rest['data-testid']}
      className={cn(
        'grid grid-cols-[160px_1fr] items-center gap-x-4 py-1.5',
        !noDivider &&
          'border-b border-[color:color-mix(in_srgb,var(--ds-border-primary)_40%,transparent)]',
        className,
      )}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground leading-tight">
        {label}
      </span>
      <div className="flex items-center gap-2 min-w-0">{control}</div>
      {hint && (
        <span className="col-start-2 text-[11px] text-muted-foreground leading-relaxed pt-0.5">
          {hint}
        </span>
      )}
    </div>
  );
}
