/**
 * PrimaryToolbarOverflowMenu — collapses infrequent toolbar actions into
 * a single ⋯ menu so the primary row stays compact (export, settings,
 * admin actions, grid info).
 */

import { useCallback, useState, type ReactElement } from 'react';
import { applyTheme } from '@wellsfargo-starui/design-system';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@wellsfargo-starui/ui';
import {
  FileSpreadsheet,
  Info,
  Moon,
  MoreVertical,
  Settings as SettingsIcon,
  Sun,
} from 'lucide-react';
import type { AdminAction } from './types';
import { AdminActionButtons, resolveAdminActionIcon } from './AdminActionButtons';
import { ChromeButton, useActiveThemeMode } from '../customizer/index.js'; // relative on purpose (self-reference breaks the dist build + risks barrel cycles)
import { GridInfoButton } from './GridInfoButton';
import { GridInfoContent } from './GridInfoContent';
import { preloadSettingsSheet } from './LazySettingsSheet';

export type ToolbarActionsLayout = 'inline' | 'overflow';

export interface PrimaryToolbarSecondaryActionsProps {
  readonly showVisualExcelExport: boolean;
  readonly visualExcelExportEnabled: boolean;
  readonly onExportVisualExcel: () => void;
  readonly showSettingsButton: boolean;
  readonly onOpenSettings: () => void;
  readonly adminActions: AdminAction[] | undefined;
  readonly componentName: string | undefined;
  readonly gridId: string;
  readonly instanceId: string | undefined;
  readonly appId: string | undefined;
  readonly userId: string | undefined;
  /** When false, skip the leading vertical rule (e.g. after the date picker). */
  readonly showLeadingDivider?: boolean;
}

export function PrimaryToolbarOverflowMenu(
  props: PrimaryToolbarSecondaryActionsProps,
): ReactElement {
  const adminVisible = (props.adminActions ?? []).filter((a) => a.visible !== false);
  const showExcel = props.showVisualExcelExport && props.visualExcelExportEnabled;
  const showLeadingDivider = props.showLeadingDivider ?? true;

  return (
    <OverflowMenu
      {...props}
      adminVisible={adminVisible}
      showExcel={showExcel}
      showLeadingDivider={showLeadingDivider}
    />
  );
}

function gridInfoProps(props: PrimaryToolbarSecondaryActionsProps) {
  return {
    componentName: props.componentName,
    gridId: props.gridId,
    instanceId: props.instanceId,
    appId: props.appId,
    userId: props.userId,
  };
}

function OverflowMenu({
  showExcel,
  onExportVisualExcel,
  showSettingsButton,
  onOpenSettings,
  adminVisible,
  componentName,
  gridId,
  instanceId,
  appId,
  userId,
  showLeadingDivider,
}: PrimaryToolbarSecondaryActionsProps & {
  adminVisible: AdminAction[];
  showExcel: boolean;
  showLeadingDivider: boolean;
}): ReactElement {
  const [infoOpen, setInfoOpen] = useState(false);
  const hasActionItems = showExcel || showSettingsButton || adminVisible.length > 0;

  return (
    <>
      {showLeadingDivider ? <span className="ds-primary-divider" aria-hidden /> : null}
      <DropdownMenu
        onOpenChange={(open) => {
          // Strong intent signal: the menu containing "Grid settings" just
          // opened — warm the sheet chunk during the user's read time.
          if (open && showSettingsButton) preloadSettingsSheet();
        }}
      >
        <DropdownMenuTrigger asChild>
          <ChromeButton
            type="button"
            className="ds-primary-action"
            title="More actions"
            aria-label="More actions"
            data-testid="toolbar-more-menu-trigger"
          >
            <MoreVertical size={14} strokeWidth={2} />
          </ChromeButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="fx-menu w-max min-w-0 p-0.5">
          {showExcel ? (
            <DropdownMenuItem
              onSelect={onExportVisualExcel}
              data-testid="visual-excel-export-btn"
              className="gap-1.5 px-2 py-1"
            >
              <FileSpreadsheet size={14} strokeWidth={2} className="shrink-0 opacity-80" />
              Export to Excel
            </DropdownMenuItem>
          ) : null}
          {showSettingsButton ? (
            <DropdownMenuItem
              onSelect={onOpenSettings}
              data-testid="v2-settings-open-btn"
              className="gap-1.5 px-2 py-1"
            >
              <SettingsIcon size={14} strokeWidth={2} className="shrink-0 opacity-80" />
              Grid settings
            </DropdownMenuItem>
          ) : null}
          {adminVisible.length > 0 && (showExcel || showSettingsButton) ? (
            <DropdownMenuSeparator />
          ) : null}
          {adminVisible.map((action) => {
            const Icon = resolveAdminActionIcon(action.icon);
            const title = action.description
              ? `${action.label}\n${action.description}`
              : action.label;
            return (
              <DropdownMenuItem
                key={action.id}
                onSelect={() => { void action.onClick(); }}
                title={title}
                data-testid={`admin-action-${action.id}`}
                className="gap-1.5 px-2 py-1"
              >
                <Icon size={14} strokeWidth={2} className="shrink-0 opacity-80" />
                {action.label}
              </DropdownMenuItem>
            );
          })}
          {hasActionItems ? <DropdownMenuSeparator /> : null}
          <ThemeToggleMenuItem />
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => setInfoOpen(true)}
            data-testid="grid-info-btn"
            className="gap-1.5 px-2 py-1"
          >
            <Info size={14} strokeWidth={2} className="shrink-0 opacity-80" />
            Grid info
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-w-md p-0 text-xs" data-ds-settings>
          <DialogHeader className="sr-only">
            <DialogTitle>Grid info</DialogTitle>
          </DialogHeader>
          <GridInfoContent
            componentName={componentName}
            gridId={gridId}
            instanceId={instanceId}
            appId={appId}
            userId={userId}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function ThemeToggleMenuItem(): ReactElement {
  const mode = useActiveThemeMode();
  const isDark = mode === 'dark';

  const handleSelect = useCallback(() => {
    applyTheme({ theme: isDark ? 'light' : 'dark' });
  }, [isDark]);

  return (
    <DropdownMenuItem
      onSelect={handleSelect}
      data-testid="toolbar-theme-toggle"
      className="gap-1.5 px-2 py-1"
    >
      {isDark ? (
        <Sun size={14} strokeWidth={2} className="shrink-0 opacity-80" />
      ) : (
        <Moon size={14} strokeWidth={2} className="shrink-0 opacity-80" />
      )}
      {isDark ? 'Light theme' : 'Dark theme'}
    </DropdownMenuItem>
  );
}

/** Inline icon cluster — opt-in via `toolbarActionsLayout="inline"`. */
export function PrimaryToolbarInlineActions(
  props: PrimaryToolbarSecondaryActionsProps,
): ReactElement {
  const showLeadingDivider = props.showLeadingDivider ?? true;

  return (
    <>
      {props.showVisualExcelExport && props.visualExcelExportEnabled ? (
        <>
          {showLeadingDivider ? <span className="ds-primary-divider" aria-hidden /> : null}
          <ChromeButton
            type="button"
            className="ds-primary-action"
            onClick={props.onExportVisualExcel}
            title="Export to Excel (preserves formatting)"
            data-testid="visual-excel-export-btn"
            aria-label="Export to Excel"
          >
            <FileSpreadsheet size={14} strokeWidth={2} />
          </ChromeButton>
        </>
      ) : null}

      {props.showSettingsButton ? (
        <>
          {(props.showVisualExcelExport && props.visualExcelExportEnabled) || showLeadingDivider ? (
            <span className="ds-primary-divider" aria-hidden />
          ) : null}
          <ChromeButton
            type="button"
            className="ds-primary-action"
            onClick={props.onOpenSettings}
            onPointerEnter={preloadSettingsSheet}
            title="Open settings"
            data-testid="v2-settings-open-btn"
          >
            <SettingsIcon size={14} strokeWidth={2} />
          </ChromeButton>
        </>
      ) : null}

      <AdminActionButtons actions={props.adminActions} />
      <GridInfoButton {...gridInfoProps(props)} />
    </>
  );
}
