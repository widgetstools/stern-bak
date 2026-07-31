import type { ReactNode } from 'react';

/**
 * Deprecated in the redesign.
 *
 * The popout shell (`SettingsSheet`) now owns the window chrome (drag
 * title bar, profile/dirty readout, close/maximize) that this component
 * used to paint. Leaving this stub so existing callers don't crash —
 * it renders nothing by default.
 *
 * If a caller still supplies `breadcrumb` / `actions`, they render as a
 * minimal inline strip so the panel isn't broken; no new code should
 * depend on this component.
 */

export interface PanelChromeProps {
  breadcrumb?: ReactNode;
  dirty?: boolean;
  onSave?: () => void;
  actions?: ReactNode;
  'data-testid'?: string;
}

export function PanelChrome({ breadcrumb, actions, ...rest }: PanelChromeProps) {
  if (!breadcrumb && !actions) return null;
  return (
    <div
      data-testid={rest['data-testid']}
      className="flex items-center justify-between px-4 py-2 gap-2.5"
    >
      <div>{breadcrumb}</div>
      <div className="flex items-center gap-1.5">{actions}</div>
    </div>
  );
}
