/**
 * Shared primitives for the formatter surfaces.
 *
 * Both `<FormattingToolbar />` (horizontal) and
 * `<FormattingPropertiesPanel />` (vertical) compose modules out of
 * these atoms — the same primitive renders in both contexts and the
 * `.fx-shell--horizontal` / `.fx-shell--vertical` parent class handles
 * the layout switch via the stylesheet. No layout branching in JS.
 */
import * as React from 'react';
import { ArrowLeftRight, X } from 'lucide-react';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip as TooltipRoot,
  TooltipContent,
  TooltipTrigger,
  cn,
  type ButtonProps,
} from '@wellsfargo-starui/react';
import { CHROME_BUTTON_RESET } from '../../customizer/internal.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)

export type Orientation = 'horizontal' | 'vertical';

// ─── Pill — generic toggleable button ─────────────────────────────
//
// `pillClasses(variant)` is exported as a shared Tailwind class chain
// so raw `<button>` consumers (e.g. PopoverTrigger children that need
// their own ref/onMouseDown wiring) can apply the same styling as the
// Pill component without duplicating the class string. Both Pill and
// every raw consumer resolve their visuals through the same chain →
// design-system tokens → `@wellsfargo-starui/design-system`.

/** Radix Select forbids `value=""` — map empty selections through this sentinel. */
export const TOOLBAR_SELECT_EMPTY = '__STARUI_FMT_SELECT_EMPTY__';

export function pillClasses(variant: 'icon' | 'text' | 'narrow' = 'icon'): string {
  // Ghost icon buttons — aligned with `.ds-primary-action`: transparent
  // at rest, soft primary tint on hover/active (no heavy per-button boxes).
  return [
    CHROME_BUTTON_RESET,
    'inline-flex items-center justify-center whitespace-nowrap shrink-0',
    'h-7 rounded-[2px] border border-transparent bg-transparent shadow-none',
    'text-[color:var(--ds-text-secondary)] text-[11px] leading-none gap-1 font-medium cursor-pointer',
    'transition-[color,background,border-color,opacity] duration-150',
    'disabled:opacity-[0.38] disabled:cursor-not-allowed disabled:pointer-events-none',
    variant === 'icon' && 'min-w-7 px-1.5',
    variant === 'text' && 'min-w-[30px] px-2 font-mono text-[10px] tracking-[0.04em]',
    variant === 'narrow' && 'min-w-[18px] px-[3px]',
    'hover:text-[oklch(var(--primary))] hover:bg-[oklch(var(--primary)_/_0.12)] hover:border-[oklch(var(--primary)_/_0.30)]',
    'data-[on=true]:text-[oklch(var(--primary))] data-[on=true]:bg-[oklch(var(--primary)_/_0.18)] data-[on=true]:border-[oklch(var(--primary)_/_0.55)]',
    'data-[on=true]:shadow-[inset_0_0_0_1px_oklch(var(--primary)_/_0.30)]',
    'focus-visible:outline focus-visible:outline-1 focus-visible:outline-primary focus-visible:outline-offset-1 focus-visible:ring-0',
  ].filter(Boolean).join(' ');
}

/** Compact shadcn `<SelectTrigger>` styling for formatter enum pickers. */
export function toolbarSelectTriggerClasses(className?: string): string {
  return cn(
    CHROME_BUTTON_RESET,
    'h-7 min-h-7 w-auto max-w-[220px] gap-1.5 px-2 py-0',
    'text-[11px] font-medium leading-none shadow-none',
    'rounded-[2px] border border-border/55 bg-transparent',
    'text-foreground hover:bg-accent/45 hover:border-border',
    'focus:ring-1 focus:ring-ring [&>span]:line-clamp-1',
    '[&_svg]:shrink-0 [&_svg]:opacity-55',
    className,
  );
}

export function toolbarSelectContentClasses(className?: string): string {
  return cn('text-[11px] min-w-[var(--radix-select-trigger-width)]', className);
}

/** Column caption chip — readout + inline rename field in the scope strip. */
export function columnCaptionChipClasses(editable = false): string {
  return cn(
    'fx-col inline-flex h-7 min-h-7 max-w-[180px] items-center gap-1.5 px-2',
    'font-mono text-[11px] font-normal leading-none tracking-[0.02em]',
    'text-[color:var(--ds-text-secondary)]',
    editable && 'fx-col--editable cursor-text',
  );
}

export function columnCaptionInputClasses(className?: string): string {
  return cn(
    'h-7 min-h-7 min-w-[140px] max-w-[180px] rounded-[2px] border border-border/55 bg-transparent',
    'px-2 py-0 font-mono text-[11px] font-normal leading-none tracking-[0.02em]',
    'text-foreground shadow-none placeholder:text-[color:var(--ds-text-muted)]',
    'focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-primary/30',
    className,
  );
}

export function columnCaptionTriggerClasses(className?: string): string {
  return cn(
    CHROME_BUTTON_RESET,
    columnCaptionChipClasses(true),
    'hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50',
    className,
  );
}

export interface ToolbarSelectOption {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
}

export function ToolbarSelect({
  value,
  onValueChange,
  options,
  disabled,
  icon,
  iconClassName,
  placeholder = '—',
  tooltip,
  hideValueWhenEmpty,
  'aria-label': ariaLabel,
  'data-testid': dataTestId,
  className,
}: {
  value: string | undefined;
  onValueChange: (next: string | undefined) => void;
  options: ToolbarSelectOption[];
  disabled?: boolean;
  icon?: React.ReactNode;
  /** Classes for the icon wrapper. Defaults to `opacity-75` (the quiet
   *  tier). Pass `opacity-100` + a colour to make the icon a prominent
   *  affordance — e.g. the currency `$` / tick `1/32` selectors. */
  iconClassName?: string;
  placeholder?: string;
  tooltip?: string;
  /** Slim trigger: while nothing is selected, show only the icon +
   *  chevron (no "None"/placeholder text). The dropdown list still
   *  carries the explicit "None" option. Keeps wide single-row
   *  toolbars fitting; the value text returns once a pick is made. */
  hideValueWhenEmpty?: boolean;
  'aria-label'?: string;
  'data-testid'?: string;
  className?: string;
}) {
  const isEmpty = value == null || value === '';
  const encoded = isEmpty ? TOOLBAR_SELECT_EMPTY : value;

  const trigger = (
    <SelectTrigger
      className={toolbarSelectTriggerClasses(className)}
      aria-label={ariaLabel}
      title={tooltip}
      data-testid={dataTestId}
    >
      {icon ? <span className={cn('inline-flex shrink-0', iconClassName ?? 'opacity-75')}>{icon}</span> : null}
      {hideValueWhenEmpty && isEmpty ? null : <SelectValue placeholder={placeholder} />}
    </SelectTrigger>
  );

  return (
    <Select
      value={encoded}
      onValueChange={(next) => onValueChange(next === TOOLBAR_SELECT_EMPTY ? undefined : next)}
      disabled={disabled}
    >
      {trigger}
      <SelectContent position="popper" className={toolbarSelectContentClasses()}>
        {options.map((opt) => (
          <SelectItem
            key={opt.value === '' ? TOOLBAR_SELECT_EMPTY : opt.value}
            value={opt.value === '' ? TOOLBAR_SELECT_EMPTY : opt.value}
            disabled={opt.disabled}
            className="py-1.5 pl-7 pr-2 text-[11px]"
          >
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export interface PillProps {
  active?: boolean;
  disabled?: boolean;
  tooltip?: string;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
  variant?: 'icon' | 'text' | 'narrow';
  'data-testid'?: string;
  'aria-label'?: string;
}

export function Pill({
  active,
  disabled,
  tooltip,
  onClick,
  className,
  children,
  variant = 'icon',
  ...rest
}: PillProps) {
  // Toolbar pill — shadcn `<Button variant="ghost" size="sm">` styled
  // entirely via Tailwind utilities that resolve through the
  // `@wellsfargo-starui/design-system` token tree (no `.fx-*` CSS dependency).
  //   • size="sm" → `h-[28px]` (matches the formatter's pill rhythm)
  //   • `border-input` → `--ds-border-secondary` (the "prominent" tier)
  //   • `bg-primary` / `text-primary-foreground` on `data-on="true"`
  //   • `hover:border-foreground/60` strengthens the rest border
  //
  // No tailwind/formatter.css cascade fight (the previous wrapper hit
  // `--fx-pill-h` via formatter.css but `h-auto` from Tailwind utility
  // layer shadowed it; outcome was 15px-tall pills).
  const btn = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={disabled}
      data-testid={rest['data-testid']}
      aria-label={rest['aria-label'] ?? tooltip}
      aria-pressed={typeof active === 'boolean' ? active : undefined}
      data-on={active ? 'true' : undefined}
      className={cn(pillClasses(variant), className)}
      onMouseDown={(e) => {
        // Mousedown-driven so popovers / focus traps don't eat the click.
        e.preventDefault();
        e.stopPropagation();
        if (!disabled && onClick) onClick();
      }}
    >
      {children}
    </Button>
  );
  if (!tooltip) return btn;
  return (
    <TooltipRoot>
      <TooltipTrigger asChild>{btn}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs px-1.5 py-0.5 text-[10px]">
        {tooltip}
      </TooltipContent>
    </TooltipRoot>
  );
}

/** shadcn `Button` pre-styled as a formatter toolbar pill (for Radix triggers). */
export const PillButton = React.forwardRef<
  HTMLButtonElement,
  ButtonProps & { pillVariant?: 'icon' | 'text' | 'narrow' }
>(function PillButton({ className, pillVariant = 'icon', variant = 'ghost', size = 'sm', ...rest }, ref) {
  return (
    <Button
      ref={ref}
      type="button"
      variant={variant}
      size={size}
      className={cn(pillClasses(pillVariant), className)}
      {...rest}
    />
  );
});

// ─── SplitPill — primary action + chevron menu trigger ────────────
//
// Loose sibling layout — each child keeps its own pill border instead
// of merging into a single attached strip (no enclosing box).

export function SplitPill({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('inline-flex items-center gap-1.5', className)}>
      {children}
    </div>
  );
}

// ─── Hairline divider between sub-groups inside a module ──────────

export function Hair() {
  return <span aria-hidden className="fx-hair" />;
}

// ─── Module — eyebrow + body. One component, two layouts. ─────────

export interface ModuleProps {
  /** Two-digit index — `'01'` … `'05'`. */
  index: string;
  /** Display label, ALL-CAPS. */
  label: string;
  /** Module body. */
  children: React.ReactNode;
  /** Optional class hook. */
  className?: string;
  /** Optional data-testid for the module wrapper. */
  testId?: string;
}

export function Module({ index, label, children, className, testId }: ModuleProps) {
  return (
    <div className={cn('fx-module', className)} data-module-index={index} data-testid={testId}>
      <span className="fx-eyebrow">
        <span className="fx-eyebrow__num">{index}</span>
        <span className="fx-eyebrow__sep">·</span>
        <span className="fx-eyebrow__lbl">{label}</span>
      </span>
      <div className="fx-module__body">{children}</div>
    </div>
  );
}

// ToolbarGroup / ModuleDivider (the Excel-ribbon captioned clusters)
// were deleted with the single-row toolbar redesign — segments are
// arranged directly by `FormatterToolbar` with overflow handling in
// ./toolbarOverflow.

// ─── PanelGroup — labeled section card in the vertical popout ─────

export function PanelGroup({
  label,
  children,
  variant = 'default',
  testId,
  className,
  sectionIndex,
}: {
  label: string;
  children: React.ReactNode;
  variant?: 'default' | 'destruct';
  testId?: string;
  className?: string;
  /** Legacy hook for e2e — mirrors the old module section indices. */
  sectionIndex?: string;
}) {
  return (
    <section
      className={cn(
        'fx-panel-group',
        variant === 'destruct' && 'fx-panel-group--destruct',
        className,
      )}
      data-testid={testId}
      data-section-index={sectionIndex}
      aria-label={label}
    >
      <h3 className="fx-panel-group__label">{label}</h3>
      <div className="fx-panel-group__body">{children}</div>
    </section>
  );
}

// ─── Column label readout — sunken chip with live dot ────────────

export function ColumnLabel({
  colLabel,
  disabled,
  testId,
}: {
  colLabel: string;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <span
      className={columnCaptionChipClasses()}
      data-disabled={disabled ? 'true' : undefined}
      data-testid={testId}
    >
      <span className="fx-col__dot" aria-hidden />
      <span className="fx-col__name">{colLabel}</span>
    </span>
  );
}

// ─── Scope toggle — CELL ⇄ HEADER (legacy single-label form) ──────
//
// Kept for the vertical popped panel and any consumer still using the
// arrow-swap presentation. Horizontal toolbar uses `SegmentedToggle`
// below for a clearer dual-label look.

export function ScopeToggle({
  target,
  onToggle,
  testId,
}: {
  target: 'cell' | 'header';
  onToggle: () => void;
  testId?: string;
}) {
  return (
    <Button
      type="button"
      role="switch"
      aria-checked={target === 'header'}
      aria-label={`Edit ${target === 'cell' ? 'cell' : 'header'} (click to switch)`}
      data-testid={testId}
      data-target={target}
      variant="ghost"
      className={cn('fx-scope h-auto min-h-0 p-0 shadow-none hover:bg-transparent focus-visible:ring-0')}
      onClick={onToggle}
      onMouseDown={(e) => e.preventDefault()}
      title={`Click to edit ${target === 'cell' ? 'header' : 'cell'}`}
    >
      <span>{target.toUpperCase()}</span>
      <ArrowLeftRight size={9} strokeWidth={2} className="fx-scope__swap" aria-hidden />
    </Button>
  );
}

// ─── SegmentedToggle — two-icon switch with both options visible ──
//
// Icon-only segmented control. Both options show simultaneously; the
// active option is filled, the inactive option is dim. Each option
// carries its own tooltip so the meaning is one hover away. Used for
// CELLS ⇄ HEADERS and SELECTED ⇄ ALL — same shape, different icons.
// Stays compact (≈64px wide) so it doesn't dominate the toolbar.

export interface SegmentedToggleOption<T extends string> {
  value: T;
  /** Pre-rendered icon node — use a lucide icon at `size={14}`. */
  icon: React.ReactNode;
  /** Hover tooltip — describes what the option means. */
  tooltip: string;
  /** Optional ARIA label override; defaults to the tooltip. */
  ariaLabel?: string;
  testId?: string;
}

export function SegmentedToggle<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  variant,
  testId,
}: {
  value: T;
  options: [SegmentedToggleOption<T>, SegmentedToggleOption<T>];
  onChange: (next: T) => void;
  ariaLabel: string;
  /** Cosmetic — drives the data-attribute used by CSS for distinct
   *  hue/weight (still uses the brand primary as the active fill). */
  variant?: 'target' | 'scope';
  testId?: string;
}) {
  // Implementation note — the toolbar tests assert that the active
  // state flips on `fireEvent.mouseDown`, and consumers depend on the
  // mousedown-driven UX to survive popover focus traps (a popover's
  // focus trap can swallow click events but not mousedown). That
  // contract is incompatible with radix ToggleGroup's click-driven
  // `onValueChange`, so this primitive stays a hand-rolled radiogroup
  // of `<button role="radio">` elements. Every visual property flows
  // through `@wellsfargo-starui/design-system` tokens via Tailwind utilities.
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      data-variant={variant}
      data-testid={testId}
      className="inline-flex items-center gap-1.5 shrink-0"
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        const btn = (
          <Button
            key={opt.value}
            type="button"
            role="radio"
            variant="ghost"
            aria-checked={isActive}
            aria-label={opt.ariaLabel ?? opt.tooltip}
            data-active={isActive ? 'true' : undefined}
            data-on={isActive ? 'true' : undefined}
            data-testid={opt.testId}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!isActive) onChange(opt.value);
            }}
            className={pillClasses('icon')}
          >
            {opt.icon}
          </Button>
        );
        return (
          <TooltipRoot key={opt.value}>
            <TooltipTrigger asChild>{btn}</TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs px-1.5 py-0.5 text-[10px]">
              {opt.tooltip}
            </TooltipContent>
          </TooltipRoot>
        );
      })}
    </div>
  );
}

// ─── Preview readout — phosphor amber, monospace ─────────────────

export function PreviewReadout({
  value,
  testId,
}: {
  value: string;
  testId?: string;
}) {
  return (
    <TooltipRoot>
      <TooltipTrigger asChild>
        <span className="fx-preview" data-testid={testId}>
          <span className="fx-preview__lbl">Preview</span>
          <span className="fx-preview__val">{value || '—'}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs px-1.5 py-0.5 text-[10px]">
        Live preview — current format against a sample value
      </TooltipContent>
    </TooltipRoot>
  );
}

// ─── Title bar — only renders inside the popped panel under
//     OpenFin's frameless mode. ────────────────────────────────────

export function TitleBar({
  text,
  onClose,
  testId,
}: {
  text: string;
  onClose: () => void;
  testId?: string;
}) {
  return (
    <div className="fx-titlebar" data-testid={testId}>
      <span>{text}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="fx-titlebar__close h-auto min-h-0 w-auto p-0 shadow-none hover:bg-transparent focus-visible:ring-0"
        onClick={onClose}
        aria-label="Close"
        data-testid="fmt-panel-close"
        title="Close"
      >
        <X size={14} strokeWidth={2} />
      </Button>
    </div>
  );
}

// Menu / MenuItem / MenuSep primitives removed in PR #47.
// Consumers migrated to shadcn `<DropdownMenu>` / `<DropdownMenuItem>` /
// `<DropdownMenuSeparator>` from `@wellsfargo-starui/react`. The custom primitives
// duplicated radix DropdownMenu's surface + row + separator with no
// behavioural win — radix gives us keyboard nav, focus management,
// escape handling, and ARIA roles for free.
