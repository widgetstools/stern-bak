import type { ReactNode } from 'react';
import { cn } from '@wellsfargo-starui/ui';

/**
 * Compact "summary chip" used in the sticky info strip at the top of
 * editor panels (Grid Options, Column Settings, …).
 *
 * Anatomy:
 *
 *   ┌──────────────────────────┐
 *   │ [icon]  LABEL    value   │
 *   └──────────────────────────┘
 *
 * Renders against the design-system `--ds-*` token surfaces so dark and
 * light themes resolve from the same JSX. The `tone` knob picks one of
 * the four semantic overlay swatches:
 *
 *   - neutral   muted grey ground (default — no state)
 *   - primary   brand soft (user-driven affordance: search, navigation)
 *   - info      cyan soft (informational: filter set, type present)
 *   - warning   amber soft (attention: dirty, overrides > 0)
 *   - positive  teal soft (success/confirmed: templates applied)
 *
 * Width is intrinsic — chips lay out left-to-right and wrap onto a new
 * row if the strip is narrower than the chip set's natural width.
 */

export type SummaryChipTone =
  | 'neutral'
  | 'primary'
  | 'info'
  | 'warning'
  | 'positive';

const TONE_CLASSES: Record<SummaryChipTone, string> = {
  neutral:
    'bg-muted/40 text-muted-foreground border-[color:var(--ds-border-primary)]',
  primary:
    'bg-[color:var(--ds-primary-soft)] text-[color:var(--ds-primary)] border-[color:var(--ds-primary-ring)]',
  info: 'bg-[var(--ds-overlay-info-soft)] text-[color:var(--ds-accent-info)] border-[color:var(--ds-overlay-info-ring)]',
  warning:
    'bg-[var(--ds-overlay-warning-soft)] text-[color:var(--ds-accent-warning)] border-[color:var(--ds-overlay-warning-ring)]',
  positive:
    'bg-[var(--ds-overlay-positive-soft)] text-[color:var(--ds-accent-positive)] border-[color:var(--ds-overlay-positive-ring)]',
};

export interface SummaryChipProps {
  /** Lucide / SVG icon (sized ~11px) rendered before the label. */
  icon?: ReactNode;
  /** Tracked-out uppercase label. Pass already-uppercased text so the
   *  underlying textContent matches what the eye sees — Playwright's
   *  `toContainText` is happier that way. */
  label: string;
  /** Mono-weight value to the right of the label. */
  value?: ReactNode;
  /** Semantic colour treatment. Defaults to `neutral`. */
  tone?: SummaryChipTone;
  /** Native `title` tooltip — surface the full hint here. */
  title?: string;
  /** Optional extra classes for the chip wrapper. */
  className?: string;
  /** Optional extra classes for the value slot. */
  valueClassName?: string;
  'data-testid'?: string;
}

export function SummaryChip({
  icon,
  label,
  value,
  tone = 'neutral',
  title,
  className,
  valueClassName,
  ...rest
}: SummaryChipProps) {
  return (
    <div
      title={title}
      data-testid={rest['data-testid']}
      className={cn(
        'inline-flex items-center gap-1.5 h-6 px-2 rounded-sm border',
        TONE_CLASSES[tone],
        className,
      )}
    >
      {icon && (
        <span className="inline-flex items-center shrink-0 opacity-100">
          {icon}
        </span>
      )}
      <span className="text-[9px] font-semibold uppercase tracking-[0.12em] opacity-70 leading-none">
        {label}
      </span>
      {value !== undefined && value !== null && value !== '' && (
        <span className={cn('font-mono tabular-nums text-[11px] leading-none', valueClassName)}>
          {value}
        </span>
      )}
    </div>
  );
}
