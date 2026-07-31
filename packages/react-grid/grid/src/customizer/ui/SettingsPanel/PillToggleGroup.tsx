import type { CSSProperties, ReactNode } from 'react';
import { controls } from '@wellsfargo-starui/design-system/tokens';
import { ChromeButton } from '../ChromeButton';

/**
 * Sharp-toggle group — 28×26 butt-joined buttons inside a hairline
 * TGroup shell. Replaces the previous pill-rounded look with the trading
 * terminal's square-edged aesthetic.
 *
 * API kept identical (`PillToggleGroup` + `PillToggleBtn`, same props) so
 * every existing consumer (StyleEditor's TextSection, conditional-styling,
 * etc.) doesn't need a change. Only the painted chrome differs.
 */

export interface PillToggleGroupProps {
  children: ReactNode;
  style?: CSSProperties;
}

export function PillToggleGroup({ children, style }: PillToggleGroupProps) {
  return (
    <div
      role="group"
      className="inline-flex items-center gap-px px-1 py-0.5 bg-background border border-border rounded-sm"
      style={style}
    >
      {children}
    </div>
  );
}

export interface PillToggleBtnProps {
  active?: boolean;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  children: ReactNode;
  style?: CSSProperties;
  'data-testid'?: string;
  'aria-label'?: string;
}

export function PillToggleBtn({
  active,
  onClick,
  title,
  disabled,
  children,
  style,
  ...rest
}: PillToggleBtnProps) {
  return (
    <ChromeButton
      type="button"
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      aria-pressed={active ? 'true' : 'false'}
      aria-label={rest['aria-label'] ?? title}
      title={title}
      disabled={disabled}
      data-testid={rest['data-testid']}
      className="min-w-8 h-7 inline-flex items-center justify-center bg-transparent text-foreground/85 px-1.5 rounded-sm text-[length:var(--ds-font-size-sm)] hover:text-foreground hover:bg-muted aria-pressed:bg-[var(--ds-primary-soft)] aria-pressed:text-[color:var(--ds-primary)] disabled:opacity-45 disabled:cursor-not-allowed"
      style={{
        // 28×26 "butt-joined" sharp toggle. Width is one step wider
        // than the xs tier (24) to give the icon a square-feeling tap
        // target; height snaps to controls.sm so the row aligns with
        // adjacent sm controls (Stepper, etc.).
        width: 28,
        height: controls.sm.height,
        minWidth: 28,
        ...style,
      }}
    >
      {children}
    </ChromeButton>
  );
}
