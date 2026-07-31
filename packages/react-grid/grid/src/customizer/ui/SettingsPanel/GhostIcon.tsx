import type { CSSProperties, ReactNode } from 'react';
import { ChromeButton } from '../ChromeButton';

/**
 * Ghost button — 22×22px sharp-corner, transparent, hover highlight.
 *
 * Slightly smaller than the previous 26px so it sits flush inside the
 * tighter headers and chip rails. No border until hover, rendering as
 * pure affordance without adding chrome weight to the row it belongs to.
 */

export interface GhostIconProps {
  onClick?: () => void;
  title?: string;
  'aria-label'?: string;
  disabled?: boolean;
  children: ReactNode;
  /** Escape hatch for size/color overrides. Use sparingly. */
  style?: CSSProperties;
  'data-testid'?: string;
}

export function GhostIcon({
  onClick,
  title,
  disabled,
  children,
  style,
  ...rest
}: GhostIconProps) {
  return (
    <ChromeButton
      type="button"
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      title={title}
      aria-label={rest['aria-label'] ?? title}
      disabled={disabled}
      data-testid={rest['data-testid']}
      className="inline-flex items-center justify-center flex-shrink-0 w-[22px] h-[22px] rounded-sm p-0 bg-transparent border-none text-foreground/85 hover:text-foreground hover:bg-muted disabled:text-muted-foreground/80 disabled:cursor-not-allowed transition-colors [transition-duration:120ms]"
      style={style}
    >
      {children}
    </ChromeButton>
  );
}
