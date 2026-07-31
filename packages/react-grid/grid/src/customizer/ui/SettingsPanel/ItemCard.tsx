import type { ReactNode } from 'react';
import { Trash2, Save, ChevronDown, ChevronRight } from 'lucide-react';
import { DirtyDot } from './DirtyDot';
import { GhostIcon } from './GhostIcon';
import { SharpBtn } from './Cockpit';
import { ChromeButton } from '../ChromeButton';

/**
 * ItemCard — title + body wrapper for callers that render lists of cards
 * (e.g. legacy flat panels). The visual treatment is aligned with the
 * editor's identity strip: title + dirty dot + save + trash.
 *
 * New surfaces prefer `ObjectTitleRow` + numbered `Band`s directly
 * rather than this card, but we keep ItemCard's API intact so nothing
 * breaks during the migration.
 */

export interface ItemCardProps {
  title: ReactNode;
  dirty?: boolean;
  onSave?: () => void;
  onDelete?: () => void;
  actions?: ReactNode;
  saveLabel?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
  /** Hide the body and show only the header strip when true. */
  collapsed?: boolean;
  /** Chevron toggle — when omitted, no toggle is rendered. */
  onToggleCollapsed?: () => void;
  'data-testid'?: string;
  'data-testid-save'?: string;
}

export function ItemCard({
  title,
  dirty,
  onSave,
  onDelete,
  actions,
  saveLabel = 'SAVE',
  style,
  children,
  collapsed,
  onToggleCollapsed,
  ...rest
}: ItemCardProps) {
  const hasBody = children !== undefined && !collapsed;
  const canToggle = onToggleCollapsed !== undefined;

  return (
    <div
      data-testid={rest['data-testid']}
      data-dirty={dirty ? 'true' : 'false'}
      data-collapsed={collapsed ? 'true' : 'false'}
      className="bg-card border border-border rounded-sm mb-2 overflow-hidden"
      style={style}
    >
      <div
        className={[
          'flex items-center gap-2 px-3 py-2 bg-secondary',
          hasBody ? 'border-b border-border' : '',
        ].join(' ')}
      >
        {canToggle && (
          <ChromeButton
            type="button"
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand' : 'Collapse'}
            className="inline-flex items-center justify-center w-5 h-5 bg-transparent border-none text-muted-foreground cursor-pointer p-0 rounded-sm"
          >
            {collapsed ? <ChevronRight size={12} strokeWidth={2.25} /> : <ChevronDown size={12} strokeWidth={2.25} />}
          </ChromeButton>
        )}
        {dirty && <DirtyDot />}
        <div
          className="flex-1 min-w-0 font-sans text-xs font-medium text-foreground overflow-hidden text-ellipsis whitespace-nowrap"
          style={{ cursor: canToggle ? 'pointer' : 'default' }}
          onClick={canToggle ? onToggleCollapsed : undefined}
        >
          {title}
        </div>
        {actions}
        {onSave && (
          <SharpBtn
            variant={dirty ? 'action' : 'ghost'}
            disabled={!dirty}
            onClick={onSave}
            data-testid={rest['data-testid-save']}
          >
            <Save size={11} strokeWidth={2} />
            {saveLabel}
          </SharpBtn>
        )}
        {onDelete && (
          <GhostIcon onClick={onDelete} title="Delete">
            <Trash2 size={13} strokeWidth={1.75} />
          </GhostIcon>
        )}
      </div>
      {hasBody && <div>{children}</div>}
    </div>
  );
}
