/**
 * AdminActionButtons — renders the host-supplied `adminActions` as a
 * cluster of icon buttons on the right edge of the primary toolbar.
 *
 * View-only. Each visible action becomes a single icon button with the
 * `id`-derived testid and a native title tooltip showing the action's
 * label + description. End-user grids (no `adminActions`) render
 * nothing — including no leading divider — keeping zero extra chrome.
 */

import type { ReactElement } from 'react';
import { ChromeButton } from '../customizer/index.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import {
  Activity,
  BarChart3,
  Database,
  Eye,
  FileText,
  ListChecks,
  RefreshCw,
  ShieldCheck,
  Terminal,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { AdminAction } from './types';

/** Map of `"lucide:<name>"` to the concrete lucide-react icon component.
 *  Kept inline (rather than dynamic `lucide-react/dist/esm/icons`) to
 *  avoid bundling all 1500+ lucide icons. New entries land here as
 *  needed — `icon: "lucide:<unknown>"` falls back to Wrench. */
const ADMIN_ACTION_ICONS: Record<string, LucideIcon> = {
  'lucide:database':     Database,
  'lucide:file-text':    FileText,
  'lucide:list-checks':  ListChecks,
  'lucide:activity':     Activity,
  'lucide:bar-chart-3':  BarChart3,
  'lucide:shield-check': ShieldCheck,
  'lucide:users':        Users,
  'lucide:terminal':     Terminal,
  'lucide:eye':          Eye,
  'lucide:wrench':       Wrench,
  'lucide:refresh-cw':   RefreshCw,
  'lucide:rotate-cw':    RefreshCw,
};

function resolveAdminActionIcon(ref: string | undefined): LucideIcon {
  if (!ref) return Wrench;
  return ADMIN_ACTION_ICONS[ref] ?? Wrench;
}

export { resolveAdminActionIcon };

export interface AdminActionButtonsProps {
  readonly actions: AdminAction[] | undefined;
}

export function AdminActionButtons({ actions }: AdminActionButtonsProps): ReactElement | null {
  const visible = (actions ?? []).filter((a) => a.visible !== false);
  if (visible.length === 0) return null;

  return (
    <>
      <span className="ds-primary-divider" aria-hidden />
      {visible.map((action) => {
        const Icon = resolveAdminActionIcon(action.icon);
        // Tooltip shows label and description stacked. Native `title`
        // keeps it accessible without portaling a shadcn Tooltip in.
        const title = action.description
          ? `${action.label}\n${action.description}`
          : action.label;
        return (
          <ChromeButton
            key={action.id}
            type="button"
            className="ds-primary-action"
            onClick={() => { void action.onClick(); }}
            title={title}
            aria-label={action.label}
            data-testid={`admin-action-${action.id}`}
          >
            <Icon size={14} strokeWidth={2} />
          </ChromeButton>
        );
      })}
    </>
  );
}
