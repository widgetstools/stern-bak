/**
 * StaleDataBanner — flashing header strip shown when live market data
 * is disconnected and grid values may be stale. Rendered above the
 * primary toolbar inside the grid frame.
 */

import type { ReactElement } from 'react';
import { WifiOff } from 'lucide-react';

export interface StaleDataBannerProps {
  readonly message: string;
}

export function StaleDataBanner({ message }: StaleDataBannerProps): ReactElement {
  return (
    <div
      className="ds-stale-data-banner"
      role="status"
      aria-live="polite"
      data-testid="stale-data-banner"
    >
      <WifiOff size={14} strokeWidth={2} aria-hidden />
      <span>{message}</span>
    </div>
  );
}
