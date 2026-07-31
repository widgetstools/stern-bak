/**
 * PrimaryToolbar — the top action row of the grid frame. Renders the
 * editable caption, the FiltersToolbar slot, the
 * formatting-toolbar toggle, the ProfileSelector with its full
 * clone/rename/export/import action set, the save + settings buttons,
 * the host-supplied admin actions cluster, and the grid-info popover.
 *
 * View-only. Receives the controller hook's outputs and the host props
 * via plain props; never calls `useProfileManager`, never touches the
 * AG-Grid API, never touches storage.
 */

import { memo, type ReactElement } from 'react';
import { Save, Check } from 'lucide-react';
import { Button } from '@wellsfargo-starui/ui';
import type { ProfileMeta } from '@wellsfargo-starui/engine';
import type { GridDensity } from '@wellsfargo-starui/design-system/adapters/ag-grid';
import type { AdminAction } from './types';
import { FiltersToolbar } from './FiltersToolbar';
import { QuickSearch } from './QuickSearch';
import { ViewMenu } from './ViewMenu';
import { ProfileSelector } from './ProfileSelector';
import { EditableCaption } from './EditableCaption';
import { AlertsBadge } from '../customizer/modules/alerts';
import { ToolbarDatePicker } from './ToolbarDatePicker';
import {
  PrimaryToolbarInlineActions,
  PrimaryToolbarOverflowMenu,
} from './PrimaryToolbarOverflowMenu';
import { GridDensityPill } from './GridDensityPill';
import type { ProfileSelectorActions } from './useProfileSelectorActions';

export type { ToolbarActionsLayout } from './PrimaryToolbarOverflowMenu';

export interface PrimaryToolbarProps {
  readonly tabsHidden: boolean | undefined;
  readonly caption: string | undefined;
  readonly onCaptionChange: ((next: string) => void) | undefined;
  readonly showFiltersToolbar: boolean;
  readonly showFormattingToolbar: boolean;
  readonly showAutoFormat: boolean;
  readonly styleToolbarOpen: boolean;
  readonly onToggleStyleToolbar: () => void;
  readonly showEditingToolbar: boolean;
  readonly editingToolbarOpen: boolean;
  readonly onToggleEditingToolbar: () => void;
  readonly showColumnSelector: boolean;
  readonly onOpenColumnSelector: () => void;
  readonly showProfileSelector: boolean;
  readonly profileList: readonly ProfileMeta[];
  readonly activeProfileId: string;
  readonly profileActions: ProfileSelectorActions;
  readonly isDirty: boolean;
  readonly showSaveButton: boolean;
  readonly saveFlash: boolean;
  readonly onSaveAll: () => void | Promise<void>;
  readonly showSettingsButton: boolean;
  readonly onOpenSettings: () => void;
  readonly showVisualExcelExport: boolean;
  readonly visualExcelExportEnabled: boolean;
  readonly onExportVisualExcel: () => void;
  readonly adminActions: AdminAction[] | undefined;
  readonly componentName: string | undefined;
  readonly gridId: string;
  readonly instanceId: string | undefined;
  readonly appId: string | undefined;
  readonly userId: string | undefined;
  readonly showToolbarDatePicker: boolean;
  readonly toolbarDate: string;
  readonly onToolbarDateChange: (next: string) => void;
  readonly toolbarDateHistoryEnabled: boolean | undefined;
  readonly toolbarActionsLayout: 'inline' | 'overflow';
  readonly gridDensity: GridDensity;
}

function PrimaryToolbarInner(props: PrimaryToolbarProps): ReactElement {
  const {
    caption,
    onCaptionChange,
    showFiltersToolbar,
    showFormattingToolbar,
    showAutoFormat,
    styleToolbarOpen,
    onToggleStyleToolbar,
    showEditingToolbar,
    editingToolbarOpen,
    onToggleEditingToolbar,
    showColumnSelector,
    onOpenColumnSelector,
    showProfileSelector,
    profileList,
    activeProfileId,
    profileActions,
    isDirty,
    showSaveButton,
    saveFlash,
    onSaveAll,
    showSettingsButton,
    onOpenSettings,
    showVisualExcelExport,
    visualExcelExportEnabled,
    onExportVisualExcel,
    adminActions,
    componentName,
    gridId,
    instanceId,
    appId,
    userId,
    showToolbarDatePicker,
    toolbarDate,
    onToolbarDateChange,
    toolbarDateHistoryEnabled,
    toolbarActionsLayout,
    gridDensity,
  } = props;

  const secondaryActionsProps = {
    showVisualExcelExport,
    visualExcelExportEnabled,
    onExportVisualExcel,
    showSettingsButton,
    onOpenSettings,
    adminActions,
    componentName,
    gridId,
    instanceId,
    appId,
    userId,
    showLeadingDivider: !showToolbarDatePicker,
  };

  return (
    <div className="ds-toolbar-primary ds-primary-row ds-primary-row--with-density">
      <GridDensityPill density={gridDensity} />
      <EditableCaption
        caption={caption && caption.trim() ? caption : 'MarketsGrid'}
        onCaptionChange={onCaptionChange}
      />
      <div className="ds-primary-filters">
        {showFiltersToolbar ? (
          <FiltersToolbar />
        ) : (
          <div className="ds-primary-filters-empty" />
        )}
      </div>

      <div className="ds-primary-actions">
        <QuickSearch />

        <span className="ds-primary-divider" aria-hidden />

        <AlertsBadge />

        {(showProfileSelector || showSaveButton || showToolbarDatePicker) && (
          <div className="ds-primary-profile-cluster">
            {showProfileSelector && (
              <ProfileSelector
                profiles={[...profileList]}
                activeProfileId={activeProfileId}
                isDirty={isDirty}
                onCreate={profileActions.onCreate}
                onLoad={profileActions.onLoad}
                onDelete={profileActions.onDelete}
                onClone={profileActions.onClone}
                onRename={profileActions.onRename}
                onExport={profileActions.onExport}
                onImport={profileActions.onImport}
              />
            )}

            {showSaveButton && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="ds-primary-action ds-primary-save"
                onClick={() => { void onSaveAll(); }}
                title={isDirty ? 'Save all settings (unsaved changes)' : 'Save all settings'}
                data-testid="save-all-btn"
                data-state={saveFlash ? 'saved' : isDirty ? 'dirty' : 'idle'}
              >
                {saveFlash ? <Check size={14} strokeWidth={2.5} /> : <Save size={14} strokeWidth={2} />}
              </Button>
            )}

            {showToolbarDatePicker && (
              <ToolbarDatePicker
                value={toolbarDate}
                onChange={onToolbarDateChange}
                historyEnabled={toolbarDateHistoryEnabled ?? true}
              />
            )}
          </div>
        )}

        <div className="ds-primary-actions-trailing">
          <ViewMenu
            showColumnSelector={showColumnSelector}
            onOpenColumnSelector={onOpenColumnSelector}
            showAutoFormat={showAutoFormat}
            showFormattingToolbar={showFormattingToolbar}
            styleToolbarOpen={styleToolbarOpen}
            onToggleStyleToolbar={onToggleStyleToolbar}
            showEditingToolbar={showEditingToolbar}
            editingToolbarOpen={editingToolbarOpen}
            onToggleEditingToolbar={onToggleEditingToolbar}
          />
          {toolbarActionsLayout === 'inline' ? (
            <PrimaryToolbarInlineActions {...secondaryActionsProps} />
          ) : (
            <PrimaryToolbarOverflowMenu {...secondaryActionsProps} />
          )}
        </div>
      </div>
    </div>
  );
}

function primaryToolbarPropsEqual(prev: PrimaryToolbarProps, next: PrimaryToolbarProps): boolean {
  return (
    prev.tabsHidden === next.tabsHidden
    && prev.caption === next.caption
    && prev.onCaptionChange === next.onCaptionChange
    && prev.showFiltersToolbar === next.showFiltersToolbar
    && prev.showFormattingToolbar === next.showFormattingToolbar
    && prev.showAutoFormat === next.showAutoFormat
    && prev.styleToolbarOpen === next.styleToolbarOpen
    && prev.onToggleStyleToolbar === next.onToggleStyleToolbar
    && prev.showEditingToolbar === next.showEditingToolbar
    && prev.editingToolbarOpen === next.editingToolbarOpen
    && prev.onToggleEditingToolbar === next.onToggleEditingToolbar
    && prev.showColumnSelector === next.showColumnSelector
    && prev.onOpenColumnSelector === next.onOpenColumnSelector
    && prev.showProfileSelector === next.showProfileSelector
    && prev.profileList === next.profileList
    && prev.activeProfileId === next.activeProfileId
    && prev.profileActions === next.profileActions
    && prev.isDirty === next.isDirty
    && prev.showSaveButton === next.showSaveButton
    && prev.saveFlash === next.saveFlash
    && prev.onSaveAll === next.onSaveAll
    && prev.showSettingsButton === next.showSettingsButton
    && prev.onOpenSettings === next.onOpenSettings
    && prev.showVisualExcelExport === next.showVisualExcelExport
    && prev.visualExcelExportEnabled === next.visualExcelExportEnabled
    && prev.onExportVisualExcel === next.onExportVisualExcel
    && prev.adminActions === next.adminActions
    && prev.componentName === next.componentName
    && prev.gridId === next.gridId
    && prev.instanceId === next.instanceId
    && prev.appId === next.appId
    && prev.userId === next.userId
    && prev.showToolbarDatePicker === next.showToolbarDatePicker
    && prev.toolbarDate === next.toolbarDate
    && prev.onToolbarDateChange === next.onToolbarDateChange
    && prev.toolbarDateHistoryEnabled === next.toolbarDateHistoryEnabled
    && prev.toolbarActionsLayout === next.toolbarActionsLayout
    && prev.gridDensity === next.gridDensity
  );
}

export const PrimaryToolbar = memo(PrimaryToolbarInner, primaryToolbarPropsEqual);
