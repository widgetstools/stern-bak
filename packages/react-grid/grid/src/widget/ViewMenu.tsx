/**
 * ViewMenu — a single primary-toolbar dropdown that consolidates the grid's
 * view tools, keeping the toolbar uncluttered. Replaces the four standalone
 * center buttons (Columns, Auto Format, Formatting-toolbar toggle,
 * Editing-toolbar toggle).
 *
 * View-only chrome: actions arrive as props (the formatting/editing toggles
 * keep their open-state + popout-raise behaviour via the same handlers).
 * Auto Format is the one self-contained action — it reaches the live grid via
 * {@link useAutoFormatAction}. Renders nothing when every view feature is
 * disabled, so minimal embeds pay zero chrome.
 *
 * Test-ids match the old standalone buttons (`column-selector-open`,
 * `auto-format-btn`, `style-toolbar-toggle`, `editing-toolbar-toggle`) so the
 * actions stay addressable — they now live inside the menu, reached via
 * `toolbar-view-menu-trigger`.
 */

import { memo, type ReactElement } from 'react';
import { Columns3, Paintbrush, PencilLine, SlidersHorizontal, Wand2 } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@wellsfargo-starui/ui';
import { useAutoFormatAction } from './useAutoFormatAction';

export interface ViewMenuProps {
  readonly showColumnSelector: boolean;
  readonly onOpenColumnSelector: () => void;
  readonly showAutoFormat: boolean;
  readonly showFormattingToolbar: boolean;
  readonly styleToolbarOpen: boolean;
  readonly onToggleStyleToolbar: () => void;
  readonly showEditingToolbar: boolean;
  readonly editingToolbarOpen: boolean;
  readonly onToggleEditingToolbar: () => void;
}

function ViewMenuInner(props: ViewMenuProps): ReactElement | null {
  const {
    showColumnSelector,
    onOpenColumnSelector,
    showAutoFormat,
    showFormattingToolbar,
    styleToolbarOpen,
    onToggleStyleToolbar,
    showEditingToolbar,
    editingToolbarOpen,
    onToggleEditingToolbar,
  } = props;

  const autoFormat = useAutoFormatAction();

  const hasActions = showColumnSelector || showAutoFormat;
  const hasToggles = showFormattingToolbar || showEditingToolbar;
  if (!hasActions && !hasToggles) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ds-primary-action"
          title="View tools"
          aria-label="View tools"
          data-testid="toolbar-view-menu-trigger"
        >
          <SlidersHorizontal size={14} strokeWidth={2} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="fx-menu w-max min-w-0 p-0.5" data-testid="toolbar-view-menu">
        {showColumnSelector ? (
          <DropdownMenuItem
            onSelect={onOpenColumnSelector}
            data-testid="column-selector-open"
            className="gap-1.5 px-2 py-1"
          >
            <Columns3 size={14} strokeWidth={2} className="shrink-0 opacity-80" />
            Columns…
          </DropdownMenuItem>
        ) : null}
        {showAutoFormat ? (
          <DropdownMenuItem
            onSelect={autoFormat.run}
            data-testid="auto-format-btn"
            className="gap-1.5 px-2 py-1"
          >
            <Wand2 size={14} strokeWidth={2} className="shrink-0 opacity-80" />
            Auto Format
          </DropdownMenuItem>
        ) : null}

        {hasActions && hasToggles ? <DropdownMenuSeparator /> : null}

        {showFormattingToolbar ? (
          <DropdownMenuCheckboxItem
            checked={styleToolbarOpen}
            onSelect={() => onToggleStyleToolbar()}
            data-testid="style-toolbar-toggle"
            data-active={styleToolbarOpen ? 'true' : 'false'}
            className="gap-1.5 px-2 py-1"
          >
            <Paintbrush size={14} strokeWidth={2} className="shrink-0 opacity-80" />
            Formatting toolbar
          </DropdownMenuCheckboxItem>
        ) : null}
        {showEditingToolbar ? (
          <DropdownMenuCheckboxItem
            checked={editingToolbarOpen}
            onSelect={() => onToggleEditingToolbar()}
            data-testid="editing-toolbar-toggle"
            data-active={editingToolbarOpen ? 'true' : 'false'}
            className="gap-1.5 px-2 py-1"
          >
            <PencilLine size={14} strokeWidth={2} className="shrink-0 opacity-80" />
            Editing toolbar
          </DropdownMenuCheckboxItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const ViewMenu = memo(ViewMenuInner);
