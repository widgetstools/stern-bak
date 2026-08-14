/**
 * Small status LED — 2×12 filled bar. Three states:
 *   - on + green (default)  — active / ok
 *   - on + amber            — pending / warning
 *   - off                   — muted
 */

export interface LedBarProps {
  on?: boolean;
  amber?: boolean;
  /** Deprecated — kept so older callers don't break. */
  height?: number;
  title?: string;
}

export function LedBar({ on = true, amber, title }: LedBarProps) {
  return (
    <span
      className={[
        'inline-block flex-shrink-0 w-0.5 h-3',
        on
          ? amber
            ? 'bg-warning shadow-[0_0_4px_var(--ds-accent-warning)]'
            : 'bg-success shadow-[0_0_4px_var(--ds-accent-positive)]'
          : 'bg-border',
      ].join(' ')}
      data-on={on ? 'true' : 'false'}
      data-amber={amber ? 'true' : 'false'}
      title={title}
      aria-label={title}
    />
  );
}
