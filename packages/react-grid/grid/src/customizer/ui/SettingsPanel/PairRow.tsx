import type { CSSProperties, ReactNode } from 'react';

/**
 * Two-column paired row — the rhythm Figma uses for X/Y, W/H, Size/Weight,
 * Top/Right border specs. Optional trailing slot (for a "link" lock icon
 * between W/H, or an "absolute" toggle).
 *
 * Children are sized with `flex: 1` so both columns share the row equally;
 * pass a fixed-width `style.flex = '0 0 Npx'` on either child to pin.
 */

export interface PairRowProps {
  left: ReactNode;
  right: ReactNode;
  /** Third slot on the right end — e.g. lock/link button. */
  trailing?: ReactNode;
  style?: CSSProperties;
}

export function PairRow({ left, right, trailing, style }: PairRowProps) {
  return (
    <div
      className="flex items-center gap-2 mb-2"
      style={style}
    >
      <div className="flex-1 min-w-0">{left}</div>
      <div className="flex-1 min-w-0">{right}</div>
      {trailing}
    </div>
  );
}
