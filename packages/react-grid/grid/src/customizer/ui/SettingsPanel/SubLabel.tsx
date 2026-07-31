import type { CSSProperties, ReactNode } from 'react';

/**
 * Tracked-out small-caps sub-label used above controls inside an editor band.
 */

export interface SubLabelProps {
  children: ReactNode;
  style?: CSSProperties;
  /** Optional right-side slot (e.g., a "Recommended" badge). */
  action?: ReactNode;
}

export function SubLabel({ children, style, action }: SubLabelProps) {
  return (
    <div
      className="mb-1.5 flex items-baseline justify-between gap-2 text-[length:var(--ds-font-size-sm)] font-semibold uppercase tracking-[0.1em] text-[color:var(--ds-text-muted)]"
      style={style}
    >
      <span>{children}</span>
      {action && <span className="text-[color:var(--ds-text-faint)]">{action}</span>}
    </div>
  );
}
