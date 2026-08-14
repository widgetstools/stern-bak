/**
 * GridInfoButton — small ⓘ button that surfaces the grid identity
 * tuple (path, instanceId, gridId, appId, userId) in a popover for
 * support and debugging.
 *
 * View-only. Replaces the legacy hover-to-reveal overlay that used to
 * live in the host shell. Colors come from design-system CSS variables
 * so dark/light theme switching is automatic.
 */

import type { ReactElement } from 'react';
import {
  ChromeButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../customizer/internal.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import { Info } from 'lucide-react';
import { GridInfoContent } from './GridInfoContent';

export interface GridInfoButtonProps {
  readonly componentName: string | undefined;
  readonly gridId: string;
  readonly instanceId: string | undefined;
  readonly appId: string | undefined;
  readonly userId: string | undefined;
  readonly showLeadingDivider?: boolean;
}

export function GridInfoButton({
  componentName,
  gridId,
  instanceId,
  appId,
  userId,
  showLeadingDivider = true,
}: GridInfoButtonProps): ReactElement {
  return (
    <>
      {showLeadingDivider ? <span className="ds-primary-divider" aria-hidden /> : null}
      <Popover>
        <PopoverTrigger asChild>
          <ChromeButton
            type="button"
            className="ds-primary-action"
            title="Grid info"
            aria-label="Grid info"
            data-testid="grid-info-btn"
          >
            <Info size={14} strokeWidth={2} />
          </ChromeButton>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={6}
          className="w-[360px] p-0 text-xs"
          data-ds-settings
        >
          <GridInfoContent
            componentName={componentName}
            gridId={gridId}
            instanceId={instanceId}
            appId={appId}
            userId={userId}
          />
        </PopoverContent>
      </Popover>
    </>
  );
}
