import {
  EDITING_MODULE_ID,
  type EditingState,
} from '@wellsfargo-starui/core';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@wellsfargo-starui/react';
import { Keyboard } from 'lucide-react';
import { useModuleState } from '../../customizer/hooks/useModuleState';
import {
  EDITING_TOOLBAR_POPOVER,
  EditingToolbarIconButton,
} from './EditingToolbarPrimitives';

export function EditingToolbarKeyboardMenu() {
  const [editing] = useModuleState<EditingState>(EDITING_MODULE_ID);
  const { plusMinus, shortcuts } = editing;

  const plusEnabled = plusMinus.settings.enabled;
  const shortcutsEnabled = shortcuts.settings.enabled;
  const activeNudges = plusMinus.nudges.filter((n) => n.enabled);
  const activeShortcuts = shortcuts.shortcuts.filter((s) => s.enabled);

  if (!plusEnabled && !shortcutsEnabled) return null;
  if (plusEnabled && activeNudges.length === 0 && shortcutsEnabled && activeShortcuts.length === 0) {
    return null;
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <EditingToolbarIconButton
              aria-label="Keyboard shortcuts"
              data-testid="editing-toolbar-keyboard-menu"
            >
              <Keyboard size={14} strokeWidth={2} aria-hidden />
            </EditingToolbarIconButton>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Keyboard shortcuts</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className={cnPopover()}>
        {plusEnabled && activeNudges.length > 0 && (
          <>
            <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
              Plus / Minus
            </DropdownMenuLabel>
            {activeNudges.map((nudge) => (
              <DropdownMenuItem key={nudge.id} disabled className="text-xs opacity-100">
                {nudge.name}
                {' · '}
                +{nudge.incrementStep}
                {' / '}
                −{nudge.decrementStep ?? nudge.incrementStep}
              </DropdownMenuItem>
            ))}
          </>
        )}
        {plusEnabled && activeNudges.length > 0 && shortcutsEnabled && activeShortcuts.length > 0 && (
          <DropdownMenuSeparator />
        )}
        {shortcutsEnabled && activeShortcuts.length > 0 && (
          <>
            <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wide text-[color:var(--ds-text-secondary)]">
              Shortcuts
            </DropdownMenuLabel>
            {activeShortcuts.map((shortcut) => (
              <DropdownMenuItem key={shortcut.id} disabled className="text-xs opacity-100">
                {shortcut.name}
                {' · '}
                {shortcut.shortcutKey.toUpperCase()}
                {' → '}
                {shortcut.operation}
                {' '}
                {shortcut.shortcutValue}
              </DropdownMenuItem>
            ))}
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled className="text-[10px] text-[color:var(--ds-text-muted)]">
          Configure in Settings
          {plusEnabled && shortcutsEnabled
            ? ' → Plus / Minus / Shortcuts'
            : plusEnabled
              ? ' → Plus / Minus'
              : ' → Shortcuts'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function cnPopover() {
  return `${EDITING_TOOLBAR_POPOVER} ds-sheet-v2 w-72`;
}
