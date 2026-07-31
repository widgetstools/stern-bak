/**
 * HistoricalViewBanner — header strip shown while the grid displays
 * a past as-of snapshot. Editing is disabled for the session.
 */

import type { ReactElement } from 'react';
import { History } from 'lucide-react';

export interface HistoricalViewBannerProps {
  readonly message: string;
}

export function HistoricalViewBanner({ message }: HistoricalViewBannerProps): ReactElement {
  return (
    <div
      className="ds-historical-view-banner"
      role="status"
      aria-live="polite"
      data-testid="historical-view-banner"
    >
      <History size={14} strokeWidth={2} aria-hidden />
      <span>{message}</span>
    </div>
  );
}
