import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Button, cn } from '@wellsfargo-starui/react';
import { CHROME_BUTTON_RESET } from '../../customizer/index.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import {
  pillClasses,
  toolbarSelectContentClasses,
  toolbarSelectTriggerClasses,
} from '../formatter/primitives';
import './editingToolbar.css';

/** Popover / select panel class — compact typography matching the toolbar row. */
export const EDITING_TOOLBAR_POPOVER = 'ex-editing-toolbar-popover';

export type EditingToolbarSegmentProps = {
  layout?: 'segment' | 'standalone';
};

export function EditingToolbarSegment({
  label,
  children,
  meta,
  layout = 'segment',
  'data-testid': testId,
}: {
  label: string;
  children: ReactNode;
  meta?: ReactNode;
  layout?: 'segment' | 'standalone';
  'data-testid'?: string;
}) {
  const group = (
    <div className="ex-toolbar-group" data-testid={testId}>
      <span className="ex-toolbar-group__label">{label}</span>
      <div className="ex-toolbar-group__body">{children}</div>
      {meta ? (
        <>
          <span className="ex-toolbar-group__meta-sep" aria-hidden />
          <span className="ex-toolbar-meta">{meta}</span>
        </>
      ) : null}
    </div>
  );

  if (layout === 'standalone') {
    return <div className="ex-shell ex-shell--horizontal">{group}</div>;
  }
  return group;
}

export type EditingToolbarApplyButtonProps = ComponentProps<typeof Button> & {
  'data-testid'?: string;
};

/** Icon-only apply control (check mark) for editing toolbar segments. */
export function EditingToolbarApplyButton({
  className,
  disabled,
  ...props
}: EditingToolbarApplyButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={disabled}
      aria-label="Apply"
      title="Apply"
      className={cn(
        pillClasses('icon'),
        'text-[color:var(--ds-accent-positive)]',
        'hover:text-[color:var(--ds-accent-positive)]',
        'hover:bg-[color-mix(in_srgb,var(--ds-accent-positive)_12%,transparent)]',
        'hover:border-[color-mix(in_srgb,var(--ds-accent-positive)_35%,transparent)]',
        className,
      )}
      {...props}
    >
      <Check size={14} strokeWidth={2.5} aria-hidden />
    </Button>
  );
}

export type EditingToolbarIconButtonProps = ComponentProps<typeof Button> & {
  'aria-label': string;
  title?: string;
};

/** Compact square icon button aligned to toolbar pill height (28px). */
export function EditingToolbarIconButton({
  className,
  children,
  title,
  ...props
}: EditingToolbarIconButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      title={title ?? props['aria-label']}
      className={cn(pillClasses('icon'), className)}
      {...props}
    >
      {children}
    </Button>
  );
}

export function EditingToolbarOpGroup({ children }: { children: ReactNode }) {
  return (
    <div className="ex-op-group" role="group">
      {children}
    </div>
  );
}

export type EditingToolbarOpButtonProps = ComponentProps<typeof Button> & {
  'data-testid'?: string;
  /** `symbol` = ×÷+− ; `label` = Set… */
  opVariant?: 'symbol' | 'label';
};

/** Ghost pill for × ÷ + − — sized independently of formatter pills. */
function editingToolbarOpSymbolClasses(className?: string): string {
  return cn(
    CHROME_BUTTON_RESET,
    'ex-op-btn ex-op-btn--symbol inline-flex items-center justify-center shrink-0',
    'rounded-[2px] border border-transparent bg-transparent shadow-none cursor-pointer',
    'transition-[color,background,border-color,opacity] duration-150',
    'hover:text-primary hover:bg-primary/10 hover:border-primary/25',
    'disabled:opacity-[0.38] disabled:cursor-not-allowed disabled:pointer-events-none',
    'focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary focus-visible:outline-offset-1 focus-visible:ring-0',
    className,
  );
}

/** Operation pill inside a loose button cluster (× ÷ + −, Set…). */
export function EditingToolbarOpButton({
  className,
  disabled,
  children,
  opVariant = 'symbol',
  ...props
}: EditingToolbarOpButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={disabled}
      className={cn(
        opVariant === 'symbol'
          ? editingToolbarOpSymbolClasses()
          : cn(pillClasses('text'), 'ex-op-btn ex-op-btn--label'),
        className,
      )}
      {...props}
    >
      {children}
    </Button>
  );
}

/** Column count for compact numeric / text fields (~5 digits max). */
export function editingToolbarInputColumns(
  value: string,
  { min = 4, max = 8 }: { min?: number; max?: number } = {},
): number {
  const len = value.length || 1;
  return Math.max(min, Math.min(max, len));
}

/** Width token for `.ex-field-numeric` / `.ex-field-grow` (overrides shadcn `w-full`). */
export function editingToolbarFieldWidthStyle(columns: number): CSSProperties {
  return { '--ex-field-cols': columns } as CSSProperties;
}

/** Shared compact input styling — explicit field border, fixed content width. */
export function editingToolbarInputClasses(className?: string): string {
  return cn(
    'ex-field !w-auto max-w-none shrink-0 flex-none h-8 min-h-8 rounded-[2px] border bg-transparent',
    'px-1.5 py-0 font-mono text-[11px] font-normal leading-none tracking-[0.02em]',
    'text-foreground shadow-none placeholder:text-[color:var(--ds-text-muted)]',
    'focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/30',
    className,
  );
}

export function editingToolbarNumericInputClasses(className?: string): string {
  return editingToolbarInputClasses(cn('ex-field-numeric text-right tabular-nums', className));
}

/** Shared compact select trigger styling. */
export function editingToolbarSelectTriggerClasses(className?: string): string {
  return cn(
    toolbarSelectTriggerClasses('ex-field ex-field-select h-control-sm min-h-control-sm'),
    '!w-auto max-w-none shrink-0 flex-none',
    'border-[color:var(--ex-field-border)] bg-[color:var(--ex-field-bg)]',
    '[&>span]:truncate',
    className,
  );
}

export function editingToolbarSelectContentClasses(className?: string): string {
  return toolbarSelectContentClasses(className);
}

/** @deprecated Use `editingToolbarInputClasses()` — kept for call-site brevity. */
export const EDITING_TOOLBAR_CONTROL = editingToolbarInputClasses();
