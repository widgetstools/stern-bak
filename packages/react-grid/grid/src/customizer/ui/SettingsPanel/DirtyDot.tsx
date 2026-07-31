/**
 * Small status dot — 6×6 filled circle. Three states:
 *   - on + green (default)  — active / ok
 *   - on + amber            — pending / warning
 *   - off                   — muted
 *
 * `DirtyDot` is kept as a BC alias — it now renders a 6px amber dot.
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

export interface DirtyDotProps {
  hidden?: boolean;
  title?: string;
}

export function DirtyDot({ hidden, title = 'Unsaved changes' }: DirtyDotProps) {
  if (hidden) {
    return (
      <span
        aria-hidden
        className="inline-block w-1.5 h-1.5 invisible flex-shrink-0"
      />
    );
  }
  return <LedBar amber on title={title} />;
}
