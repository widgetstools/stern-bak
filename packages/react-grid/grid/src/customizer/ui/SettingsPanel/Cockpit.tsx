import type { CSSProperties, ReactNode } from 'react';
import { controls, typography } from '@wellsfargo-starui/design-system/tokens';
import { Button, Input, cn } from '@wellsfargo-starui/ui';

/**
 * Typography token key — every Caps/Mono `size` prop should reach for one of
 * these instead of a px literal. `'sm'` matches the chrome default and is
 * usually unnecessary (drop the prop entirely).
 */
export type CapsMonoSize = keyof typeof typography.fontSize;

function resolveTypographySize(size: CapsMonoSize | number | undefined): string | number | undefined {
  if (size === undefined) return undefined;
  return typeof size === 'number' ? size : typography.fontSize[size];
}

/**
 * Settings-shell atoms (Tailwind + `--ds-*` tokens; avoid inline font metrics).
 *
 *   - <Caps>   tracked-out small caps (`text-[length:var(--ds-font-size-sm)]` + uppercase).
 *   - <Mono>   mono numeric / identifier.
 *   - <SharpBtn>  sharp-corner rectangular button, uppercase label.
 *   - <TGroup> / <TBtn> / <TDivider>  toolbar primitives.
 *   - <Band>   numbered section header (`01 EXPRESSION ───────`).
 *   - <MetaCell>  cell in the 4-column meta strip.
 *   - <Stepper>  narrow numeric input inside a TGroup.
 *
 * Every visual dimension is sourced from the unified design-system tokens
 * (Tailwind utilities from the shared preset).
 */

/** Body scale for settings chrome — matches `typography.fontSize.sm` / `--ds-font-size-sm`. */
const SETTINGS_UI_TEXT = 'text-[length:var(--ds-font-size-sm)]';

/**
 * Section band titles (`RULE`, `SEVERITY`, `GLOBAL SETTINGS`, …).
 * Do not use Tailwind `text-secondary` — that utility maps to the `--secondary`
 * surface token (~18% lightness in dark), not readable text.
 */
export const SETTINGS_SECTION_TITLE =
  'font-semibold uppercase tracking-widest text-[color:var(--ds-text-secondary)]';

// ─── Typography voices ────────────────────────────────────────────

export interface CapsProps {
  children: ReactNode;
  /**
   * Typography token key (`'2xs'`, `'xs'`, `'sm'`, …) or a px number for
   * the rare bespoke override. Omit to inherit the chrome default
   * (`SETTINGS_UI_TEXT` → `'sm'` / 11px).
   */
  size?: CapsMonoSize | number;
  color?: string;
  letterSpacing?: string;
  style?: CSSProperties;
}

export function Caps({ children, size, color, letterSpacing = '0.1em', style }: CapsProps) {
  const fontSize = resolveTypographySize(size);
  return (
    <span
      className={cn('font-semibold uppercase text-muted-foreground', SETTINGS_UI_TEXT)}
      style={{
        letterSpacing,
        ...(fontSize !== undefined ? { fontSize } : {}),
        ...(color ? { color } : {}),
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export interface MonoProps {
  children: ReactNode;
  /**
   * Typography token key (`'2xs'`, `'xs'`, `'sm'`, …) or a px number for
   * the rare bespoke override. Omit to inherit the chrome default.
   */
  size?: CapsMonoSize | number;
  color?: string;
  style?: CSSProperties;
}

export function Mono({ children, size, color, style }: MonoProps) {
  const fontSize = resolveTypographySize(size);
  return (
    <span
      className={cn('font-mono tabular-nums text-foreground', SETTINGS_UI_TEXT)}
      style={{
        ...(fontSize !== undefined ? { fontSize } : {}),
        ...(color ? { color } : {}),
        ...style,
      }}
    >
      {children}
    </span>
  );
}

// ─── Buttons ──────────────────────────────────────────────────────

export type SharpBtnVariant = 'default' | 'action' | 'ghost' | 'danger';

export interface SharpBtnProps {
  children: ReactNode;
  variant?: SharpBtnVariant;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  style?: CSSProperties;
  'data-testid'?: string;
  type?: 'button' | 'submit';
}

export function SharpBtn({
  children,
  variant = 'default',
  disabled,
  onClick,
  title,
  style,
  type = 'button',
  ...rest
}: SharpBtnProps) {
  return (
    <Button
      type={type}
      onClick={onClick}
      title={title}
      disabled={disabled}
      variant={variant === 'action' ? 'default' : variant === 'danger' ? 'destructive' : 'outline'}
      size="sm"
      data-variant={variant}
      data-testid={rest['data-testid']}
      className={cn(
        'inline-flex h-7 items-center justify-center gap-1.5 rounded-sm px-3.5 font-semibold uppercase tracking-widest shadow-none',
        SETTINGS_UI_TEXT,
        variant === 'ghost' && 'border-transparent bg-transparent hover:bg-muted',
        variant === 'default' && 'border-border bg-background',
      )}
      style={style}
    >
      {children}
    </Button>
  );
}

// ─── Toolbar primitives ──────────────────────────────────────────

export interface TGroupProps {
  children: ReactNode;
  wide?: boolean;
  style?: CSSProperties;
}

export function TGroup({ children, wide, style }: TGroupProps) {
  return (
    <div
      className={
        wide
          ? 'inline-flex items-center gap-2.5 flex-wrap p-2.5 bg-card border border-border rounded-sm'
          : 'inline-flex items-center gap-0.5 px-1 py-0.5 bg-background border border-border rounded-sm'
      }
      style={style}
    >
      {children}
    </div>
  );
}

export interface TBtnProps {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  title?: string;
  width?: number;
  disabled?: boolean;
  'data-testid'?: string;
}

export function TBtn({ active, onClick, children, title, width, disabled, ...rest }: TBtnProps) {
  return (
    <Button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      variant="ghost"
      size="sm"
      aria-pressed={active ? 'true' : undefined}
      className={cn(
        'min-w-8 h-7 inline-flex items-center justify-center bg-transparent text-foreground/85 px-1.5 rounded-sm hover:text-foreground hover:bg-muted aria-pressed:bg-[var(--ds-primary-soft)] aria-pressed:text-[color:var(--ds-primary)] disabled:opacity-45 shadow-none',
        SETTINGS_UI_TEXT,
      )}
      data-testid={rest['data-testid']}
      style={width ? { width } : undefined}
    >
      {children}
    </Button>
  );
}

export function TDivider() {
  // Inset divider sized to controls.xs so it slots cleanly between
  // toolbar buttons regardless of which control tier surrounds it.
  return (
    <span
      className="inline-block w-px bg-border mx-1"
      style={{ height: controls.xs.height }}
      aria-hidden
    />
  );
}

// ─── Numbered band header ────────────────────────────────────────

export interface BandProps {
  /** "01", "02", … Rendered as the mono prefix before the title. */
  index?: string;
  title: string;
  trailing?: ReactNode;
  children?: ReactNode;
  flush?: boolean;
}

export function Band({ index, title, trailing, children, flush }: BandProps) {
  return (
    <section
      className="px-6 pt-4 pb-1"
      style={flush ? { padding: 0 } : undefined}
    >
      <header
        className="flex items-center gap-3 mb-3 select-none"
        style={flush ? { padding: '16px 24px 12px' } : undefined}
      >
        {index && (
          <span className={cn('font-mono text-muted-foreground tabular-nums tracking-[0.06em]', SETTINGS_UI_TEXT)}>
            {index}
          </span>
        )}
        <span className={cn(SETTINGS_SECTION_TITLE, SETTINGS_UI_TEXT)}>
          {title}
        </span>
        <span className="flex-1 h-px bg-border" />
        {trailing}
      </header>
      {children}
    </section>
  );
}

// ─── Meta cell (4-column strip) ──────────────────────────────────

export interface MetaCellProps {
  label: string;
  value: ReactNode;
}

export function MetaCell({ label, value }: MetaCellProps) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <Caps>{label}</Caps>
      <div>{value}</div>
    </div>
  );
}

// ─── Stepper ─────────────────────────────────────────────────────

export interface StepperProps {
  value: string;
  onChange: (v: string) => void;
  width?: number;
  mono?: boolean;
  'data-testid'?: string;
}

export function Stepper({ value, onChange, width = 44, mono = true, ...rest }: StepperProps) {
  // Stepper is a chromeless numeric field embedded in a TGroup — it
  // intentionally strips every default Input visual (border, bg, focus
  // ring, padding) so it reads as a typographic cell, not a form field.
  // Wrapping shadcn `Input` instead of using a raw `<input>` gives us
  // forwardRef + displayName + any future a11y/baseline improvements,
  // while the `className` overrides preserve the original Stepper look.
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      data-testid={rest['data-testid']}
      className={cn(
        'bg-transparent border-none rounded-none p-0 h-auto text-center tabular-nums',
        'focus:ring-0 focus:border-transparent',
        SETTINGS_UI_TEXT,
        mono ? 'font-mono' : 'font-sans',
      )}
      style={{
        width,
        height: controls.sm.height,
      }}
    />
  );
}
