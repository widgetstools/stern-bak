import type { CSSProperties } from 'react';

export type Side = 'buy' | 'sell';

export interface SideSelectorProps {
  value: Side;
  onChange: (side: Side) => void;
  /** Visual density. */
  size?: 'sm' | 'md';
}

/**
 * Conviction Buy/Sell control — the active side is a SOLID fill in the
 * design-system action colors so the chosen direction is unmistakable on a
 * trading form (the prior subtle toggle was nearly invisible). Inactive side
 * is a muted, recessed surface. Keyboard-focusable with a visible ring.
 */
export function SideSelector({ value, onChange, size = 'md' }: SideSelectorProps) {
  const pad = size === 'sm' ? '6px 0' : '9px 0';
  const fontSize = size === 'sm' ? 'var(--ds-font-size-xs)' : 'var(--ds-font-size-sm)';
  return (
    <div
      role="group"
      aria-label="Order side"
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 2,
        padding: 2,
        borderRadius: 'var(--ds-radius-md)',
        background: 'var(--ds-surface-sunken)',
        border: '1px solid var(--ds-border-primary)',
      }}
    >
      <SideButton side="buy" active={value === 'buy'} onClick={() => onChange('buy')} pad={pad} fontSize={fontSize} />
      <SideButton side="sell" active={value === 'sell'} onClick={() => onChange('sell')} pad={pad} fontSize={fontSize} />
    </div>
  );
}

function SideButton({
  side, active, onClick, pad, fontSize,
}: { side: Side; active: boolean; onClick: () => void; pad: string; fontSize: string }) {
  const activeStyle: CSSProperties = side === 'buy'
    ? { background: 'var(--ds-overlay-positive-soft)', color: 'var(--ds-accent-positive)', boxShadow: 'inset 0 0 0 1px var(--ds-overlay-positive-ring)' }
    : { background: 'var(--ds-overlay-negative-soft)', color: 'var(--ds-accent-negative)', boxShadow: 'inset 0 0 0 1px var(--ds-overlay-negative-ring)' };
  const idleStyle: CSSProperties = { background: 'transparent', color: 'var(--ds-text-muted)' };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ds-state-focus-ring)]"
      style={{
        padding: pad,
        border: 'none',
        borderRadius: 'var(--ds-radius-sm)',
        fontFamily: 'var(--ds-font-sans)',
        fontSize,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        transition: 'background 120ms ease, color 120ms ease',
        ...(active ? activeStyle : idleStyle),
      }}
    >
      {side}
    </button>
  );
}
